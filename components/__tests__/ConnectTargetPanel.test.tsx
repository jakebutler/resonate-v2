import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectTargetPanel } from "@/components/aeo/ConnectTargetPanel";
import type { BrandTarget } from "@/components/aeo/types";

const connectedTarget: BrandTarget = {
  siteUrl: "https://freshproof.example.com",
  productIdentifiers: ["FreshProof GLP-1 tracker"],
  competitorUrls: ["https://competitor-a.com"],
  connections: {
    firecrawl: { state: "valid", detail: "Key accepted" },
    answerEngine: { state: "unvalidated" },
  },
  reviewPinned: false,
};

describe("ConnectTargetPanel", () => {
  it("renders a loading skeleton while the target record arrives", () => {
    render(
      <ConnectTargetPanel
        brandName="FreshProof"
        target={{ status: "loading" }}
      />,
    );
    expect(screen.getByRole("status", { name: "Loading target connection" })).toBeInTheDocument();
  });

  it("renders the error with a working retry", () => {
    const onRetry = vi.fn();
    render(
      <ConnectTargetPanel
        brandName="FreshProof"
        target={{ status: "error", message: "Target lookup failed", onRetry }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Target lookup failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders the connect form with validation when no target is connected", () => {
    const onConnect = vi.fn();
    render(
      <ConnectTargetPanel
        brandName="FreshProof"
        target={{ status: "ready", data: null }}
        onConnect={onConnect}
      />,
    );
    const submit = screen.getByRole("button", { name: "Connect target" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Target site URL"), {
      target: { value: "not-a-url" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/full URL/);

    fireEvent.change(screen.getByLabelText("Target site URL"), {
      target: { value: "https://freshproof.example.com" },
    });
    fireEvent.change(screen.getByLabelText("Competitor URLs"), {
      target: { value: "https://a.com, https://b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect target" }));
    expect(onConnect).toHaveBeenCalledWith({
      siteUrl: "https://freshproof.example.com",
      competitorUrls: ["https://a.com", "https://b.com"],
    });
  });

  it("holds an unpinned connected target on review and pins on demand", () => {
    const onPinReview = vi.fn();
    render(
      <ConnectTargetPanel
        brandName="FreshProof"
        target={{ status: "ready", data: connectedTarget }}
        onPinReview={onPinReview}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/Review required/);
    fireEvent.click(screen.getByRole("button", { name: "Pin review" }));
    expect(onPinReview).toHaveBeenCalledOnce();
  });

  it("shows provider validation states and no dead per-provider Validate buttons", () => {
    render(
      <ConnectTargetPanel
        brandName="FreshProof"
        target={{ status: "ready", data: connectedTarget }}
      />,
    );
    expect(screen.getByLabelText("Validated connection")).toBeInTheDocument();
    expect(screen.getByLabelText("Not validated connection")).toBeInTheDocument();
    // Validation is server-driven and happens at connect time; there is no
    // per-provider check a client button could run, so none renders.
    expect(screen.queryByRole("button", { name: "Validate" })).not.toBeInTheDocument();
  });

  it("shows the pinned badge once review is pinned", () => {
    render(
      <ConnectTargetPanel
        brandName="FreshProof"
        target={{
          status: "ready",
          data: { ...connectedTarget, reviewPinned: true },
        }}
      />,
    );
    expect(screen.getByLabelText("Review pinned")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
