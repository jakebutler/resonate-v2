import { hashVisualBytes } from "./visualProfile";

export type FigureSource = {
  id: string; name: string; format: "markdown" | "text" | "csv";
  purpose: "article" | "claim-trace" | "data"; content: string;
};
export type FigureFamily = "bars" | "lines" | "flow" | "sequence" | "timeline";
export type FigureBinding = { sourceId: string; start: number; end: number; text: string; row: number };
export type FigureSpec = {
  version: 1; family: FigureFamily; columns: string[]; rows: string[][];
  evidence: FigureBinding[]; claimTraceEvidence: FigureBinding[];
  presentation: { title: string; caption: string; alt: string; sourceNote: string; background: string; ink: string; accent: string };
  insertionAnchor: string;
};
type FigureTable = { columns: string[]; rows: string[][]; evidence: FigureBinding[]; anchor: string };
const canonicalData = (table: Pick<FigureTable, "columns" | "rows">) => JSON.stringify({ columns: table.columns, rows: table.rows });
const requiredColumns: Record<FigureFamily, string[]> = {
  bars: ["label", "value", "unit", "population", "denominator"],
  lines: ["date", "value", "unit", "population", "denominator"],
  flow: ["from", "to", "relation"], sequence: ["order", "from", "to", "message"], timeline: ["date", "event"],
};
const xmlText = (text: string) => [...text].every(char => {
  const code = char.codePointAt(0)!;
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff);
});
const hasInlineMarkup = (text: string) => /[{}`\\*_]|\[[^\]]*\]|~~.*~~|<(?:\/?[a-z][^>]*>|[!?])|&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/iu.test(text);
function cells(line: string): string[] | null {
  if (!line.trim().startsWith("|") || !line.trim().endsWith("|") || line.includes("\\|")) return null;
  return line.trim().slice(1, -1).split("|").map(cell => cell.trim());
}
function csvCells(line: string): string[] | null {
  const output: string[] = []; let cell = ""; let quoted = false; let closed = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === ",") { output.push(cell.trim()); cell = ""; closed = false; }
    else if (char === '"' && cell === "" && !closed) quoted = true;
    else if (closed && char.trim()) return null;
    else cell += char;
  }
  if (quoted) return null; // Multiline quoted CSV is deliberately unsupported.
  output.push(cell.trim()); return output;
}

export type FigureArticleLine = { raw: string; start: number; end: number; row: number; eligible: boolean; tableRow: boolean; topLevelEligible: boolean };
/** Shared conservative Markdown structure mask for evidence and visible top-level placement. */
export function getFigureArticleStructure(content: string): FigureArticleLine[] {
  let offset = 0;
  const lines = content.split("\n").map((raw, index) => {
    const line = { raw, start: offset, end: offset + raw.length, row: index + 1, eligible: true, tableRow: false, topLevelEligible: false }; offset += raw.length + 1; return line;
  });
  let fence: { character: string; length: number } | null = null;
  let comment = false; let mdxComment = false; let unsupportedMdxExpression = false; let htmlTag: string | null = null; let htmlClose: string | null = null; let list = false;
  for (const line of lines) {
    const raw = line.raw;
    if (fence) { if (new RegExp(`^ {0,3}${fence.character}{${fence.length},}\\s*$`, "u").test(raw)) fence = null; line.eligible = false; continue; }
    if (unsupportedMdxExpression) { line.eligible = false; continue; }
    if (/^\s*(?:import|export)\b/u.test(raw)) {
      // MDX modules can hide Markdown-shaped data in JavaScript strings.
      // This constrained planner does not recover a module's parsing boundary.
      unsupportedMdxExpression = true; line.eligible = false; continue;
    }
    const commentStart = /\{\s*\/\*/u.exec(raw);
    if (mdxComment || (commentStart && raw.indexOf("{") === commentStart.index)) {
      // Inspect the first comment terminator. A later terminator can belong
      // to a string in a trailing expression and grants no recovery authority.
      const close = raw.indexOf("*/", mdxComment ? 0 : commentStart!.index + commentStart![0].length);
      if (close < 0) mdxComment = true;
      else {
        mdxComment = false;
        if (!/^\s*\}\s*$/u.test(raw.slice(close + 2))) unsupportedMdxExpression = true;
      }
      line.eligible = false; continue;
    }
    if (raw.includes("{")) {
      // This planner does not parse JavaScript. A brace in a string or comment
      // cannot prove that an MDX expression ended; refuse the remaining region.
      unsupportedMdxExpression = true;
      line.eligible = false; continue;
    }
    if (htmlClose) { if (raw.includes(htmlClose)) htmlClose = null; line.eligible = false; continue; }
    if (comment || raw.includes("<!--")) { comment = !raw.includes("-->", Math.max(0, raw.indexOf("<!--"))); line.eligible = false; continue; }
    const special = /^ {0,3}<\?/u.test(raw) ? "?>" : /^ {0,3}<!\[CDATA\[/u.test(raw) ? "]]>" : /^ {0,3}<![A-Z]/u.test(raw) ? ">" : null;
    if (special) { if (!raw.includes(special)) htmlClose = special; line.eligible = false; continue; }
    if (htmlTag) { if (new RegExp(`</${htmlTag}\\s*>`, "iu").test(raw)) htmlTag = null; line.eligible = false; continue; }
    const html = /^ {0,3}<([a-z][a-z0-9-]*)(?:\s|>|\/)/iu.exec(raw);
    if (html) { if (!new RegExp(`</${html[1]}\\s*>`, "iu").test(raw) && !/\/\s*>\s*$/u.test(raw) && !/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/iu.test(html[1])) htmlTag = html[1]; line.eligible = false; continue; }
    if (/^ {0,3}<\//u.test(raw)) { line.eligible = false; continue; }
    const opening = /^ {0,3}(`{3,}|~{3,})/u.exec(raw)?.[1];
    if (opening) { fence = { character: opening[0], length: opening.length }; line.eligible = false; continue; }
    if (!raw.trim()) list = false;
    if (/^ {0,3}(?:[-+*]|\d{1,9}[.)])\s+/u.test(raw)) list = true;
    line.eligible = !list && !/^(?: {4}| *\t| {0,3}>)/u.test(raw);
  }
  for (let index = 0; index + 1 < lines.length; index++) {
    const header = lines[index].eligible ? cells(lines[index].raw) : null;
    const separator = lines[index + 1].eligible ? cells(lines[index + 1].raw) : null;
    if (!header || !separator || separator.length !== header.length || !separator.every(cell => /^:?-{3,}:?$/u.test(cell))) continue;
    for (let row = index; row < lines.length && lines[row].raw.trim(); row++) lines[row].tableRow = true;
  }
  return lines.map(line => ({ ...line, topLevelEligible: line.eligible && !line.tableRow }));
}
export function assertFigureInsertionAnchor(content: string, anchor: string, kind = "Figure insertion anchor"): number {
  const index = content.indexOf(anchor), end = index + anchor.length;
  if (!anchor || index < 0 || content.lastIndexOf(anchor) !== index) throw new Error(`${kind} must match exactly once; resolve placement explicitly`);
  if ((index > 0 && content[index - 1] !== "\n") || (end < content.length && content[end] !== "\n" && content[end] !== "\r")) throw new Error("Figure insertion anchor must cover whole lines");
  const lines = getFigureArticleStructure(content);
  const first = lines.findIndex(line => line.start === index);
  const last = lines.findIndex(line => line.end === end || (line.raw.endsWith("\r") && line.end - 1 === end));
  if (first < 0 || last < first || lines.slice(first, last + 1).some(line => !line.topLevelEligible) || (lines[last + 1] && lines[last + 1].raw.trim())) throw new Error("Choose a safe insertion anchor on top-level lines outside tables, lists, code and HTML structures, followed by a blank line or EOF");
  return end;
}

