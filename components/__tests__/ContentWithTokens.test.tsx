import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentWithTokens } from "@/components/campaigns/ContentWithTokens";

describe("ContentWithTokens", () => {
  it("renders plain content as a single run with no token wrappers", () => {
    render(<ContentWithTokens content="No placeholders here." />);
    expect(screen.queryAllByTestId("placeholder-token")).toHaveLength(0);
    expect(screen.getByText("No placeholders here.")).toBeDefined();
  });

  it("renders text between tokens as plain text nodes", () => {
    const { container } = render(
      <ContentWithTokens content={"Lead sentence. [ANGLE: sharpen] Closing sentence."} />
    );
    const token = container.querySelector('[data-testid="placeholder-token"]');
    expect(token).not.toBeNull();
    // The untokenized prose must stay directly in the flow, not swallowed
    // into the token container.
    expect(container.textContent).toContain("Lead sentence.");
    expect(container.textContent).toContain("Closing sentence.");
  });

  it("wraps each token in a labeled container, not a bare span", () => {
    render(
      <ContentWithTokens
        content={"[THESIS: the core claim] then [EVIDENCE: corpus://corvo/c1#excerpt-1]."}
      />
    );
    const tokens = screen.getAllByTestId("placeholder-token");
    expect(tokens).toHaveLength(2);
    for (const token of tokens) {
      expect(token.getAttribute("aria-label")).toBe(
        "Placeholder — generated copy goes here"
      );
      expect(token.getAttribute("title")).toBe(
        "Placeholder — generated copy goes here"
      );
    }
    expect(tokens[0]!.textContent).toContain("[THESIS: the core claim]");
    expect(tokens[1]!.textContent).toContain("[EVIDENCE: corpus://corvo/c1#excerpt-1]");
  });

  it("keeps empty content empty without crashing", () => {
    const { container } = render(<ContentWithTokens content="" />);
    expect(container.textContent).toBe("");
  });
});
