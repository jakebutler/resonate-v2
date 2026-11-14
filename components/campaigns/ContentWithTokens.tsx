const TOKEN_PATTERN = /(\[[A-Z]+:[^\]]*\])/g;
const PLACEHOLDER_LABEL = "Placeholder — generated copy goes here";

/**
 * Renders draft content with bracketed placeholder tokens as labeled
 * containers instead of bare mono-tint spans, so reviewers can tell
 * scaffolding ("Placeholder — generated copy goes here") from final copy.
 */
export function ContentWithTokens({ content }: { content: string }) {
  return content.split(TOKEN_PATTERN).map((part, index) => {
    if (/^\[[A-Z]+:/.test(part)) {
      return (
        <span
          key={index}
          aria-label={PLACEHOLDER_LABEL}
          title={PLACEHOLDER_LABEL}
          className="inline-flex items-center gap-1.5 rounded border border-[#ff7d00]/40 bg-[#ffefe0] px-1.5 py-0.5 align-baseline"
          data-testid="placeholder-token"
        >
          <span className="font-sans text-[10px] font-medium uppercase tracking-wide text-[#8a4b00]">
            Placeholder
          </span>
          <span className="font-mono text-[11px] text-[#8a4b00]">{part}</span>
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export { TOKEN_PATTERN as draftTokenPattern, PLACEHOLDER_LABEL as placeholderTokenLabel };
