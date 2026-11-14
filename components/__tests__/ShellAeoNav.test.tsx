import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <span aria-label="Clerk user">U</span>,
}));

import { Shell } from "@/components/shell/Shell";

describe("Shell aeo-seo surface navigation", () => {
  it("marks the AEO/SEO link current on the aeo-seo surface", () => {
    render(
      <Shell activeSurface="aeo-seo">
        <p>workspace</p>
      </Shell>
    );
    const link = screen.getByRole("link", { name: "AEO/SEO" });
    expect(link).toHaveAttribute("href", "/aeo");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("leaves the AEO/SEO link inactive on other surfaces", () => {
    render(
      <Shell activeSurface="calendar">
        <p>workspace</p>
      </Shell>
    );
    const link = screen.getByRole("link", { name: "AEO/SEO" });
    expect(link).not.toHaveAttribute("aria-current");
  });
});
