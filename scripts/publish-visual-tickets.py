"""Publish prepared editorial visual issues, verifying duplicates before each write."""
import argparse
import json
import os
import re
import subprocess
from pathlib import Path

REPO = "jakebutler/resonate-v2"
LINKS_START = "<!-- resonate-editorial-visual-generated-links:v1:start -->"
LINKS_END = "<!-- resonate-editorial-visual-generated-links:v1:end -->"


def gh(*args):
    result = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=45)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def existing(title):
    rows = json.loads(gh("issue", "list", "--repo", REPO, "--state", "all", "--search", title, "--limit", "100", "--json", "number,title,url"))
    matches = [row for row in rows if row["title"].casefold() == title.casefold()]
    if len(matches) > 1:
        raise RuntimeError(f"Multiple exact title matches for {title}; preserve and inspect")
    return matches[0]["url"] if matches else None


def issue_body(url):
    return json.loads(gh("issue", "view", url, "--repo", REPO, "--json", "body"))["body"]


def with_generated_links(body, links):
    starts, ends = body.count(LINKS_START), body.count(LINKS_END)
    if starts != ends or starts > 1:
        raise RuntimeError("Malformed or ambiguous generated issue-link markers; preserve and inspect")
    block = LINKS_START + "\n" + links.rstrip() + "\n" + LINKS_END
    if starts == 0:
        separator = "" if body.endswith("\n\n") else "\n" if body.endswith("\n") else "\n\n"
        return body + separator + block + "\n"
    start = body.index(LINKS_START)
    end = body.index(LINKS_END)
    if end < start:
        raise RuntimeError("Malformed generated issue-link marker order; preserve and inspect")
    end += len(LINKS_END)
    return body[:start] + block + body[end:]


def publish(title, body, filename, links, output):
    found = existing(title)
    if found:
        current = issue_body(found)
        updated = with_generated_links(current, links or "")
        # None validates the owned block without replacing it before all children resolve.
        if links is not None and updated != current:
            body_path = output / filename
            body_path.write_text(updated, encoding="utf-8")
            gh("issue", "edit", found, "--body-file", str(body_path))
        return found
    body_path = output / filename
    body_path.write_text(with_generated_links(body, links or ""), encoding="utf-8")
    try:
        url = gh("issue", "create", "--repo", REPO, "--title", title, "--body-file", str(body_path), "--label", "enhancement")
    except (RuntimeError, subprocess.TimeoutExpired):
        # Search/readback may recover an unknown outcome. Never blindly retry creation.
        recovered = existing(title)
        if recovered:
            return recovered
        raise
    gh("issue", "view", url, "--json", "title,url")
    return url


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=os.environ.get("RESONATE_VISUAL_TICKETS_SOURCE"),
                        help="prepared ticket directory (or RESONATE_VISUAL_TICKETS_SOURCE)")
    args = parser.parse_args(argv)
    if not args.source:
        parser.error("--source or RESONATE_VISUAL_TICKETS_SOURCE is required")
    source = Path(args.source).expanduser().resolve()
    index_path, parent_path = source / "tickets/index.json", source / "tickets/PARENT.md"
    if not source.is_dir() or not index_path.is_file() or not parent_path.is_file():
        raise RuntimeError(f"Prepared ticket source is incomplete: {source}")
    tickets = json.loads(index_path.read_text(encoding="utf-8"))
    for ticket in tickets:
        if not (source / "tickets" / ticket["body_file"]).is_file():
            raise RuntimeError(f"Missing ticket body: {ticket['body_file']}")
    output = source / "execution"
    output.mkdir(exist_ok=True)

    labels = json.loads(gh("label", "list", "--repo", REPO, "--limit", "100", "--json", "name"))
    if "enhancement" not in [row["name"] for row in labels]:
        raise RuntimeError("Existing enhancement label unavailable")
    parent_body = parent_path.read_text(encoding="utf-8")
    parent_title = parent_body.splitlines()[0].removeprefix("# ")
    parent_url = publish(parent_title, parent_body, "parent-published.md", None, output)
    mapping = {"parent": parent_url, "tickets": {}}
    mapping_path = output / "issue-map.json"
    mapping_path.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
    for ticket in tickets:
        for dependency in ticket["blocked_by"]:
            if dependency not in mapping["tickets"]:
                raise RuntimeError(f"Missing dependency {dependency}")
        body = (source / "tickets" / ticket["body_file"]).read_text(encoding="utf-8")
        links = f"## Parent and dependency links\n\nParent: {parent_url}\n"
        links += "\n".join(f"- Blocked by [{dependency}]({mapping['tickets'][dependency]})" for dependency in ticket["blocked_by"])
        before, sep, after = body.partition("### Blocked by")
        for dependency in ticket["blocked_by"]:
            after = re.sub(rf"(?<![\w\[])\b{dependency}\b(?![\w\]])", f"[{dependency}]({mapping['tickets'][dependency]})", after)
        body = before + sep + after
        url = publish(ticket["title"], body, ticket["id"] + "-published.md", links, output)
        mapping["tickets"][ticket["id"]] = url
        mapping_path.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
        print(ticket["id"], url, flush=True)

    parent_links = "## Child issues\n\n" + "\n".join(
        f"- [{ticket['id']}]({mapping['tickets'][ticket['id']]}) — {ticket['title']}" for ticket in tickets
    )
    current_parent = issue_body(parent_url)
    updated_parent = with_generated_links(current_parent, parent_links)
    if updated_parent != current_parent:
        final_path = output / "parent-linked.md"
        final_path.write_text(updated_parent, encoding="utf-8")
        gh("issue", "edit", parent_url, "--body-file", str(final_path))
    gh("issue", "view", parent_url, "--repo", REPO, "--json", "url,body")
    Path("docs/editorial-visuals/issues.json").write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
    print("Parent", parent_url, flush=True)


if __name__ == "__main__":
    main()
