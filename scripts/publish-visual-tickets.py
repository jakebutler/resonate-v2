"""Publish prepared editorial visual issues, verifying duplicates before each write."""
import json
import re
import subprocess
from pathlib import Path

REPO = "jakebutler/resonate-v2"
SOURCE = Path("/Users/jacobbutler/Documents/Codex/2026-09-28/you-are-continuing-work-for-jake/work/resonate-visual-generation")
OUTPUT = SOURCE / "execution"


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


def publish(title, body, filename):
    found = existing(title)
    if found:
        return found
    body_path = OUTPUT / filename
    body_path.write_text(body)
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


def main():
    OUTPUT.mkdir(exist_ok=True)
    labels = json.loads(gh("label", "list", "--repo", REPO, "--limit", "100", "--json", "name"))
    if "enhancement" not in [row["name"] for row in labels]:
        raise RuntimeError("Existing enhancement label unavailable")
    tickets = json.loads((SOURCE / "tickets/index.json").read_text())
    parent_body = (SOURCE / "tickets/PARENT.md").read_text()
    parent_title = parent_body.splitlines()[0].removeprefix("# ")
    parent_url = publish(parent_title, parent_body, "parent-published.md")
    mapping = {"parent": parent_url, "tickets": {}}
    mapping_path = OUTPUT / "issue-map.json"
    mapping_path.write_text(json.dumps(mapping, indent=2) + "\n")
    for ticket in tickets:
        for dependency in ticket["blocked_by"]:
            if dependency not in mapping["tickets"]:
                raise RuntimeError(f"Missing dependency {dependency}")
        body = (SOURCE / "tickets" / ticket["body_file"]).read_text()
        body += f"\n\n## Parent and dependency links\n\nParent: {parent_url}\n"
        body += "\n".join(f"- Blocked by [{dependency}]({mapping['tickets'][dependency]})" for dependency in ticket["blocked_by"])
        # Replace identifiers in dependency sections while retaining acceptance text.
        before, sep, after = body.partition("### Blocked by")
        for dependency in ticket["blocked_by"]:
            after = re.sub(rf"(?<![\w\[])\b{dependency}\b(?![\w\]])", f"[{dependency}]({mapping['tickets'][dependency]})", after)
        body = before + sep + after
        url = publish(ticket["title"], body, ticket["id"] + "-published.md")
        mapping["tickets"][ticket["id"]] = url
        mapping_path.write_text(json.dumps(mapping, indent=2) + "\n")
        print(ticket["id"], url, flush=True)
    for ticket in tickets:
        parent_body = parent_body.replace(f"- [ ] {ticket['id']}:", f"- [ ] [{ticket['id']}]({mapping['tickets'][ticket['id']]}):")
    parent_path = OUTPUT / "parent-linked.md"
    parent_path.write_text(parent_body)
    gh("issue", "edit", parent_url, "--body-file", str(parent_path))
    gh("issue", "view", parent_url, "--json", "url,body")
    Path("docs/editorial-visuals/issues.json").write_text(json.dumps(mapping, indent=2) + "\n")
    print("Parent", parent_url, flush=True)


if __name__ == "__main__":
    main()
