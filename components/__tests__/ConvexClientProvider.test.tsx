import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";

const mockUseAuth = vi.fn();
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
  ConvexProviderWithAuth: (props: { children: React.ReactNode }) =>
    mockConvexProviderWithAuth(props),
}));

vi.mock("convex/react-clerk", () => ({
  ConvexProviderWithClerk: (props: { children: React.ReactNode }) =>
    mockConvexProviderWithClerk(props),
}));

describe("ConvexClientProvider", () => {
  beforeEach(() => {
    mockConvexProviderWithClerk.mockClear();
    mockConvexProviderWithAuth.mockClear();
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
