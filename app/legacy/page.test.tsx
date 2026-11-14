import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="clerk-user-button" />,
}));
vi.mock("@/components/Calendar/Calendar", () => ({
  Calendar: () => <div data-testid="calendar" />,
}));
vi.mock("@/components/LinkedInPostEditor/LinkedInPostEditor", () => ({
  LinkedInPostEditor: () => <div data-testid="post-editor" />,
}));
vi.mock("@/components/CreatePostModal/CreatePostModal", () => ({
  CreatePostModal: () => <div data-testid="create-modal" />,
}));
vi.mock("@/components/ContentLibrary/ContentLibrary", () => ({
  ContentLibrary: () => <div data-testid="content-library" />,
}));
vi.mock("@/components/WorkflowBoard/WorkflowBoard", () => ({
  WorkflowBoard: () => <div data-testid="workflow-board" />,
}));
vi.mock("convex/react", () => ({ useQuery: vi.fn(() => []) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
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

async function importDashboard() {
  return await import("@/app/legacy/page");
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

describe("legacy dashboard E2E_BYPASS_AUTH failsafe", () => {
  it("renders the bypass dashboard shell when the bypass is enabled in dev", async () => {
    stubBypass();
    const { default: Dashboard } = await importDashboard();
    render(<Dashboard />);
    expect(screen.getByText("Open workspace")).toBeDefined();
    expect(screen.getByText("Auth bypass")).toBeDefined();
    expect(screen.queryByTestId("clerk-user-button")).toBeNull();
  });

  it("renders the real dashboard when the bypass flag is unset", async () => {
    stubBypass();
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    const { default: Dashboard } = await importDashboard();
    render(<Dashboard />);
    expect(screen.getByTestId("calendar")).toBeDefined();
    expect(screen.getByTestId("clerk-user-button")).toBeDefined();
  });

  it("fails closed to the real dashboard when VERCEL_ENV is production", async () => {
    stubBypass();
    vi.stubEnv("VERCEL_ENV", "production");
    const { default: Dashboard } = await importDashboard();
    render(<Dashboard />);
    expect(screen.getByTestId("clerk-user-button")).toBeDefined();
    expect(screen.queryByText("Open workspace")).toBeNull();
  });

  it("fails closed to the real dashboard when the server points at the production Convex deployment", async () => {
    stubBypass();
    vi.stubEnv("CONVEX_CLOUD_URL", "https://healthy-platypus-553.convex.cloud");
    const { default: Dashboard } = await importDashboard();
    render(<Dashboard />);
    expect(screen.queryByText("Open workspace")).toBeNull();
  });
});
