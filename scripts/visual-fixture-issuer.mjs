#!/usr/bin/env node
import { createServer } from "node:http";
import { generateKeyPairSync, randomUUID, sign, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

export const FIXTURE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURE_CONVEX_URL = "http://127.0.0.1:3210";
export const FIXTURE_DEPLOYMENT = "anonymous-agent";
export const FIXTURE_ISSUER = "http://127.0.0.1:3969";
export const FIXTURE_NEXT_ORIGIN = "http://127.0.0.1:3170";
export const FIXTURE_SUBJECT = "visual-rehearsal-only";

export function assertLocalFixtureTarget({ deployment, url, deployKey, selfHostedUrl }) {
  if (deployment !== `anonymous:${FIXTURE_DEPLOYMENT}` || url !== FIXTURE_CONVEX_URL || deployKey || selfHostedUrl) {
    throw new Error("LOCAL_FIXTURE_TARGET_REJECTED");
  }
  const parsed = new URL(url);
  if (parsed.origin !== FIXTURE_CONVEX_URL || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("LOCAL_FIXTURE_TARGET_REJECTED");
  }
}

export async function verifyLocalFixtureTarget() {
  const envFile = await readFile(resolve(FIXTURE_ROOT, ".env.local"), "utf8");
  let sharedEnv = "";
  try { sharedEnv = await readFile(resolve(FIXTURE_ROOT, ".env"), "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  assertFixtureCredentialOverridesAbsent([envFile, sharedEnv], process.env);
  const field = name => {
    const match = envFile.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`, "m"));
    return match?.[1].trim().replace(/^['"]|['"]$/g, "");
  };
  const env = process.env;
  assertLocalFixtureTarget({
    deployment: env.CONVEX_DEPLOYMENT ?? field("CONVEX_DEPLOYMENT"),
    url: env.NEXT_PUBLIC_CONVEX_URL ?? field("NEXT_PUBLIC_CONVEX_URL"),
    deployKey: env.CONVEX_DEPLOY_KEY || field("CONVEX_DEPLOY_KEY"),
    selfHostedUrl: env.CONVEX_SELF_HOSTED_URL || field("CONVEX_SELF_HOSTED_URL"),
  });
  const localConfig = JSON.parse(await readFile(resolve(FIXTURE_ROOT, ".convex/local/default/config.json"), "utf8"));
  assertFixtureLocalConfig(localConfig);
  // Recheck the actual local instance before issuing auth or touching fixture data.
  const response = await fetch(`${FIXTURE_CONVEX_URL}/instance_name`, { redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok || (await response.text()).trim() !== FIXTURE_DEPLOYMENT) throw new Error("LOCAL_FIXTURE_INSTANCE_REJECTED");
}

export function assertFixtureLocalConfig(config) {
  if (config.deploymentName !== FIXTURE_DEPLOYMENT || config.ports?.cloud !== 3210 || config.ports?.site !== 3211) {
    throw new Error("LOCAL_FIXTURE_CLI_TARGET_REJECTED");
  }
}

export function assertFixtureCredentialOverridesAbsent(documents, environment) {
  const forbidden = name => name.startsWith("CONVEX_") && (name.endsWith("_KEY") || name.endsWith("_TOKEN") || name.endsWith("_URL") || name === "CONVEX_URL" || name === "CONVEX_PROVISION_HOST" || name.startsWith("CONVEX_SELF_HOSTED_"));
  if (Object.entries(environment).some(([name, value]) => forbidden(name) && value)) throw new Error("LOCAL_FIXTURE_CREDENTIAL_OVERRIDE_REJECTED");
  for (const document of documents) {
    const seen = new Set();
    for (const match of document.matchAll(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/gm)) {
      if (seen.has(match[1])) throw new Error("LOCAL_FIXTURE_DUPLICATE_ENVIRONMENT_REJECTED");
      seen.add(match[1]);
      if (forbidden(match[1]) && match[2].trim().replace(/^['"]|['"]$/g, "")) throw new Error("LOCAL_FIXTURE_CREDENTIAL_OVERRIDE_REJECTED");
    }
  }
}

export function createFixtureTokenIssuer() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = randomUUID();
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" };
  const issue = () => {
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const signingInput = `${encode({ alg: "RS256", typ: "JWT", kid })}.${encode({ iss: FIXTURE_ISSUER, sub: FIXTURE_SUBJECT, aud: "convex", iat: now, exp: now + 120, name: "Local fictional visual rehearsal" })}`;
    return `${signingInput}.${sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url")}`;
  };
  return { jwk, issue, publicKey };
}

export function fixtureRequestAllowed(host, origin) {
  return host === "127.0.0.1:3969" && (origin === undefined || origin === FIXTURE_NEXT_ORIGIN);
}

async function serve() {
  await verifyLocalFixtureTarget();
  const issuer = createFixtureTokenIssuer();
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    if (!fixtureRequestAllowed(req.headers.host, req.headers.origin)) {
      res.writeHead(403).end('{"error":"local origin rejected"}');
      return;
    }
    if (req.headers.origin === FIXTURE_NEXT_ORIGIN) {
      res.setHeader("Access-Control-Allow-Origin", FIXTURE_NEXT_ORIGIN);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    if (req.method !== "GET") { res.writeHead(405).end('{"error":"GET only"}'); return; }
    const requestUrl = new URL(req.url, FIXTURE_ISSUER);
    if (requestUrl.search) { res.writeHead(400).end('{"error":"no request parameters accepted"}'); return; }
    if (requestUrl.pathname === "/.well-known/openid-configuration") {
      res.end(JSON.stringify({ issuer: FIXTURE_ISSUER, jwks_uri: `${FIXTURE_ISSUER}/.well-known/jwks.json`, response_types_supported: ["id_token"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"] }));
    } else if (["/.well-known/jwks.json", "/jwks.json"].includes(requestUrl.pathname)) {
      res.end(JSON.stringify({ keys: [issuer.jwk] }));
    } else if (requestUrl.pathname === "/token") {
      try {
        await verifyLocalFixtureTarget();
        res.end(JSON.stringify({ token: issuer.issue(), expiresIn: 120, subject: FIXTURE_SUBJECT, fixture: true }));
      } catch { res.writeHead(503).end('{"error":"local instance verification failed"}'); }
    } else { res.writeHead(404).end('{"error":"not found"}'); }
  });
  server.on("error", () => { console.error("LOCAL_FIXTURE_ISSUER_BIND_FAILED"); process.exitCode = 1; });
  server.listen(3969, "127.0.0.1", () => console.log("Fictional local-only issuer listening on 127.0.0.1:3969. Tokens and private keys are never logged or saved."));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(() => process.exit(0)));
}

export function fixtureIssuerSelfTest() {
  assert.throws(() => assertFixtureCredentialOverridesAbsent(["CONVEX_DEPLOYMENT=anonymous:anonymous-agent\nCONVEX_DEPLOYMENT=prod:other"], {}));
  assert.throws(() => assertFixtureCredentialOverridesAbsent(["NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210\nexport NEXT_PUBLIC_CONVEX_URL=https://other.convex.cloud"], {}));
  for (const name of ["CONVEX_OVERRIDE_ACCESS_TOKEN", "CONVEX_PROVISION_HOST", "CONVEX_URL", "CONVEX_CUSTOM_URL"]) assert.throws(() => assertFixtureCredentialOverridesAbsent([], { [name]: "fictional-override" }));
  assert.doesNotThrow(() => assertFixtureLocalConfig({ deploymentName: FIXTURE_DEPLOYMENT, ports: { cloud: 3210, site: 3211 } }));
  assert.throws(() => assertFixtureLocalConfig({ deploymentName: FIXTURE_DEPLOYMENT, ports: { cloud: 3220, site: 3211 } }));
  assert.throws(() => assertFixtureLocalConfig({ deploymentName: "local-another-project", ports: { cloud: 3210, site: 3211 } }));
  for (const text of ["export CONVEX_DEPLOY_KEY=fixture-key", "  CONVEX_DEPLOY_KEY = 'fixture-key'", "CONVEX_SELF_HOSTED_ADMIN_KEY=fixture-key", "CONVEX_SELF_HOSTED_URL=http://fixture"]) assert.throws(() => assertFixtureCredentialOverridesAbsent([text], {}));
  assert.throws(() => assertFixtureCredentialOverridesAbsent([], { CONVEX_DEPLOY_KEY: "fixture-key" }));
  assert.doesNotThrow(() => assertFixtureCredentialOverridesAbsent(["CONVEX_DEPLOYMENT=anonymous:anonymous-agent"], {}));
  assert.doesNotThrow(() => assertLocalFixtureTarget({ deployment: "anonymous:anonymous-agent", url: FIXTURE_CONVEX_URL }));
  for (const url of ["https://cloud.convex.cloud", "http://localhost:3210", "http://127.0.0.1:3211", "http://127.0.0.1:3210/path", "http://user@127.0.0.1:3210"]) assert.throws(() => assertLocalFixtureTarget({ deployment: "anonymous:anonymous-agent", url }));
  assert.throws(() => assertLocalFixtureTarget({ deployment: "prod:anonymous-agent", url: FIXTURE_CONVEX_URL }));
  assert.throws(() => assertLocalFixtureTarget({ deployment: "anonymous:anonymous-agent", url: FIXTURE_CONVEX_URL, deployKey: "fictional-rejected-value" }));
  assert.equal(fixtureRequestAllowed("127.0.0.1:3969", FIXTURE_NEXT_ORIGIN), true);
  assert.equal(fixtureRequestAllowed("evil.example:3969", FIXTURE_NEXT_ORIGIN), false);
  assert.equal(fixtureRequestAllowed("127.0.0.1:3969", "https://evil.example"), false);
  const issuer = createFixtureTokenIssuer();
  const token = issuer.issue();
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.equal(claims.sub, FIXTURE_SUBJECT);
  assert.equal(claims.aud, "convex");
  assert.equal(claims.exp - claims.iat, 120);
  assert.equal(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), issuer.publicKey, Buffer.from(signature, "base64url")), true);
  assert.equal(Object.hasOwn(issuer.jwk, "d"), false);
  console.log("Local fixture issuer offline guards and ephemeral token tests passed. No server or database was started.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.length !== 1 || !["--serve", "--self-test", "--check"].includes(args[0])) throw new Error("LOCAL_FIXTURE_ARGUMENTS_REJECTED");
    if (args[0] === "--self-test") fixtureIssuerSelfTest();
    else if (args[0] === "--check") { await verifyLocalFixtureTarget(); console.log("Verified anonymous-agent at exactly http://127.0.0.1:3210."); }
    else await serve();
  } catch { console.error("Local fixture issuer rejected arguments, target, or unavailable instance. No retry was attempted."); process.exitCode = 1; }
}
