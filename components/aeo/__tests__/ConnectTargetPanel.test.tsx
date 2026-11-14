import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ConnectTargetPanel,
  partitionCompetitorUrls,
} from "@/components/aeo/ConnectTargetPanel";
import type { Loadable } from "@/components/aeo/types";

const noTarget: Loadable<null> = { status: "ready", data: null };

const fill = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), {
    target: { value },
  });
};

describe("partitionCompetitorUrls", () => {
  it("splits on whitespace and commas", () => {
    expect(partitionCompetitorUrls("https://a.com, https://b.com")).toEqual({
      valid: ["https://a.com", "https://b.com"],
      invalid: [],
    });
  });

  it("rejects scheme-less entries that would otherwise flow into crawl runs", () => {
    expect(partitionCompetitorUrls("competitor-a https://b.com")).toEqual({
      valid: ["https://b.com"],
      invalid: ["competitor-a"],
    });
  });
});

describe("ConnectTargetPanel competitor URL validation", () => {
  it("blocks submit and shows a visible alert when an entry has no scheme/host", () => {
    const onSubmit = vi.fn();
    render(
      <ConnectTargetPanel brandName="FreshProof" target={noTarget} onConnect={onSubmit} />
    );

    fill("Target site URL", "https://example.com");
    fill("Competitor URLs", "competitor-a, https://b.com");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/competitor-a/);
    expect(alert).toHaveTextContent(/full URLs starting with/);
    const submit = screen.getByRole("button", { name: "Connect target" });
    expect(submit).toBeDisabled();

    // Even a forced submit is refused: nothing raw reaches the mutation.
    fireEvent.click(submit);
    fireEvent.submit(screen.getByLabelText("Connect target form"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits only full URLs when every entry is valid", () => {
    const onSubmit = vi.fn();
    render(
      <ConnectTargetPanel brandName="FreshProof" target={noTarget} onConnect={onSubmit} />
    );

    fill("Target site URL", "https://example.com");
    fill("Competitor URLs", "https://competitor-a.com, https://competitor-b.com");
    fireEvent.submit(screen.getByLabelText("Connect target form"));

    expect(onSubmit).toHaveBeenCalledWith({
      siteUrl: "https://example.com",
      competitorUrls: ["https://competitor-a.com", "https://competitor-b.com"],
    });
  });

  it("keeps the empty competitor field valid — competitors are optional", () => {
    const onSubmit = vi.fn();
    render(
      <ConnectTargetPanel brandName="FreshProof" target={noTarget} onConnect={onSubmit} />
    );

    fill("Target site URL", "https://example.com");
    fireEvent.submit(screen.getByLabelText("Connect target form"));

    expect(onSubmit).toHaveBeenCalledWith({
      siteUrl: "https://example.com",
      competitorUrls: [],
    });
  });
});