/** Deliberately narrow extraction: no prose inference, units inferred from numbers, or network research. */
export function parseFigureSource(source: FigureSource): { tables: FigureTable[]; errors: string[] } {
  const errors: string[] = []; const tables: FigureTable[] = [];
  if (new TextEncoder().encode(source.content).length > (source.purpose === "article" ? 200000 : 65536) || !xmlText(source.content) || /\r(?!\n)/u.test(source.content)) {
    return { tables, errors: ["Source is too large or contains unsupported control characters"] };
  }
  const lines = getFigureArticleStructure(source.content);
  const binding = (line: typeof lines[number]): FigureBinding => ({ sourceId: source.id, start: line.start, end: line.end, text: line.raw, row: line.row });
  const makeTable = (headIndex: number, rowIndexes: number[], parsed: string[][]) => {
    const columns = parsed[0].map(cell => cell.toLowerCase()); const rows = parsed.slice(1);
    if (columns.length > 8 || rows.length > 20 || rows.some(row => row.length !== columns.length) ||
      parsed.flat().some(cell => cell.length > 160)) { errors.push(`Table at row ${lines[headIndex].row} exceeds limits or has inconsistent columns`); return; }
    let anchor = "";
    for (let index = headIndex - 1; index >= 0; index--) if (lines[index].raw.trim() && lines[index].topLevelEligible && (!lines[index + 1] || !lines[index + 1].raw.trim())) { anchor = lines[index].raw; break; }
    if (!anchor) anchor = source.content.slice(lines[headIndex].start, lines[rowIndexes.at(-1) ?? headIndex].end);
    tables.push({ columns, rows, evidence: [binding(lines[headIndex]), ...rowIndexes.map(index => binding(lines[index]))], anchor });
  };
  if (source.format === "csv") {
    const nonempty = lines.map((line, index) => line.raw.trim() ? index : -1).filter(index => index >= 0);
    const parsed = nonempty.map(index => csvCells(lines[index].raw));
    if (parsed.some(row => row === null)) errors.push("CSV contains malformed or multiline quoted cells");
    else if (parsed.length >= 2) makeTable(nonempty[0], nonempty.slice(1), parsed as string[][]);
    else errors.push("CSV requires a header and data rows");
    return { tables, errors };
  }
  const eligible = lines.map(line => line.eligible);
  for (let index = 0; index + 1 < lines.length; index++) {
    if (!eligible[index] || !eligible[index + 1]) continue;
    const header = cells(lines[index].raw), separator = cells(lines[index + 1].raw);
    if (!header || !separator || separator.length !== header.length || !separator.every(cell => /^:?-{3,}:?$/u.test(cell))) continue;
    const rowIndexes: number[] = []; const parsed = [header]; let end = index + 2;
    for (; end < lines.length; end++) {
      const row = eligible[end] ? cells(lines[end].raw) : null; if (!row) break;
      rowIndexes.push(end); parsed.push(row);
    }
    if (end < lines.length && lines[end].raw.trim()) errors.push(`Unsupported table row or nonblank terminator at row ${lines[end].row}; a complete table must end at a blank line or EOF`);
    else if (rowIndexes.length) makeTable(index, rowIndexes, parsed);
    else errors.push(`Table at row ${lines[index].row} has no data rows`);
    index = end - 1;
  }
  return { tables, errors };
}
function familyFor(table: FigureTable): FigureFamily | null {
  for (const [family, columns] of Object.entries(requiredColumns)) {
    if (JSON.stringify(table.columns) === JSON.stringify(columns) ||
      JSON.stringify(table.columns) === JSON.stringify([...columns, "citation"])) return family as FigureFamily;
  }
  return null;
}
function numericTableError(table: FigureTable): string | null {
  if (table.rows.length < 2 || table.rows.length > 12) return "Numeric figures require 2 to 12 explicit rows";
  if (table.rows.some(row => !/^-?\d+(?:\.\d{1,6})?$/u.test(row[1]) || Math.abs(Number(row[1])) > 1e9)) return "Numeric values must be finite explicit decimals within bounds";
  if (new Set(table.rows.map(row => row[0])).size !== table.rows.length || table.rows.some(row => !row[0] || !row[2] || !row[3] || !row[4])) return "Numeric labels, units, population and denominator must be explicit";
  if (table.columns.at(-1) !== "citation" || table.rows.some(row => !row.at(-1)?.trim())) return "Numeric figures require an explicit publishable citation for every row";
  if ([2, 3, 4].some(column => new Set(table.rows.map(row => row[column])).size !== 1)) return "Mixed units, populations or denominators are not comparable";
  return null;
}
const isoDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/u.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
function tableError(table: FigureTable, family: FigureFamily): string | null {
  if (table.rows.flat().some(hasInlineMarkup)) return "Figure cells must be plain exact text without inline Markdown, HTML or entities";
  if (table.columns.at(-1) === "citation" && table.rows.some(row => Boolean(row.at(-1)?.trim())) && table.rows.some(row => !row.at(-1)?.trim())) return "Every diagram row must supply a citation when any row cites a source";
  if (family === "bars" || family === "lines") {
    const error = numericTableError(table); if (error) return error;
  } else if (table.rows.length < 1 || table.rows.length > 12 || table.rows.some(row => row.slice(0, requiredColumns[family].length).some(cell => !cell))) {
    return "Diagram needs 1 to 12 explicit complete rows";
  }
  if (family === "lines" || family === "timeline") {
    if (table.rows.length < 2 || table.rows.some((row, index) => !isoDate(row[0]) || (index > 0 && row[0] <= table.rows[index - 1][0]))) {
      return "Dates must be explicit valid ISO dates in strict source chronology";
    }
  }
  if (family === "flow" && (new Set(table.rows.flatMap(row => row.slice(0, 2))).size > 8 ||
    new Set(table.rows.map(row => JSON.stringify(row.slice(0, 3)))).size !== table.rows.length)) return "Flow has too many nodes or repeated relationships";
  if (family === "sequence") {
    if (new Set(table.rows.flatMap(row => row.slice(1, 3))).size > 6 || table.rows.some((row, index) =>
      !/^[1-9]\d{0,2}$/u.test(row[0]) || (index > 0 && Number(row[0]) <= Number(table.rows[index - 1][0])))) return "Sequence requires explicit increasing order and at most six participants";
  }
  return null;
}
function presentationFor(table: FigureTable, family: FigureFamily) {
  const first = table.rows[0];
  const numeric = family === "bars" || family === "lines";
  const title = numeric ? "Comparable article values" : family === "flow" ? "Explicit relationships" : family === "sequence" ? "Explicit interaction order" : "Dated article events";
  const caption = numeric ? `${first[3]}: values in ${first[2]}; denominator: ${first[4]}.` : family === "flow" ? "Each arrow represents the relationship stated in its source row." : family === "sequence" ? "Interactions follow the explicit order in the source rows." : "Events follow their stated dates; no causal relation is implied.";
  const citations = table.columns.at(-1) === "citation" ? Array.from(new Set(table.rows.map(row => row.at(-1)!.trim()).filter(Boolean))).join("; ") : "";
  const sourceNote = citations ? `Source: ${citations}.` : family === "flow" ? "Source: The article’s explicit relationships." : family === "sequence" ? "Source: The article’s explicit interaction order." : "Source: The article’s stated event dates.";
  return { title, caption, alt: `${title}. ${table.rows.map(row => row.join(": ")).join("; ")}`, sourceNote, background: "#ECE9E2", ink: "#22272B", accent: "#2E5B60" };
}
export function planFigureCandidates(article: FigureSource, sources: FigureSource[], options: { requireClaimTrace?: boolean; limit?: number; excludedRepresentations?: string[]; requiredRepresentation?: string } = {}): { candidates: FigureSpec[]; reasons: string[] } {
  const candidates: FigureSpec[] = []; const selectedRepresentations = new Set<string>(); const parsed = parseFigureSource(article); const reasons = [...parsed.errors];
  const limit = Math.max(0, Math.min(3, options.limit ?? 3));
  for (const table of parsed.tables) {
    const family = familyFor(table);
    if (!family) { reasons.push("Table does not match a supported explicit figure shape"); continue; }
    const error = tableError(table, family); if (error) { reasons.push(error); continue; }
    const trace = sources.filter(source => source.purpose === "claim-trace").map(source => ({ source, table: parseFigureSource(source).tables.find(candidate => canonicalData(candidate) === canonicalData(table)) })).find(match => match.table);
    if ((family === "bars" || family === "lines") && (options.requireClaimTrace ?? true) && !trace) { reasons.push("Comparable article data needs a matching attached claim trace"); continue; }
    const spec: FigureSpec = { version: 1, family, columns: table.columns, rows: table.rows, evidence: table.evidence,
      claimTraceEvidence: trace?.table?.evidence ?? [], presentation: presentationFor(table, family), insertionAnchor: table.anchor };
    try { assertFigureEvidence(spec, [article, ...sources], options.requireClaimTrace ?? true); }
    catch (error) { reasons.push(error instanceof Error ? error.message : "Unsupported evidence context"); continue; }
    const representation = JSON.stringify({ family, columns: table.columns, rows: table.rows });
    if ((options.requiredRepresentation && options.requiredRepresentation !== representation) || options.excludedRepresentations?.includes(representation) || selectedRepresentations.has(representation)) continue;
    if (candidates.length >= limit) { reasons.push("The combined three-figure limit has been reached"); continue; }
    candidates.push(spec); selectedRepresentations.add(representation);
  }
  return { candidates, reasons: reasons.length ? reasons : candidates.length ? [] : ["No supported explicit table in the article"] };
}

