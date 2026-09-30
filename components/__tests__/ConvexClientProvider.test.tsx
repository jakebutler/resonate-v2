import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";

const mockUseAuth = vi.fn();
let fixtureAuth: { fetchAccessToken: () => Promise<string | null> };
const mockConvexProviderWithClerk = vi.fn(
  ({ children }: { children: React.ReactNode }) => (
    <div data-testid="convex-provider">{children}</div>
  )
);
const mockConvexProviderWithAuth = vi.fn(
  ({ children }: { children: React.ReactNode }) => (
    <div data-testid="convex-provider-auth">{children}</div>
  )
);

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("convex/react", () => ({
  ConvexReactClient: class MockConvexReactClient {},
  ConvexProviderWithAuth: (props: { children: React.ReactNode; useAuth: () => typeof fixtureAuth }) => {
    fixtureAuth = props.useAuth();
    return mockConvexProviderWithAuth(props);
  },
}));

vi.mock("convex/react-clerk", () => ({
  ConvexProviderWithClerk: (props: { children: React.ReactNode }) =>
    mockConvexProviderWithClerk(props),
}));

describe("ConvexClientProvider", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    mockConvexProviderWithClerk.mockClear();
    mockConvexProviderWithAuth.mockClear();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("gets a short-lived local fixture identity only in an explicit development rehearsal", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_VISUAL_FIXTURE_TOKEN_URL", "http://127.0.0.1:3969/token");
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "local-fixture-jwt" }) });
    vi.stubGlobal("fetch", fetch);
    render(<ConvexClientProvider bypassAuth url="http://127.0.0.1:3210">fixture</ConvexClientProvider>);
    await waitFor(() => expect(fixtureAuth).toBeDefined());
    expect(await fixtureAuth.fetchAccessToken()).toBe("local-fixture-jwt");
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3969/token", expect.objectContaining({ cache: "no-store" }));
  });

  it("wraps children with ConvexProviderWithClerk using Clerk auth", () => {
    mockUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      getToken: vi.fn(),
      orgId: null,
      orgRole: null,
    });

    render(
      <ConvexClientProvider url="https://example.convex.cloud">
        <div>child</div>
      </ConvexClientProvider>
    );

    expect(screen.getByTestId("convex-provider")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(mockConvexProviderWithClerk).toHaveBeenCalledOnce();
  });

  it("uses an auth-capable provider under E2E bypass", () => {
    render(
      <ConvexClientProvider bypassAuth url="https://example.convex.cloud">
        <div>child</div>
      </ConvexClientProvider>
    );

    expect(screen.getByTestId("convex-provider-auth")).toBeInTheDocument();
    expect(mockConvexProviderWithAuth).toHaveBeenCalledOnce();
    expect(mockConvexProviderWithClerk).not.toHaveBeenCalled();
  });
});
