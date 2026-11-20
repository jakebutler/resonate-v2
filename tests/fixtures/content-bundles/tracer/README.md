# Tracer fixture

A **synthetic** content bundle: an invented experiment, invented vendors, invented numbers. It exists so tests have one stable bundle to push, draft from and review. No real notebook is ever committed to this repository (plan A23).

- `bundle.json` is the manifest (format v1). Its plan has one Corvo Labs article, one Corvo Labs LinkedIn post that links to it, and two items an M1 server defers: a LinkedIn Article mirror of the article, and a FreshProof cross-promotion post.
- `sources/lab-notebook.md` contains planted scrub cases (a local path, a home path, a localhost URL, an e-mail address, a thread link, a private artifact link) and two internal headings ("For the essay", "Data appendix"). It contains no secrets.
- `data/results.csv` holds the numbers the notebook quotes, so cell bindings can be tested against it.
- `EXPECTED.json` holds each file's SHA-256 and the manifest fingerprint (SHA-256 of `bundle.json` serialised per RFC 8785).

Do not edit these files without regenerating `EXPECTED.json` and the hashes inside `bundle.json`.
