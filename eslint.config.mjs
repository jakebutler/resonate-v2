import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Auth helper consistency (2026-09-14 architecture review §b6): direct
    // identity reads are only allowed in the shared helper module, so a
    // divergent requireUserId copy can never silently reappear.
    files: ["convex/**/*.ts"],
    ignores: ["convex/_generated/**", "convex/campaignAccess.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='getUserIdentity']",
          message: "Use requireUserId/requireBrandAccess from ./campaignAccess instead of reading ctx.auth directly.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "convex/_generated/**",
    "coverage/**",
    ".next/**",
    ".worktrees/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
