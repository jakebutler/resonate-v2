# Reviewable parity eval run — 2026-08-06

**Environment:** `https://resonate.corvolabs.com/v2` (operator account)  
**Script:** `docs/eval/reviewable-parity-script.md`  
**Result:** **PASS** (12/12)  
**Recorded by:** jakebutler via [#44](https://github.com/jakebutler/resonate-v2/issues/44)

| Step | Criterion | Result |
|---|---|---|
| 1 | Capture idea on `/v2/research` — survives reload, visible in inbox | Pass |
| 2 | Generate AI draft variants — survive reload | Pass |
| 3 | Accept LinkedIn variant — appears on calendar (no local-only fallback) | Pass |
| 4 | Accept Corvo Blog variant — draft is authorable | Pass |
| 5 | Edit blog title, content, excerpt, hero (upload + URL), author, tags | Pass |
| 6 | Approve + Open PR — real GitHub PR against `corvo-labs-dot-com` | Pass |
| 7 | PR link + status badge in calendar drawer | Pass |
| 8 | Social connections — Buffer (LinkedIn) + Zernio (Reddit) connected | Pass |
| 9 | Schedule LinkedIn item, view on calendar, delete | Pass |
| 10 | Reload — remaining items present, zero data loss | Pass |
| 11 | Calendar normal mode — zero jargon / Seed Workspace / Mock Submit / Persisted MVP Spine / Publishing Intent as primary labels | Pass |
| 12 | `/v2/research` inbox — zero `localStorage` dependency | Pass |

## Notes

Manual HITL pass completed; per-step notes also posted on issue #44.
Reviewable-parity PRD (#34) acceptance bar is met.
