import { z } from "zod";

/**
 * Per-feature readiness manifest schema (spec deliverable V1).
 *
 * A manifest declares what "feature X is ready" means: the criteria to run
 * (each on the existing test ladder), the qualification tier of each
 * criterion's evidence, the fixtures and prerequisites each requires, and the
 * ordering between criteria. The runner (`lib/verificationRunner.ts`) reads
 * nothing else.
 */

export const VERIFICATION_RUNNER_TYPES = [
  "vitest",
  "convex-test",
  "playwright",
  "contract",
] as const;

export const VERIFICATION_TIERS = [
  "offline-fixture",
  "offline-contract",
  "live-receipt",
] as const;

export type VerificationRunnerType = (typeof VERIFICATION_RUNNER_TYPES)[number];
export type VerificationTier = (typeof VERIFICATION_TIERS)[number];

const kebabCase = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9.-]*$/, {
    message: "must be kebab-case (lowercase letters, digits, dots, dashes)",
  });

export const verificationFixtureSchema = z.object({
  name: kebabCase,
  /** Module path (relative to repo root) the runner loads the fixture from. */
  module: z.string().min(1),
  description: z.string().optional(),
});

export const verificationCriterionSchema = z.object({
  id: kebabCase,
  name: z.string().min(1),
  runner: z.enum(VERIFICATION_RUNNER_TYPES),
  /** Qualification vocabulary carried over from the editorial-visuals contract. */
  tier: z.enum(VERIFICATION_TIERS),
  /**
   * What the runner executes against: a test-file path for vitest /
   * convex-test / playwright criteria, or the command string for contract
   * criteria.
   */
  target: z.string().min(1),
  /** Overrides the runner type's default command (argv, whitespace-split). */
  command: z.string().min(1).optional(),
  /** Names of fixtures (from `fixtures`) this criterion loads. */
  fixtures: z.array(kebabCase).default([]),
  /**
   * Named prerequisites that must exist before the criterion can run (e.g.
   * provider-key env vars). A live-receipt criterion must name at least one.
   */
  prerequisites: z.array(z.string().min(1)).default([]),
  /** Criterion ids that must PASS before this criterion runs. */
  dependsOn: z.array(kebabCase).default([]),
  description: z.string().optional(),
});

export const verificationManifestSchema = z
  .object({
    featureId: kebabCase,
    name: z.string().min(1),
    description: z.string().optional(),
    fixtures: z.array(verificationFixtureSchema).default([]),
    criteria: z.array(verificationCriterionSchema).min(1, {
      message: "a manifest declares at least one criterion",
    }),
  })
  .superRefine((manifest, ctx) => {
    const criterionIds = new Set<string>();

    manifest.criteria.forEach((criterion, index) => {
      const at = (reason: string) => ({ path: ["criteria", index, reason] as (string | number)[] });

      if (criterionIds.has(criterion.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          ...at("id"),
          message: `duplicate criterion id "${criterion.id}"`,
        });
      }
      criterionIds.add(criterion.id);

      if (criterion.runner === "contract" && criterion.command === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          ...at("command"),
          message: `contract criterion "${criterion.id}" requires an explicit command`,
        });
      }

      if (criterion.tier === "live-receipt" && criterion.prerequisites.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          ...at("prerequisites"),
          message: `live-receipt criterion "${criterion.id}" must name the prerequisite it is gated on (e.g. a provider key)`,
        });
      }
    });

    const fixtureNames = new Set(manifest.fixtures.map((fixture) => fixture.name));

    manifest.criteria.forEach((criterion, index) => {
      criterion.fixtures.forEach((fixtureName, fixtureIndex) => {
        if (!fixtureNames.has(fixtureName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["criteria", index, "fixtures", fixtureIndex],
            message: `criterion "${criterion.id}" references unknown fixture "${fixtureName}"`,
          });
        }
      });

      criterion.dependsOn.forEach((depId, depIndex) => {
        if (depId === criterion.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["criteria", index, "dependsOn", depIndex],
            message: `criterion "${criterion.id}" depends on itself`,
          });
          return;
        }
        const known = manifest.criteria.some((other) => other.id === depId);
        if (!known) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["criteria", index, "dependsOn", depIndex],
            message: `criterion "${criterion.id}" depends on unknown criterion "${depId}"`,
          });
        }
      });
    });
  });

export type VerificationFixture = z.infer<typeof verificationFixtureSchema>;
export type VerificationCriterion = z.infer<typeof verificationCriterionSchema>;
export type VerificationManifest = z.infer<typeof verificationManifestSchema>;

/** Parses and cross-validates a manifest, rejecting it with named errors. */
export function parseVerificationManifest(json: unknown): VerificationManifest {
  return verificationManifestSchema.parse(json);
}

/** Renders a ZodError from manifest parsing as a named, reviewer-readable list. */
export function formatManifestIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const location = issue.path.length > 0 ? issue.path.join(".") : "(manifest)";
    return `${location}: ${issue.message}`;
  });
}
