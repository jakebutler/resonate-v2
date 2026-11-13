import type { Page } from "@playwright/test";
import { mockConvexSync, type SyncHandlers } from "../mockConvexSync";

export type SyncFixture<T> = {
  handlers: SyncHandlers;
  /**
   * Test-facing handle: call counters and state setters the spec drives
   * (e.g. to flip a fixture into its stale/expired variant). Omitted by
   * stateless fixtures.
   */
  fixture?: T;
};

/**
 * Factory signature for named sync fixtures. Receives the page so a fixture
 * can also mock its REST routes (e.g. blog export); sync-channel attachment
 * itself stays centralized in mockSyncFixture.
 */
export type SyncFixtureFactory<T> = (
  page: Page,
) => SyncFixture<T> | Promise<SyncFixture<T>>;

// Factories produce fresh state per use; the registry itself stays stateless.
const registry = new Map<string, SyncFixtureFactory<never>>();

export function registerSyncFixture<T>(
  name: string,
  factory: SyncFixtureFactory<T>,
): void {
  if (registry.has(name))
    throw new Error(`Sync fixture already registered: ${name}`);
  registry.set(name, factory as SyncFixtureFactory<never>);
}

/** Fixture names, in registration order — these are the manifest references. */
export function listSyncFixtureNames(): string[] {
  return [...registry.keys()].sort();
}

/**
 * Attach the named sync fixture to the page and return its handle.
 * Fixture names are the stable identifiers a verification manifest cites,
 * so an unknown name is a hard error, never a silent fallback.
 */
export async function mockSyncFixture<T>(page: Page, name: string): Promise<T> {
  const factory = registry.get(name);
  if (!factory)
    throw new Error(
      `Unknown sync fixture: ${name} (registered: ${listSyncFixtureNames().join(", ")})`,
    );
  const { handlers, fixture } = await (factory as SyncFixtureFactory<T>)(page);
  await mockConvexSync(page, handlers);
  return fixture as T;
}
