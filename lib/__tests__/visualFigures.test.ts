// @vitest-environment node
import { describe, expect, it } from "vitest";
import { planFigureCandidates, assertFigureEvidence, renderFigureSvg, figureSignatures, parseFigureSource, assertFigureCurrentArticle, buildFigureMarkdownBlock, assertFigureInsertionAnchor, assertFigureMarkdownBlockPlacement } from "../visualFigures";

const citedNumeric = (content: string) => content.split("\n").map(line => line.trim().startsWith("|") ? line + (line.includes("| value |") ? " citation |" : /^\|[-:| ]+\|$/u.test(line) ? "---|" : " Evaluation report, Table 2 |") : line).join("\n");

describe("evidence-bound figures", () => {
  it("refuses unsupported context wrapper tags ignored by HTML fragment parsing", () => {
    const table = "| from | to | relation |\n|---|---|---|\n| Hidden | Editor | unseen feedback |";
    for (const tag of ["tr", "td", "thead", "html", "head", "body", "frameset"]) {
      const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const,
        content: `<!-- preceding comment --> <${tag} hidden>\n\n## Hidden\n\n${table}\n\n</${tag}>` };
      expect(planFigureCandidates(source, []).candidates, tag).toEqual([]);
      expect(() => assertFigureInsertionAnchor(source.content, "## Hidden")).toThrow(/structure|top-level/);
    }
  });

  it("fails closed on incomplete HTML tags whose swallowed source has no emitted element location", () => {
    const table = "| from | to | relation |\n|---|---|---|\n| Hidden | Editor | unseen feedback |";
    for (const open of ["<div hidden", '<div title="unfinished']) {
      const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const,
        content: `${open}\n\n## Hidden\n\n${table}` };
      expect(planFigureCandidates(source, []).candidates, open).toEqual([]);
      expect(() => assertFigureInsertionAnchor(source.content, "## Hidden")).toThrow(/structure|top-level/);
    }
  });

  it("does not mistake a closed HTML prefix for containment of a following hidden MDX expression", () => {
    const table = "| from | to | relation |\n|---|---|---|\n| Hidden | Editor | unseen feedback |";
    for (const prefix of ["<!-- closed -->", "<br>", "<span>closed</span>"]) {
      const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const,
        content: `## Appendix\n\n${prefix} {false && (\n\n${table}\n\n)}` };
      expect(planFigureCandidates(source, []).candidates, prefix).toEqual([]);
    }
  });

  it("preserves UTF-16 evidence offsets and visible data after real HTML closure in a substantial article", () => {
    const table = "| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |";
    const prose = Array.from({ length: 160 }, (_, index) => `Paragraph ${index}: ${"Ordinary article copy 🚦 with visible discussion. ".repeat(8)}`).join("\n\n");
    const content = `${prose}\n\n\`\`\`markdown\n<div hidden>🚦\n\`\`\`\n\n<!-- opening --> <div hidden>\n<script>const sample = {closed: false};</script>\n\n## Hidden\n\n${table.replace("Reader", "Hidden")}\n\n</div>\n\n## Visible\n\n${table}`;
    const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content };
    const plan = planFigureCandidates(source, []);
    expect(plan.candidates).toHaveLength(1);
    const spec = plan.candidates[0];
    expect(spec.rows).toEqual([["Reader", "Editor", "sends feedback"]]);
    expect(spec.insertionAnchor).toBe("## Visible");
    expect(spec.evidence.every(span => content.slice(span.start, span.end) === span.text)).toBe(true);
    expect(() => assertFigureInsertionAnchor(content, spec.insertionAnchor)).not.toThrow();
    expect(() => assertFigureCurrentArticle(spec, content)).not.toThrow();
  });

  it("omits unusable table anchors across all five families while retaining corroborated headed tables", () => {
    const tables = [
      citedNumeric("| label | value | unit | population | denominator |\n|---|---|---|---|---|\n| Alpha | 12 | cases | Set | 80 |\n| Beta | 20 | cases | Set | 80 |"),
      citedNumeric("| date | value | unit | population | denominator |\n|---|---|---|---|---|\n| 2026-01-01 | 12 | cases | Set | 80 |\n| 2026-02-01 | 20 | cases | Set | 80 |"),
      "| from | to | relation |\n|---|---|---|\n| Reader | Editor | feedback |",
      "| order | from | to | message |\n|---|---|---|---|\n| 1 | Reader | Editor | feedback |",
      "| date | event |\n|---|---|\n| 2026-01-01 | Draft |\n| 2026-02-01 | Review |",
    ];
    for (const [index, table] of tables.entries()) {
      const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content: table };
      const trace = { ...source, id: "trace", purpose: "claim-trace" as const };
      const omitted = planFigureCandidates(source, [trace]);
      expect(omitted.candidates).toEqual([]);
      expect(omitted.reasons.join(" ")).toMatch(/safe insertion anchor/);
      const headed = { ...source, content: `## Evidence ${index}\n\n${table}` };
      const usable = planFigureCandidates(headed, [trace]);
      expect(usable.candidates).toHaveLength(1);
      expect(() => assertFigureInsertionAnchor(headed.content, usable.candidates[0].insertionAnchor)).not.toThrow();
    }
  });

  it("requires the exact canonical source-note paragraph to end at EOF or a blank line", () => {
    const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const,
      content: "## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | feedback |" };
    const spec = planFigureCandidates(source, []).candidates[0];
    const block = buildFigureMarkdownBlock("figure1", spec);
    const prefix = `## Flow\n\n${block}`;
    for (const suffix of ["", "\n", "\n\nUnrelated prose.", "\r\n\t \r\nUnrelated prose."]) {
      expect(() => assertFigureMarkdownBlockPlacement(prefix + suffix, spec.insertionAnchor, block)).not.toThrow();
    }
    for (const suffix of [" APPENDED TEXT", "<!-- hidden suffix -->", "\nUnreviewed continuation.", "\r\nUnreviewed continuation."]) {
      expect(() => assertFigureMarkdownBlockPlacement(prefix + suffix, spec.insertionAnchor, block)).toThrow(/source-note|placement/);
    }
  });

  it("masks nested raw HTML through outer closure, including comments, quoted tags and multiline attributes", () => {
    const table = "| from | to | relation |\n|---|---|---|\n| Hidden | Editor | unseen feedback |";
    for (const inner of [
      "<div>\n</div>",
      '<section data-close="</div>">\n</section>',
      '<div\n data-close="</div>">\n</div>',
      "<!-- </div> -->",
      '<script>\nconst sample = "</div>";\n</script>',
    ]) {
      const hidden = `## Appendix\n\n<div hidden><!-- raw block -->\n${inner}\n\n${table}\n\n</div>`;
      const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content: hidden };
      expect(planFigureCandidates(source, []).candidates, inner).toEqual([]);
      expect(() => assertFigureInsertionAnchor(hidden, table)).toThrow(/structure|top-level/);
      const visible = planFigureCandidates({ ...source, content: `${hidden}\n\n## Visible\n\n${table.replace("Hidden", "Reader")}` }, []);
      expect(visible.candidates, inner).toHaveLength(1);
      expect(visible.candidates[0].rows[0][0]).toBe("Reader");
    }
  });

  it("refuses hidden MDX module declarations as evidence and insertion regions", () => {
    const table = "| from | to | relation |\n|---|---|---|\n| Hidden | Reader | sends feedback |";
    for (const opening of ["export const example = `", "import example from `"]) {
      const content = `## Appendix\n\n${opening}\n\n${table}\n\n\``;
      const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content };
      expect(planFigureCandidates(source, []).candidates).toEqual([]);
      expect(() => assertFigureInsertionAnchor(content, opening)).toThrow(/structure|top-level/);
    }
  });
  it("does not recover a chained MDX expression on a comment terminator inside a template string", () => {
    const table = "| from | to | relation |\n|---|---|---|\n| Hidden | Reader | sends feedback |";
    const content = `## Appendix\n\n{/* one */} {"prefix" + \`\n\nliteral */ }\n\n${table}\n\n\`}`;
    const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content };
    expect(planFigureCandidates(source, []).candidates).toEqual([]);
    expect(() => assertFigureInsertionAnchor(content, "literal */ }")).toThrow(/structure|top-level/);
  });
  it("excludes hidden MDX comments and expression blocks from evidence and insertion anchors", () => {
    const table = "| from | to | relation |\n|---|---|---|\n| Hidden | Reader | sends feedback |";
    for (const [open, close] of [["{/*", "*/}"], ["{false && (", ")}"]]) {
      const content = `## Appendix\n\n${open}\n\n${table}\n\n${close}`;
      const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content };
      expect(planFigureCandidates(source, []).candidates).toEqual([]);
      expect(() => assertFigureInsertionAnchor(content, open)).toThrow(/structure|top-level/);
      expect(planFigureCandidates({ ...source, content: `${content}\n\n## Visible\n\n${table}` }, []).candidates).toHaveLength(open === "{/*" ? 1 : 0);
    }
  });
  it("never recovers hidden MDX evidence by counting braces inside comments or quoted strings", () => {
    const table = "| from | to | relation |\n|---|---|---|\n| Hidden | Reader | sends feedback |";
    for (const [open, close] of [["{ /* hidden } brace", "*/ }"], ['{"}" + `', '`}'], ['{"{/* */}" + `', '`}'], ['{/* Closed comment */} {"}" + `', '`}']]) {
      const content = `## Appendix\n\n${open}\n\n${table}\n\n${close}`;
      const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content };
      expect(planFigureCandidates(source, []).candidates).toEqual([]);
      expect(() => assertFigureInsertionAnchor(content, open)).toThrow(/structure|top-level/);
    }
  });
  it("excludes processing instructions, declarations and CDATA until their exact HTML terminator", () => {
    const table = "| from | to | relation |\n|---|---|---|\n| Hidden | Reader | unseen relation |";
    for (const [open, close] of [["<?hidden", "?>"], ["<!DOCTYPE hidden [", "]>"], ["<![CDATA[", "]]>"]]) {
      const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content: `${open}\n${table}\n${close}` };
      expect(planFigureCandidates(source, []).candidates).toEqual([]);
      expect(planFigureCandidates({ ...source, content: source.content + `\n\n## Visible\n\n${table}` }, []).candidates).toHaveLength(1);
      expect(() => assertFigureInsertionAnchor(source.content, open)).toThrow(/structure|top-level/);
    }
  });
  it("shares literal MDX-safe insertion and current article evidence proof without relying on shifted archive offsets", () => {
    const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content: "## Flow\n\n| from | to | relation | citation |\n|---|---|---|---|\n| Reader < editor | Editor | sends feedback | Report version |" };
    const spec = planFigureCandidates(source, []).candidates[0];
    const literalSpec = { ...spec, presentation: { ...spec.presentation, alt: "Reader {test} < editor", sourceNote: "Report {version}" } };
    const block = buildFigureMarkdownBlock("figure1", literalSpec);
    expect(block).toContain("&#123;test&#125; &lt; editor");
    expect(block).toContain("Report &#123;version&#125;");
    expect(block).not.toContain("{test}");
    const current = "Unrelated introduction\n\n" + source.content.replace("## Flow", "## Flow\n\n" + block + "\n\n");
    expect(() => assertFigureCurrentArticle(spec, current)).not.toThrow();
    expect(assertFigureInsertionAnchor(current, "## Flow")).toBe(current.indexOf("## Flow") + "## Flow".length);
    expect(() => assertFigureCurrentArticle(spec, current.replace("sends feedback |", "causes approval |"))).toThrow(/evidence changed/);
  });

  it("rejects inline Markdown, HTML and entities whose rendered table cells differ from their literal text", () => {
    for (const label of ["Reader {1 + 1}", "Reader {test}", "m<sup>2</sup>", "AT&amp;T", "A\\*B", "~~Beta~~", "Reader *editor*", "Reader _editor_", "[Source](https://example.com)", "`Editor`", "Hidden\rnew line"]) {
      const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content: `## Flow\n\n| from | to | relation |\n|---|---|---|\n| ${label} | Editor | sends feedback |` };
      expect(planFigureCandidates(source, []).candidates, label).toEqual([]);
    }
  });

  it("rejects partial diagram citations rather than attributing uncited rows to the cited source", () => {
    for (const table of ["| from | to | relation | citation |\n|---|---|---|---|\n| Reader | Editor | feedback | Report |\n| Editor | Draft | revision | |", "| order | from | to | message | citation |\n|---|---|---|---|---|\n| 1 | Reader | Editor | feedback | Report |\n| 2 | Editor | Reader | reply | |", "| date | event | citation |\n|---|---|---|\n| 2026-01-01 | Draft | Report |\n| 2026-02-01 | Review | |"] ) {
      const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content: "## Evidence\n\n" + table };
      expect(planFigureCandidates(source, []).candidates).toEqual([]);
      expect(planFigureCandidates({ ...source, content: source.content.replace("| Report |", "| |") }, []).candidates).toHaveLength(1);
      expect(planFigureCandidates({ ...source, content: source.content.replace(/\| \|$/u, "| Report |") }, []).candidates).toHaveLength(1);
    }
  });

  it("preserves astral labels at the SVG truncation boundary without invalid XML surrogates", () => {
    const label = "A".repeat(28) + "🚦" + " repeated label";
    const article = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content: `## Flow\n\n| from | to | relation |\n|---|---|---|\n| ${label} | Editor | sends feedback |` };
    const svg = renderFigureSvg(planFigureCandidates(article, []).candidates[0]);
    expect(svg).toContain("A".repeat(28) + "🚦…");
    expect([...svg].every(char => !/^[\uD800-\uDFFF]$/u.test(char))).toBe(true);
  });

  it("requires publishable numeric citations and never exposes internal evidence filenames", () => {
    const bare = "| label | value | unit | population | denominator |\n|---|---|---|---|---|\n| A | 12 | cases | Set | 80 |\n| B | 20 | cases | Set | 80 |";
    const article = { id: "a", name: "Article draft", format: "markdown" as const, purpose: "article" as const, content: "## Results\n\n" + bare };
    expect(planFigureCandidates(article, [], { requireClaimTrace: false }).candidates).toEqual([]);
    const cited = bare.split("\n").map((line, i) => line + (i === 0 ? " citation |" : i === 1 ? "---|" : " Evaluation report, Table 2 | ")).join("\n");
    const main = { ...article, content: "## Results\n\n" + cited };
    const trace = { ...main, id: "trace", name: "internal-secret-claim-trace.md", purpose: "claim-trace" as const };
    const spec = planFigureCandidates(main, [trace]).candidates[0];
    expect(spec.presentation.sourceNote).toBe("Source: Evaluation report, Table 2.");
    expect(spec.presentation.sourceNote).not.toContain(trace.name);
    expect(planFigureCandidates({ ...main, content: main.content.replace("Evaluation report, Table 2", "") }, [], { requireClaimTrace: false }).candidates).toEqual([]);
  });

  it("uses contiguous table contexts when headers repeat and excludes represented evidence before the combined limit", () => {
    const tables = ["Reader | Editor | feedback", "Editor | Draft | revision", "Draft | Reviewer | review", "Reviewer | Publisher | approval"].map((row, i) => `## Flow ${i}\n\n| from | to | relation |\n|---|---|---|\n| ${row} |`);
    const article = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content: tables.join("\n\n") };
    const first = planFigureCandidates(article, []).candidates;
    expect(first).toHaveLength(3);
    for (const spec of first) expect(() => assertFigureEvidence(spec, [article])).not.toThrow();
    const remaining = planFigureCandidates(article, [], { excludedRepresentations: first.map(spec => JSON.stringify({ family: spec.family, columns: spec.columns, rows: spec.rows })) });
    expect(remaining.candidates).toHaveLength(1);
    expect(remaining.candidates[0].rows[0][0]).toBe("Reviewer");
    const ambiguous = { ...article, content: tables[0] + "\n\n" + tables[0] };
    expect(planFigureCandidates(ambiguous, []).candidates).toEqual([]);
  });

  it("excludes indented code, comments, HTML blocks and incompletely closed fences from article evidence", () => {
    const table = "| from | to | relation |\n|---|---|---|\n| Hypothetical | Result | causes |";
    const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const, content: table };
    for (const content of [table.split("\n").map(line => "    " + line).join("\n"), table.split("\n").map(line => "\t" + line).join("\n"), `<!--\n${table}\n-->`, `<div>\n${table}\n</div>`, `\`\`\`\`markdown\n\`\`\`\n${table}\n\`\`\`\``, `\`\`\`markdown\n\`\`\`js\n${table}\n\`\`\``]) {
      expect(planFigureCandidates({ ...source, content }, []).candidates, content).toEqual([]);
    }
    expect(planFigureCandidates({ ...source, content: `\`\`\`\`markdown\n${table}\n\`\`\`\`\n\n## Actual\n\n${table}` }, []).candidates).toHaveLength(1);
  });

  it("blocks numeric rendering when denominators are missing, permitting only explicitly stated count or N/A denominators", () => {
    const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const,
      content: citedNumeric('## Results\n\n| label | value | unit | population | denominator |\n|---|---|---|---|---|\n| A | 12 | percent | Set | |\n| B | 20 | percent | Set | |') };
    expect(planFigureCandidates(source, [], { requireClaimTrace: false }).candidates).toEqual([]);
    expect(planFigureCandidates({ ...source, content: source.content.replaceAll("Set | |", "Set | 80 reviewed cases |") }, [], { requireClaimTrace: false }).candidates).toHaveLength(1);
  });
  it("rejects code examples, mixed populations/units, malformed CSV and unsupported inferred relationships", () => {
    const source = { id: "a", name: "Article", format: "markdown" as const, purpose: "article" as const,
      content: '```markdown\n| from | to | relation |\n|---|---|---|\n| Hypothetical | Result | causes |\n```' };
    expect(planFigureCandidates(source, []).candidates).toEqual([]);
    const numeric = citedNumeric('| label | value | unit | population | denominator |\n|---|---|---|---|---|\n| A | 12 | cases | Set A | 80 |\n| B | 20 | percent | Set B | 80 |');
    expect(planFigureCandidates({ ...source, content: numeric }, [], { requireClaimTrace: false }).candidates).toEqual([]);
    expect(parseFigureSource({ ...source, format: "csv", content: 'label,value\n"unfinished,3' }).errors).toContain("CSV contains malformed or multiline quoted cells");
    expect(planFigureCandidates({ ...source, content: "A happened before B, perhaps because C" }, []).candidates).toEqual([]);
  });
  it("renders safe deterministic SVG and binds semantics exactly while unrelated copy shifts remain current", async () => {
    const article = { id: "article", name: "Article", format: "markdown" as const, purpose: "article" as const,
      content: '## Relationship\n\n| from | to | relation |\n|---|---|---|\n| Reader < reviewer | Editor & reviewer | sends "feedback" |' };
    const spec = planFigureCandidates(article, []).candidates[0];
    expect(() => assertFigureEvidence(spec, [article])).not.toThrow();
    const svg = renderFigureSvg(spec);
    expect(svg).toBe(renderFigureSvg(spec));
    expect(svg).toContain("Reader &lt; reviewer");
    expect(svg).not.toMatch(/<script|foreignObject|onload=|<image|https?:\/\/(?!www\.w3\.org\/2000\/svg)|font-family|<style/iu);
    expect(await figureSignatures(spec)).toEqual(await figureSignatures(spec));
    expect(() => assertFigureEvidence(spec, [{ ...article, content: "Unrelated copy\n\n" + article.content }])).not.toThrow();
    expect(() => assertFigureEvidence(spec, [{ ...article, content: article.content.replace('sends "feedback"', "causes approval") }])).toThrow(/evidence changed/);
    expect(() => assertFigureEvidence({ ...spec, rows: [["Reader", "Editor", "causes approval"]] }, [article])).toThrow(/evidence changed/);
    expect(() => renderFigureSvg({ ...spec, presentation: { ...spec.presentation, accent: 'url(https://bad)' } })).toThrow(/six-digit/);
  });
  it("uses one combined three-candidate limit across lines, flows, sequences and timelines without inferring order", () => {
    const tables = [
      citedNumeric("| date | value | unit | population | denominator |\n|---|---|---|---|---|\n| 2026-01-01 | 12 | cases | Set | 80 |\n| 2026-02-01 | 20 | cases | Set | 80 |"),
      "| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |\n| Editor | Draft | revises |",
      "| order | from | to | message |\n|---|---|---|---|\n| 1 | Reader | Editor | Feedback |\n| 2 | Editor | Reader | Revision |",
      "| date | event |\n|---|---|\n| 2026-01-01 | Draft |\n| 2026-02-01 | Review |",
    ];
    const article = { id: "article", name: "Article", format: "markdown" as const, purpose: "article" as const,
      content: tables.map((table, index) => `## Evidence ${index}\n\n${table}`).join("\n\n") };
    const trace = { ...article, id: "trace", purpose: "claim-trace" as const };
    expect(planFigureCandidates(article, [trace]).candidates.map(spec => spec.family)).toEqual(["lines", "flow", "sequence"]);
    const timeline = { ...article, content: `## Dates\n\n${tables[3]}` };
    expect(planFigureCandidates(timeline, []).candidates[0].family).toBe("timeline");
    expect(planFigureCandidates({ ...timeline, content: timeline.content.replace("2026-01-01", "2027-01-01") }, []).candidates).toEqual([]);
    expect(planFigureCandidates({ ...article, content: tables[2].replace("| 2 |", "| 1 |") }, []).candidates).toEqual([]);
  });
  it("plans comparable bars only from exact article rows corroborated by an attached claim trace", () => {
    const content = citedNumeric("## Measured results\n\n| label | value | unit | population | denominator |\n|---|---|---|---|---|\n| Alpha | 12 | cases | Reviewed set | 80 labels |\n| Beta | 20 | cases | Reviewed set | 80 labels |\n");
    const article = { id: "article", name: "Article draft", format: "markdown" as const, purpose: "article" as const, content };
    const trace = { ...article, id: "trace", name: "claim-trace.md", purpose: "claim-trace" as const };
    const plan = planFigureCandidates(article, [trace]);
    expect(plan.candidates).toHaveLength(1);
    const spec = plan.candidates[0];
    expect(spec.family).toBe("bars");
    expect(spec.rows[0]).toEqual(["Alpha", "12", "cases", "Reviewed set", "80 labels", "Evaluation report, Table 2"]);
    expect(spec.evidence.every(span => content.slice(span.start, span.end) === span.text)).toBe(true);
    expect(spec.claimTraceEvidence.every(span => span.sourceId === "trace")).toBe(true);
    expect(spec.insertionAnchor).toBe("## Measured results");
    expect(spec.presentation.caption).toContain("Reviewed set");
    expect(planFigureCandidates(article, []).candidates).toEqual([]);
  });
  it("honestly returns zero candidates for prose without explicit comparable data or relationships", () => {
    expect(planFigureCandidates({ id: "article", name: "Article", format: "markdown", purpose: "article", content: "An interesting idea with no measured values or ordered events." }, [])).toEqual({ candidates: [], reasons: ["No supported explicit table in the article"] });
  });
});
