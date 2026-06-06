import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import IdeasRoute from "@/app/ideas/page";

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/IdeasPage/IdeasPage", () => ({
  IdeasPage: () => <div data-testid="ideas-page">Ideas page</div>,
}));

describe("/ideas", () => {
  it("renders the ideas page shell", () => {
    render(<IdeasRoute />);
    expect(screen.getByTestId("ideas-page")).toBeInTheDocument();
  });

  it("renders the current app header", () => {
    render(<IdeasRoute />);
    expect(screen.getByText("Resonate")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reconfigure" })).toBeInTheDocument();
    expect(screen.getByTestId("user-button")).toBeInTheDocument();
  });
});
