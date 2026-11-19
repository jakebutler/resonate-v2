# FreshProof production research verification

The pilot covers freshproof.io only. Both weekly job switches stayed disabled. Production records below were read from the Resonate Convex deployment. OpenAI and Firecrawl charges are billed by the providers. Resonate records admission ceilings and request estimates in cents.

## Production evidence

| Run | Production record | Evidence |
| --- | --- | --- |
| Firecrawl crawl | `wn7bx9mbdr2w55dy8gn1fcmg9d8jed2r` | Complete. The version-one snapshot contains the homepage and four article pages. |
| SEO keyword research | `wh71487stn7h0yhjte49669wcn8jeqdp` | Complete. Five Firecrawl searches returned no freshproof.io result. Twenty candidates remain unproven. The run ceiling was 10¢. |
| Visibility before the Sessionize update | `wh7dkbp73s2td73731156kk2718jh6kn` | Complete. All 12 answers were saved. All nine bare-name questions cited the UK delivery company. Neither of the two category-qualified questions nor the unbranded category question cited freshproof.io. The run ceiling was 24¢. |
| Visibility after the Sessionize update | `wh71w1dnbs5zmvjhyj4v8vrqkh8jge1g` | Complete. All 12 original questions saved answers, with zero freshproof.io citations. The run ceiling was 24¢. |
| Competitor discovery before the evidence filter | `wh7021h9v3bqzvpth5n5wa9kds8jhv34` | Complete. Two queries proposed 16 suggestions. Review found no direct competitor with sufficient evidence. The run ceiling was 8¢. |
| Competitor discovery with the evidence filter | `wh72c0pms1gfddxw6zz87qws6d8jh6s6` | Complete. One Firecrawl search produced zero qualifying excerpts. The model screening call was skipped and no candidates were added. The run ceiling was 8¢. |

[Visibility results](https://resonate.corvolabs.com/aeo/intel?brand=freshproof) · [Competitor suggestions](https://resonate.corvolabs.com/aeo/competitors?brand=freshproof) · [Keyword gaps](https://resonate.corvolabs.com/aeo/gaps?brand=freshproof)

## Sessionize retrieval

The public profile describes draft fact-checking before publication and links to freshproof.io. One targeted OpenAI Responses probe using Resonate’s production web-search adapter and `gpt-6-luna` returned the earlier post-publication bio at 19:12:50 UTC. A second targeted probe at 19:15:44 UTC cited the same canonical profile, described the new workflow, and identified the product URL. The probes were separate from the visibility measurement.

[Public Sessionize profile](https://sessionize.com/jakebutler/)

## Same 12 questions after the bio update

One live production batch ran from 19:16:31 to 19:17:35 UTC, after the targeted retrieval check passed. All 12 saved questions matched the baseline in wording and order. The table counts distinct answers with at least one citation from each site.

| Citation source | Before | After |
| --- | ---: | ---: |
| freshproof.io | 0/12 | 0/12 |
| UK delivery service (freshproof.co.uk) | 9/12 | 10/12 |
| Sessionize profile | 1/12 | 3/12 |

All nine bare-name answers still cited the UK service. The category-qualified definition again cited Sessionize and described post-publication monitoring. The category-qualified recommendation switched to the UK delivery service. The unbranded category answer cited neither FreshProof domain. The targeted probe establishes that the updated bio can be retrieved when requested directly. The unchanged questions still returned stale or wrong-brand evidence and yielded no direct citations to the product.

## Competitor filter controls

**Result · failed positive control.** One live targeted Firecrawl search returned the ProofMyText fact-checker page. Its excerpt described checking statements in a draft against sources and passed the deterministic excerpt filter. An isolated Convex test replayed that search response through the production discovery code and called the configured live `gpt-4o` screening model. It also supplied the Google News Initiative fact-checking guide as a negative control. The excerpt filter kept the guide out of the screening input.

The model returned `[]` on the original Firecrawl excerpt at 19:14:07 UTC. A second isolated check at 19:15:00 UTC supplied the product page’s explicit instruction to paste a draft plus its description of source-based checking. The same model returned `[]` again. Both runner executions completed with zero proposals and an empty isolated review queue. This verification used one live Firecrawl search and two live screening requests. It added no candidates to the production queue.

[ProofMyText product page](https://proofmytext.com/fact-checker) · [Google News Initiative guide](https://newsinitiative.withgoogle.com/resources/trainings/google-fact-check-tools/)

The earlier dev walkthrough remains available as [historical evidence](2026-11-14-aeo-live-proof.md).
