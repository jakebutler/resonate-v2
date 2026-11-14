import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="clerk-user-button" />,
}));
vi.mock(
  "next/link",
  () =>
    ({
      default: ({
        href,
        children,
        ...rest
      }: {
        href: string;
        children: React.ReactNode;
        [key: string]: unknown;
      }) => (
        <a href={href} {...rest}>
          {children}
        </a>
      ),
    }) as const
);

async function importShell() {
  return await import("@/components/shell/Shell");
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

describe("Shell E2E_BYPASS_AUTH failsafe", () => {
  it("renders the bypass indicator instead of the Clerk control when the bypass is enabled in dev", async () => {
    stubBypass();
    const { Shell } = await importShell();
    render(<Shell activeSurface="calendar">content</Shell>);
    expect(screen.getByLabelText("Signed in (E2E bypass)")).toBeDefined();
    expect(screen.queryByTestId("clerk-user-button")).toBeNull();
  });

  it("renders the Clerk control when the bypass flag is unset", async () => {
    stubBypass();
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    const { Shell } = await importShell();
    render(<Shell activeSurface="calendar">content</Shell>);
    expect(screen.getByTestId("clerk-user-button")).toBeDefined();
  });

  it("fails closed to the Clerk control when VERCEL_ENV is production", async () => {
    stubBypass();
    vi.stubEnv("VERCEL_ENV", "production");
    const { Shell } = await importShell();
    render(<Shell activeSurface="calendar">content</Shell>);
    expect(screen.getByTestId("clerk-user-button")).toBeDefined();
    expect(screen.queryByLabelText("Signed in (E2E bypass)")).toBeNull();
  });

  it("fails closed to the Clerk control when the server points at the production Convex deployment", async () => {
    stubBypass();
    vi.stubEnv("CONVEX_CLOUD_URL", "https://healthy-platypus-553.convex.cloud");
    const { Shell } = await importShell();
    render(<Shell activeSurface="calendar">content</Shell>);
    expect(screen.queryByLabelText("Signed in (E2E bypass)")).toBeNull();
  });
});
