# Research Editorial Pipeline Spike

**Issue:** #52
**Date:** 2026-06-05
**Brand:** FreshProof
**Scope:** Define and prototype the rigorous research/editorial pipeline for long-form, evidence-heavy content.

---

## Representative Topic Selected

**Topic:** GLP-1 drug discontinuation and patient weight regain

**Why this topic:**
- High clinical/regulatory risk — incorrect claims can harm patients or violate health advertising standards
- Representative of the FreshProof editorial bar: requires primary literature, clinical trial data, and expert practice guidance
- Produces useful social content at multiple lengths (blog, LinkedIn, Reddit) from the same source base
- Tests the pipeline's ability to handle evidence hierarchy, conflicts of interest, and caveats

---

## Research Brief Template

The `V2ResearchBrief` type captures all required fields:

| Field | Type | Purpose |
|---|---|---|
| `topic` | string | The research question or subject |
| `audience` | string | Who will read/use the output |
| `thesis` | string | The central claim or hypothesis to investigate |
| `depth` | `light \| standard \| rigorous` | How exhaustive source gathering should be |
| `riskLevel` | `low \| medium \| high` | Clinical/regulatory/editorial risk level |
| `brandId` | V2BrandId | Which brand workspace owns this brief |
| `targetOutputs` | string[] | Intended content formats (blog, LinkedIn, Reddit, etc.) |
| `sources` | V2SourceRecord[] | Gathered and vetted source records |
| `status` | `drafting \| source-discovery \| source-review \| outline-ready` | Pipeline stage |

**FreshProof seed brief (pre-loaded in app):**
- Topic: "GLP-1 drug discontinuation and patient weight regain"
- Audience: "Healthcare providers managing patients on GLP-1 receptor agonists and informed patients considering discontinuation"
- Thesis: "Weight regain after GLP-1 discontinuation is predictable, substantial, and manageable — but only with structured tapering, lifestyle continuity, and realistic patient expectations."
- Depth: rigorous
- Risk level: high

---

## Source Quality Rubric

### Evidence Labels

| Label | Description |
|---|---|
| `rct-meta-analysis` | Randomized controlled trial or published meta-analysis. Highest confidence for causal claims. |
| `mechanism` | Mechanistic or basic-science evidence explaining biological/physiological pathways. |
| `expert-practice` | Expert opinion, consensus statement, or established professional practice. |
| `practice-principle` | Documented field or clinical practice principle derived from accumulated experience. |
| `primary-source` | Direct primary source: original trial data, regulatory filing, official dataset. |
| `weaker-support` | Anecdote, single case report, opinion piece, or low-quality observational evidence. |

### Quality Rating Function

The `classifySourceQuality(evidenceLabel, relevanceScore)` function produces a deterministic `strong / moderate / weak` rating:

| Condition | Rating |
|---|---|
| Relevance score ≤ 1 or `weaker-support` label | weak |
| `rct-meta-analysis` | strong |
| `primary-source` with relevance ≥ 4 | strong |
| `mechanism`, `expert-practice`, `practice-principle`, `primary-source` otherwise | moderate |

This rubric is a first-pass gate — it does not replace human review.

---

## Source Discovery Prototype Results

### Sources gathered for FreshProof GLP-1 topic (mock run)

| Source | Label | Quality | Domain |
|---|---|---|---|
| SELECT trial (NEJM 2023) | rct-meta-analysis | strong | nejm.org |
| STEP 4 extension — weight regain after discontinuation (PubMed 2022) | rct-meta-analysis | strong | pubmed.ncbi.nlm.nih.gov |
| STEP 5 two-year efficacy (Lancet 2021) | rct-meta-analysis | strong | thelancet.com |
| GLP-1 receptor mechanism review (NIH PMC 2023) | mechanism | moderate | ncbi.nlm.nih.gov |
| Obesity Medicine Association Algorithm (2024) | practice-principle | moderate | obesitymedicine.org |
| Endocrine Society Clinical Practice Guideline (2023) | expert-practice | moderate | endocrine.org |

All 6 sources are seeded as `unvetted`. The human reviewer must visit each URL, verify it is not retracted, and check for conflicts of interest before accepting.

### Live source discovery (with PIONEER_API_KEY)

When configured, the `/api/v2/research-brief` endpoint calls PioneerAI with a structured prompt requesting a JSON array of real, verifiable sources for the given topic. The AI is explicitly instructed not to invent URLs or authors. Returned sources are parsed, quality-rated, and returned with `status: "unvetted"` — the AI cannot mark sources as accepted.

---

## What Can Be Automated vs. What Requires Human Review

### Safe to automate

| Step | Rationale |
|---|---|
| Initial source list generation | AI can suggest candidates, but cannot verify them |
| URL and domain extraction | Deterministic parsing |
| Preliminary quality rating | Rubric is deterministic given label + relevance score |
| Topic→source keyword mapping | Pattern-matching, no factual risk |
| Deduplication by URL | Deterministic |

### Requires human review

| Step | Rationale |
|---|---|
| Verifying source URLs are current and not retracted | AI does not have real-time access |
| Confirming evidence labels against full paper | AI may mislabel based on abstract only |
| Checking conflicts of interest | Requires reading disclosures |
| Validating relevance to the specific thesis | Requires editorial judgment |
| Reviewing caveats and limitations | Requires reading the methods section |
| Accepting AI-generated claim summaries as evidence | **Never automated** — AI summary is not a citation |

**Design constraint enforced in code:** Sources enter the system with `status: "unvetted"`. Only the human reviewer can transition a source to `accepted`. Rejected and flagged sources are excluded from draft generation by default (confirmed in acceptance criteria for #53).

---

## Cost and Effort Estimate

| Component | Effort | Notes |
|---|---|---|
| Research brief capture UI | Done | In app as of this slice |
| Source quality rubric | Done | `classifySourceQuality()` in lib/v2 |
| Evidence labels | Done | 6 labels with descriptions |
| Mock source discovery | Done | FreshProof seed sources, including recent GLP-1 discontinuation evidence |
| Live source discovery (Pioneer) | Done | `/api/v2/research-brief` endpoint |
| Human source review UI | Done | Accept/Flag/Reject per source with notes |
| Claim map artifact | Next — #53 | Requires accepted sources as input |
| Editorial outline generation | Next — #54 | Requires reviewed claim map |
| Long-form draft with citations | Next — #54 | Requires outline |

**Pioneer API cost estimate for rigorous depth:** ~2,000–5,000 tokens per brief (source list generation only). Claim map and draft generation will cost more. With `claude-opus-4-7` at current pricing, a full rigorous pipeline (brief → sources → claims → outline → draft) is estimated at $0.50–$2.00 per article.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| AI invents or hallucinates sources | High | Human URL verification step; AI instructed to use only real sources |
| Evidence labels are misapplied | Medium | Human confirms labels against full paper before accepting |
| Source recency not verified | Medium | Reviewer notes field; publishedYear surfaced in UI |
| Clinical claims drift through editorial | High | Risk level field; high-risk briefs require explicit claim-level sign-off (#53) |
| AI summary treated as ground truth | High (design) | Enforced by architecture: AI output never auto-accepted |

---

## Recommended Next Slices

1. **#53 — Claim map artifact:** Take accepted sources from this brief and produce a structured claim→source→evidence-label map. Human reviews and approves/rejects each claim before drafting begins.
2. **#54 — Editorial outline and long-form draft:** From the reviewed claim map, generate an outline with thesis, sections, takeaway table, and evidence labels. Then draft with inline citations tied to accepted source records.

Both #53 and #54 are now unblocked by this spike.
