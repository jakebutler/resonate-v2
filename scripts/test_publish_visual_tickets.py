"""Offline public-behavior tests for the ticket publisher's gh subprocess boundary."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("publish-visual-tickets.py")
spec = importlib.util.spec_from_file_location("publish_visual_tickets", SCRIPT)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublisherIssueBodyTests(unittest.TestCase):
    def test_existing_empty_issue_receives_generated_links_when_body_is_null_or_absent(self):
        url = "https://github.com/jakebutler/resonate-v2/issues/23"
        links = "## Parent and dependency links\n\nParent: current-parent"
        for payload in ({"body": None}, {}):
            with self.subTest(payload=payload):
                edited_bodies = []

                def run(command, **kwargs):
                    if command[1:3] == ["issue", "list"]:
                        result = [{"title": "V01: Example", "url": url}]
                    elif command[1:3] == ["issue", "view"]:
                        result = payload
                    elif command[1:3] == ["issue", "edit"]:
                        self.assertEqual(command[3], url)
                        body_file = Path(command[command.index("--body-file") + 1])
                        edited_bodies.append(body_file.read_text(encoding="utf-8"))
                        result = {}
                    else:
                        self.fail(f"unexpected gh command: {command}")
                    return subprocess.CompletedProcess(command, 0, json.dumps(result), "")

                with tempfile.TemporaryDirectory() as directory, patch.object(publisher.subprocess, "run", side_effect=run):
                    result = publisher.publish(
                        "V01: Example", "prepared body is not authoritative", "v01.md",
                        links, Path(directory),
                    )
                self.assertEqual(result, url)
                self.assertEqual(edited_bodies, [
                    f"\n\n{publisher.LINKS_START}\n{links}\n{publisher.LINKS_END}\n"
                ])

    def test_main_child_failure_preserves_existing_parent_links_and_manual_body(self):
        parent_url = "https://github.com/jakebutler/resonate-v2/issues/23"
        original = (
            "# Parent\n\nHuman-edited plan.\n- [x] V01 is complete\n\n"
            f"{publisher.LINKS_START}\n## Child issues\n\n"
            "- [V01](https://github.com/jakebutler/resonate-v2/issues/24)\n"
            f"{publisher.LINKS_END}\n"
        )
        saved_body = original

        def run(command, **kwargs):
            nonlocal saved_body
            operation = command[1:3]
            if operation == ["label", "list"]:
                payload = [{"name": "enhancement"}]
            elif operation == ["issue", "list"]:
                title = command[command.index("--search") + 1]
                if title != "Parent":
                    raise RuntimeError("child search unavailable")
                payload = [{"title": "Parent", "url": parent_url}]
            elif operation == ["issue", "view"]:
                payload = {"body": saved_body}
            elif operation == ["issue", "edit"]:
                saved_body = Path(command[command.index("--body-file") + 1]).read_text()
                payload = {}
            else:
                self.fail(f"unexpected gh command: {command}")
            return subprocess.CompletedProcess(command, 0, json.dumps(payload), "")

        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            (source / "tickets").mkdir()
            (source / "tickets/PARENT.md").write_text("# Parent\nPrepared plan.")
            (source / "tickets/V01.md").write_text("# V01\nPrepared acceptance.")
            (source / "tickets/index.json").write_text(json.dumps([
                {"id": "V01", "title": "V01: Example", "body_file": "V01.md", "blocked_by": []}
            ]))
            with patch.object(publisher.subprocess, "run", side_effect=run):
                with self.assertRaisesRegex(RuntimeError, "child search unavailable"):
                    publisher.main(["--source", directory])
        self.assertEqual(saved_body, original)

    def test_invalid_source_stops_before_any_gh_command(self):
        with patch.object(publisher.subprocess, "run") as run, tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "source is incomplete"):
                publisher.main(["--source", directory])
        run.assert_not_called()

    def test_existing_manual_checklist_and_edited_prose_survive_link_refresh(self):
        url = "https://github.com/jakebutler/resonate-v2/issues/23"
        original = (
            "# V01\n\nHuman-edited acceptance detail.\n\n- [x] Manual checklist item\n\n"
            f"{publisher.LINKS_START}\n## Parent and dependency links\n\nParent: old\n"
            f"{publisher.LINKS_END}\n"
        )
        calls = []

        def run(command, **kwargs):
            calls.append(command)
            if command[1:3] == ["issue", "list"]:
                return subprocess.CompletedProcess(command, 0, json.dumps([{"title": "V01: Example", "url": url}]), "")
            if command[1:3] == ["issue", "view"]:
                return subprocess.CompletedProcess(command, 0, json.dumps({"body": original}), "")
            if command[1:3] == ["issue", "edit"]:
                body_file = Path(command[command.index("--body-file") + 1])
                updated = body_file.read_text(encoding="utf-8")
                self.assertIn("Human-edited acceptance detail.", updated)
                self.assertIn("- [x] Manual checklist item", updated)
                self.assertEqual(updated.count(publisher.LINKS_START), 1)
                self.assertIn("Parent: current-parent", updated)
                self.assertIn("Blocked by [V00](https://example.test/0)", updated)
                return subprocess.CompletedProcess(command, 0, "", "")
            self.fail(f"unexpected gh command: {command}")

        with tempfile.TemporaryDirectory() as directory, patch.object(publisher.subprocess, "run", side_effect=run):
            result = publisher.publish(
                "V01: Example", "prepared body is not authoritative", "v01.md",
                "## Parent and dependency links\n\nParent: current-parent\n- Blocked by [V00](https://example.test/0)",
                Path(directory),
            )
        self.assertEqual(result, url)
        self.assertEqual(sum("edit" in call for call in calls), 1)

    def test_ambiguous_markers_fail_closed_before_issue_edit(self):
        malformed = f"body\n{publisher.LINKS_START}\na\n{publisher.LINKS_START}\nb\n{publisher.LINKS_END}"
        with self.assertRaisesRegex(RuntimeError, "Malformed or ambiguous"):
            publisher.with_generated_links(malformed, "new links")

    def test_first_link_block_append_preserves_existing_trailing_body_bytes(self):
        human_body = "Human prose.\n- [x] Checked\n  \n"
        updated = publisher.with_generated_links(human_body, "generated")
        self.assertTrue(updated.startswith(human_body))
        self.assertEqual(updated.count(publisher.LINKS_START), 1)

    def test_unknown_create_outcome_recovers_existing_issue_without_retry(self):
        url = "https://github.com/jakebutler/resonate-v2/issues/47"
        list_count = 0
        create_count = 0

        def run(command, **kwargs):
            nonlocal list_count, create_count
            if command[1:3] == ["issue", "list"]:
                list_count += 1
                rows = [] if list_count == 1 else [{"title": "Parent", "url": url}]
                return subprocess.CompletedProcess(command, 0, json.dumps(rows), "")
            if command[1:3] == ["issue", "create"]:
                create_count += 1
                raise subprocess.TimeoutExpired(command, 45)
            self.fail(f"unexpected gh command: {command}")

        with tempfile.TemporaryDirectory() as directory, patch.object(publisher.subprocess, "run", side_effect=run):
            result = publisher.publish("Parent", "# Parent", "parent.md", "", Path(directory))
        self.assertEqual(result, url)
        self.assertEqual(create_count, 1)
        self.assertEqual(list_count, 2)


if __name__ == "__main__":
    unittest.main()
