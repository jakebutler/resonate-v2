import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { clerkProviderEntries, convexProviderProps } = vi.hoisted(() => ({
  clerkProviderEntries: [] as number[],
  convexProviderProps: [] as Array<{ bypassAuth?: boolean }>,
}));

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist" }),
  Inter: () => ({ variable: "--font-inter" }),
}));
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => {
    clerkProviderEntries.push(1);
    // A fragment, not a div: RootLayout renders the document <html>, which
    // jsdom drops when nested inside a wrapper element.
    return <>{children}</>;
  },
}));
vi.mock("@/components/ConvexClientProvider", () => ({
  ConvexClientProvider: (props: { bypassAuth?: boolean }) => {
    convexProviderProps.push(props);
    return null;
  },
}));

async function importLayout() {
  return await import("@/app/layout");
}

function stubBypass(nextPublic = "") {
  vi.stubEnv("E2E_BYPASS_AUTH", "1");
  // Direct assignment for the NEXT_PUBLIC spelling: vi.stubEnv on this key
  // does not reliably reach the helper's process.env read under vitest 4.
  process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH = nextPublic;
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("CONVEX_CLOUD_URL", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  delete process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH;
  clerkProviderEntries.length = 0;
  convexProviderProps.length = 0;
});

describe("root layout E2E_BYPASS_AUTH failsafe", () => {
  it("passes bypassAuth to the Convex provider and skips Clerk when the bypass is enabled in dev", async () => {
    stubBypass();
    const { default: RootLayout } = await importLayout();
    render(<RootLayout>content</RootLayout>);
    expect(clerkProviderEntries).toHaveLength(0);
    expect(convexProviderProps).toEqual([expect.objectContaining({ bypassAuth: true })]);
  });

  it("honors the NEXT_PUBLIC flag spelling alone", async () => {
    stubBypass("1");
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    const { default: RootLayout } = await importLayout();
    render(<RootLayout>content</RootLayout>);
    expect(clerkProviderEntries).toHaveLength(0);
    expect(convexProviderProps).toEqual([expect.objectContaining({ bypassAuth: true })]);
  });

  it("requires Clerk when the bypass flag is unset", async () => {
    stubBypass();
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
    const { default: RootLayout } = await importLayout();
    render(<RootLayout>content</RootLayout>);
    expect(clerkProviderEntries).toHaveLength(1);
    expect(convexProviderProps).toEqual([expect.objectContaining({ bypassAuth: false })]);
  });

  it("fails closed to Clerk when VERCEL_ENV is production", async () => {
    stubBypass();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
    const { default: RootLayout } = await importLayout();
    render(<RootLayout>content</RootLayout>);
    expect(clerkProviderEntries).toHaveLength(1);
    expect(convexProviderProps).toEqual([expect.objectContaining({ bypassAuth: false })]);
  });

  it("fails closed to Clerk when the server points at the production Convex deployment", async () => {
    stubBypass();
    vi.stubEnv("CONVEX_CLOUD_URL", "https://healthy-platypus-553.convex.cloud");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
    const { default: RootLayout } = await importLayout();
    render(<RootLayout>content</RootLayout>);
    expect(clerkProviderEntries).toHaveLength(1);
    expect(convexProviderProps).toEqual([expect.objectContaining({ bypassAuth: false })]);
  });
});
