import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="clerk-user-button" />,
}));
vi.mock("@/components/IdeasPage/IdeasPage", () => ({
  IdeasPage: () => <div data-testid="ideas-page" />,
}));
vi.mock(
  "next/link",
  () =>
    ({
      default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
      ),
    }) as const
);

async function importIdeasRoute() {
  return await import("@/app/ideas/page");
}

function stubBypass() {
  vi.stubEnv("E2E_BYPASS_AUTH", "1");
  vi.stubEnv("NEXT_PUBLIC_E2E_BYPASS_AUTH", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("CONVEX_CLOUD_URL", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("ideas route E2E_BYPASS_AUTH failsafe", () => {
  it("renders the local verification shell when the bypass is enabled in dev", async () => {
    stubBypass();
    const { default: IdeasRoute } = await importIdeasRoute();
    render(<IdeasRoute />);
    expect(screen.getByText("Legacy ideas route is still mounted.")).toBeDefined();
    expect(screen.getByText("Auth bypass")).toBeDefined();
    expect(screen.queryByTestId("ideas-page")).toBeNull();
  });

  it("renders the authenticated experience when the bypass flag is unset", async () => {
    stubBypass();
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    const { default: IdeasRoute } = await importIdeasRoute();
    render(<IdeasRoute />);
    expect(screen.getByTestId("ideas-page")).toBeDefined();
    expect(screen.getByTestId("clerk-user-button")).toBeDefined();
  });

  it("fails closed to the authenticated experience when VERCEL_ENV is production", async () => {
    stubBypass();
    vi.stubEnv("VERCEL_ENV", "production");
    const { default: IdeasRoute } = await importIdeasRoute();
    render(<IdeasRoute />);
    expect(screen.getByTestId("ideas-page")).toBeDefined();
    expect(screen.queryByText("Legacy ideas route is still mounted.")).toBeNull();
  });

  it("fails closed to the authenticated experience when the server points at the production Convex deployment", async () => {
    stubBypass();
    vi.stubEnv("CONVEX_CLOUD_URL", "https://healthy-platypus-553.convex.cloud");
    const { default: IdeasRoute } = await importIdeasRoute();
    render(<IdeasRoute />);
    expect(screen.queryByText("Legacy ideas route is still mounted.")).toBeNull();
  });
});
