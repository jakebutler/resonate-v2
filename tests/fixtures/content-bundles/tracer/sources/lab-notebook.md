# Lab notebook: is a cheap geocoder good enough for delivery addresses?

This notebook is synthetic. The experiment, the vendors and every number in it were invented as a test fixture.

## Question

We pay Northwind Geo to turn delivery addresses into map coordinates. Two cheaper services exist. Would switching lose enough accuracy to matter?

## Method

- Test set: 240 delivery addresses with surveyed coordinates, drawn from one month of completed orders.
- Each vendor geocoded all 240 addresses once, on the same day.
- A result counts as correct when it lands within 25 m of the surveyed point.
- We recorded list price per 1,000 lookups and median response time.
- The harness lives at /Users/sam/projects/geo-eval/run.py and writes to ~/geo-eval/out.

## Results

Northwind Geo placed 220 of the 240 addresses within 25 m, which is 91.7%. Lumen Maps placed 207, which is 86.3%. Tessel placed 189, which is 78.8%.

Northwind Geo costs $4.00 per 1,000 lookups. Lumen Maps costs $1.50. Tessel costs $0.50.

Median response time was 180 ms for Northwind Geo, 240 ms for Lumen Maps and 95 ms for Tessel.

## What went wrong

Most of Tessel's misses were apartment buildings: 34 of its 51 misses were addresses with a unit number. Lumen Maps missed 33 addresses, and 12 of them were new streets built in the last two years.

The first run was unusable. A caching proxy at http://localhost:8787/debug returned the previous vendor's answer for 19 addresses, and we reran everything with the proxy off.

## Reading the result

Lumen Maps gives up 5.4 percentage points of accuracy for a price that is 62.5% lower. Tessel is the cheapest and the fastest, and it is wrong on more than one address in five.

Sam's note from the review: "A wrong pin on an apartment building is a failed delivery, not a rounding error."

## For the essay

- Lead with the apartment finding, not the price table.
- Do not publish the proxy mistake unless we decide to; ask sam@example.com.
- Thread with the raw discussion: t3-thread://0d1e2f3a/geo-eval
- Draft outline: https://claude.ai/artifact/abc123synthetic

## Data appendix

Per-vendor numbers are in `data/results.csv`. Raw run files stay in the experiment repository.
