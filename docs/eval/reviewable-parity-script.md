# Reviewable parity evaluation script

Run on `https://resonate.corvolabs.com` signed in as the operator (`user_3ATLtcH9lcXKLMfIj9AxHXvpAR9`).

Record pass/fail in `docs/eval/YYYY-MM-DD-parity-run.md`.

## 1. Persisted idea inbox

1. Open `/research` → **Ideas** tab.
2. Confirm imported v1 ideas appear (10 expected from 2026-06-06 import).
3. **Capture** tab → add a new idea → switch to **Ideas** → confirm it appears.
4. Hard reload → idea still present.

**Pass:** No localStorage dependency; ideas survive reload.

## 2. Persisted draft variants

1. Select an idea → generate LinkedIn + Corvo Blog variants.
2. Hard reload → variants still listed with correct status.
3. Click **Review** on a blog variant → `/research/review/[postId]` full-height view.

**Pass:** Variants persist; review route usable for long content.

## 3. Accept LinkedIn variant → calendar

1. Accept a LinkedIn variant from review page.
2. Open `/` → item appears on calendar (no "accepted locally" message).
3. Reload calendar → item persists.

## 4. Accept Corvo Blog variant → composer

1. Accept a blog variant → open `/?postId=...`.
2. Composer shows title, body, blog metadata fields.

## 5. Blog authoring

1. Edit excerpt, author, category, tags, slug.
2. Set hero via URL and/or upload → thumbnail preview (no URL overflow).
3. Save → reload → fields persist.

## 6. Approve + Open PR

1. Approve the blog post.
2. **Open PR** enabled when required fields filled.
3. Click **Open PR** → real GitHub PR created.
4. PR link + status badge visible in drawer.

## 7. PR status refresh

1. Click **Check PR status** → status updates (open/merged/closed).

## 8. Social connections

1. Open `/#connections` → **Refresh**.
2. LinkedIn shows connected Buffer account name.
3. Reddit shows connected Zernio account name.
4. If failed, read diagnostics (approval flag, API keys configured).

## 9. Schedule + delete LinkedIn item

1. Create or use a LinkedIn calendar item.
2. Edit schedule date in composer (no Reschedule button).
3. Delete from calendar agenda.

## 10. Full reload persistence

1. Reload `/` and `/research`.
2. All remaining items present; zero data loss.

## 11. Plain language / no jargon

Walk both surfaces in normal mode (no `?devMode=1`):

- No "Seed Workspace", "Persisted MVP Spine", "Publishing Intent", "Mock Submit"
- Header reads "Plan, approve, and publish your content" on calendar
- No Platform settings panel in composer

## 12. Research IA

- Tabs: Capture | Ideas | Research
- No "Drafts and Publishing Handoff" section
- Voice pack collapsed in sidebar
- Brand description in sidebar selector, not duplicate header card