export const FIGURE_RENDERER_VERSION = "resonate-svg-v3";
function assertSpecShape(spec: FigureSpec): void {
  if (spec.version !== 1 || !requiredColumns[spec.family]) throw new Error("Unsupported figure specification version or family");
  const table = { columns: spec.columns, rows: spec.rows, evidence: spec.evidence, anchor: spec.insertionAnchor };
  if (familyFor(table) !== spec.family || spec.rows.some(row => row.length !== spec.columns.length || row.some(cell => typeof cell !== "string" || cell.length > 160 || !xmlText(cell)))) throw new Error("Invalid constrained figure rows");
  const error = tableError(table, spec.family); if (error) throw new Error(error);
  if (spec.evidence.length !== spec.rows.length + 1 || (spec.claimTraceEvidence.length !== 0 && spec.claimTraceEvidence.length !== spec.rows.length + 1) ||
    [...spec.evidence, ...spec.claimTraceEvidence].some(binding => typeof binding.sourceId !== "string" || binding.sourceId.length > 120 || !binding.text || binding.text.length > 1600 || !xmlText(binding.text))) throw new Error("Invalid bounded figure evidence bindings");
  for (const color of [spec.presentation.background, spec.presentation.ink, spec.presentation.accent]) {
    if (!/^#[0-9a-f]{6}$/iu.test(color)) throw new Error("Figure palette needs six-digit hex colors");
  }
  for (const [key, text] of Object.entries(spec.presentation)) {
    if (typeof text !== "string" || !xmlText(text) || text.length > (key === "alt" ? 8000 : 2000)) throw new Error("Figure presentation exceeds safe text limits");
  }
  if (!spec.insertionAnchor.trim() || spec.insertionAnchor.length > 16000 || !xmlText(spec.insertionAnchor)) throw new Error("Invalid figure insertion anchor");
}

/** Spans use UTF-16 code-unit offsets. Exact table strings and ordering verify current meaning. */
export function assertFigureEvidence(spec: FigureSpec, sources: FigureSource[], requireClaimTrace = true): void {
  assertSpecShape(spec);
  const bind = (bindings: FigureBinding[], purpose: FigureSource["purpose"]) => {
    if (bindings.length !== spec.rows.length + 1 || new Set(bindings.map(binding => binding.sourceId)).size !== 1) throw new Error("Figure evidence changed or incomplete");
    const source = sources.find(source => source.id === bindings[0].sourceId && source.purpose === purpose);
    if (!source) throw new Error("Figure evidence changed or missing source");
    for (const binding of bindings) {
      if (!Number.isInteger(binding.start) || !Number.isInteger(binding.end) || binding.start < 0 || binding.end - binding.start !== binding.text.length || binding.end > 200000 ||
        !Number.isInteger(binding.row) || binding.row < 1 || !binding.text) throw new Error("Invalid exact figure evidence locator");
    }
    // A header or row can recur in another table. The complete parsed table context must be unique.
    const matches = parseFigureSource(source).tables.filter(table => canonicalData(table) === canonicalData(spec) &&
      JSON.stringify(table.evidence.map(span => span.text)) === JSON.stringify(bindings.map(span => span.text)));
    if (matches.length !== 1) throw new Error("Figure evidence changed or is ambiguous: labels, values, units, groups, order or relationships differ");
    const table = matches[0];
    return { source, table };
  };
  const main = bind(spec.evidence, "article");
  const trace = spec.claimTraceEvidence.length ? bind(spec.claimTraceEvidence, "claim-trace") : null;
  if ((spec.family === "bars" || spec.family === "lines") && requireClaimTrace && !trace) throw new Error("Numeric figure requires exact claim-trace evidence");
  const expected = presentationFor(main.table, spec.family);
  // Presentation cannot introduce unsupported claims. Palette and exact insertion placement can be edited.
  for (const key of ["title", "caption", "alt", "sourceNote"] as const) {
    if (spec.presentation[key] !== expected[key]) throw new Error("Figure presentation text must be derived from its exact evidence");
  }
}
/** Current-body proof deliberately ignores archived offsets and unavailable trace bytes. Archives stay server-owned. */
export function assertFigureCurrentArticle(spec: FigureSpec, content: string): void {
  assertFigureEvidence({ ...spec, claimTraceEvidence: [] }, [{ id: spec.evidence[0]?.sourceId ?? "", name: "Article", format: "markdown", purpose: "article", content }], false);
}
export function figureArticleTokens(content: string): string[] {
  return [...content.matchAll(/resonate-figure:/giu)].map(match => {
    const canonical = /^resonate-figure:\/\/([a-zA-Z0-9]+)(?=\)|$)/u.exec(content.slice(match.index));
    if (!canonical) throw new Error("Article contains a malformed or noncanonical internal figure token");
    return canonical[1];
  });
}
/** Shared backend/publisher literal Markdown+MDX block. No caller-supplied markup is interpreted. */
export function buildFigureMarkdownBlock(candidateId: string, spec: FigureSpec): string {
  assertSpecShape(spec);
  if (!/^[a-zA-Z0-9]+$/u.test(candidateId)) throw new Error("Invalid internal figure candidate identity");
  const escape = (value: string) => value.replace(/[\\[\]()*_`#~|+=-]/gu, character => `\\${character}`).replace(/^(\d+)\./u, "$1\\.")
    .replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/\{/gu, "&#123;").replace(/\}/gu, "&#125;");
  return `![${escape(spec.presentation.alt)}](resonate-figure://${candidateId})\n\n${escape(spec.presentation.caption)}\n\n${escape(spec.presentation.sourceNote)}`;
}
const escapeXml = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
const number = (value: number) => {
  if (!Number.isFinite(value) || value < 0 || value > 1000) throw new Error("Figure geometry exceeds numeric bounds");
  return String(Math.round(value * 100) / 100);
};
const shortLabel = (text: string, limit = 30) => { const points = Array.from(text); return points.length > limit ? `${points.slice(0, limit - 1).join("")}…` : text; };

/** Only fixed SVG elements/attributes and bounded numeric geometry; text is escaped, never interpreted. */
export function renderFigureSvg(spec: FigureSpec): string {
  assertSpecShape(spec);
  const { background, ink, accent } = spec.presentation; const width = 720;
  const height = Math.min(950, Math.max(400, 160 + spec.rows.length * (spec.family === "sequence" ? 54 : 60)));
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="figure-title figure-description">`,
    `<title id="figure-title">${escapeXml(spec.presentation.title)}</title>`, `<desc id="figure-description">${escapeXml(spec.presentation.alt)}</desc>`,
    `<rect x="0" y="0" width="720" height="${height}" fill="${background}"/>`];
  const text = (x: number, y: number, value: string, size = 24, anchor = "start") => parts.push(`<text x="${number(x)}" y="${number(y)}" fill="${ink}" font-size="${number(size)}" text-anchor="${anchor}"><title>${escapeXml(value)}</title>${escapeXml(shortLabel(value))}</text>`);
  const line = (x1: number, y1: number, x2: number, y2: number, dashed = false) => parts.push(`<line x1="${number(x1)}" y1="${number(y1)}" x2="${number(x2)}" y2="${number(y2)}" stroke="${accent}" stroke-width="3"${dashed ? ' stroke-dasharray="5 7"' : ""}/>`);
  const arrow = (x1: number, y1: number, x2: number, y2: number) => {
    line(x1, y1, x2, y2); const right = x2 >= x1;
    parts.push(`<polygon points="${number(x2)},${number(y2)} ${number(x2 + (right ? -10 : 10))},${number(y2 - 6)} ${number(x2 + (right ? -10 : 10))},${number(y2 + 6)}" fill="${accent}"/>`);
  };
  text(24, 40, spec.presentation.title, 28);
  if (spec.family === "bars") {
    const values = spec.rows.map(row => Number(row[1])); const min = Math.min(0, ...values), max = Math.max(0, ...values), range = max - min || 1;
    const x = (value: number) => 290 + ((value - min) / range) * 310;
    line(x(0), 75, x(0), height - 55); text(290, 70, spec.rows[0][2], 20);
    spec.rows.forEach((row, index) => {
      const y = 110 + index * 60, valueX = x(Number(row[1])), zeroX = x(0);
      text(24, y + 18, row[0]); parts.push(`<rect x="${number(Math.min(zeroX, valueX))}" y="${number(y)}" width="${number(Math.abs(valueX - zeroX))}" height="30" fill="${accent}"/>`); text(620, y + 23, row[1], 24);
    });
  } else if (spec.family === "lines") {
    const values = spec.rows.map(row => Number(row[1])); const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
    const firstDate = Date.parse(spec.rows[0][0]), dateRange = Date.parse(spec.rows.at(-1)![0]) - firstDate;
    const points = spec.rows.map(row => [70 + ((Date.parse(row[0]) - firstDate) / dateRange) * 580, height - 100 - ((Number(row[1]) - min) / range) * (height - 210)]);
    line(70, 90, 70, height - 100); line(70, height - 100, 650, height - 100);
    text(24, 80, spec.rows[0][2], 20); text(24, 115, String(max), 20); text(24, height - 105, String(min), 20);
    parts.push(`<polyline points="${points.map(point => point.map(number).join(",")).join(" ")}" fill="none" stroke="${accent}" stroke-width="4"/>`);
    points.forEach(([x, y], index) => { parts.push(`<circle cx="${number(x)}" cy="${number(y)}" r="6" fill="${accent}"/>`); text(x, y - 12, spec.rows[index][1], 20, "middle"); });
    text(70, height - 55, spec.rows[0][0], 20); text(650, height - 55, spec.rows.at(-1)![0], 20, "end");
  } else if (spec.family === "flow") {
    spec.rows.forEach((row, index) => {
      const y = 110 + index * 60; text(24, y, row[0]); text(696, y, row[1], 24, "end");
      arrow(250, y + 9, 480, y + 9); text(360, y - 15, row[2], 20, "middle");
    });
  } else if (spec.family === "sequence") {
    const participants = [...new Set(spec.rows.flatMap(row => row.slice(1, 3)))];
    const x = (participant: string) => 70 + participants.indexOf(participant) * (580 / Math.max(1, participants.length - 1));
    participants.forEach(participant => { text(x(participant), 90, participant, 20, "middle"); line(x(participant), 100, x(participant), height - 35, true); });
    spec.rows.forEach((row, index) => { const y = 145 + index * 54; arrow(x(row[1]), y, x(row[2]), y); text((x(row[1]) + x(row[2])) / 2, y - 12, `${row[0]}. ${row[3]}`, 20, "middle"); });
  } else {
    line(190, 90, 190, height - 65);
    spec.rows.forEach((row, index) => { const y = 115 + index * 60; parts.push(`<circle cx="190" cy="${number(y)}" r="7" fill="${accent}"/>`); text(24, y + 8, row[0], 20); text(220, y + 8, row[1]); });
  }
  parts.push("</svg>"); return parts.join("");
}
export async function figureSignatures(spec: FigureSpec) {
  const svg = renderFigureSvg(spec);
  const hash = (text: string) => hashVisualBytes(new TextEncoder().encode(text).buffer);
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
    return JSON.stringify(value);
  };
  const evidence = (bindings: FigureBinding[]) => bindings.map(binding => ({ sourceId: binding.sourceId, text: binding.text }));
  const dataSignature = await hash(canonical({ family: spec.family, columns: spec.columns, rows: spec.rows, evidence: evidence(spec.evidence), claimTraceEvidence: evidence(spec.claimTraceEvidence) }));
  const presentationSignature = await hash(canonical({ renderer: FIGURE_RENDERER_VERSION, dataSignature, presentation: spec.presentation, insertionAnchor: spec.insertionAnchor }));
  return { dataSignature, presentationSignature, svg, svgSha256: await hash(svg), rendererVersion: FIGURE_RENDERER_VERSION };
}
