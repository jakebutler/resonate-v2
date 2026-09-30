"""Offline qualification-packet path/encoding regression; no provider or ledger calls."""
import hashlib
import json
import runpy
import struct
import tempfile
import unittest
from pathlib import Path

PREPARE = runpy.run_path(str(Path(__file__).with_name("visual-provider-qualification-packet.py")))["prepare"]


class QualificationPacketTest(unittest.TestCase):
    def test_relative_and_absolute_assets_emit_only_portable_names(self):
        for absolute in (False, True):
            with self.subTest(absolute=absolute), tempfile.TemporaryDirectory() as folder:
                seed = Path(folder)
                references = []
                for name in ("identity.png", "style.png"):
                    data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + struct.pack(">II", 1, 1)
                    asset = seed / name
                    asset.write_bytes(data)
                    references.append({"path": str(asset) if absolute else name,
                                       "sha256": hashlib.sha256(data).hexdigest(),
                                       "approval_provenance": "speculative offline fixture"})
                (seed / "manifest.json").write_text(json.dumps({"mascot_reference": references[0],
                    "approved_heroes": [{"article": 4, **references[1]}]}), encoding="utf-8")
                (seed / "final-direction-prompts.json").write_text(json.dumps([{"article": 8,
                    "text": "Raven café fixture", "request_provenance": "speculative offline fixture",
                    "historical_model_id": None, "exact_submitted_request_verified": False}], ensure_ascii=False), encoding="utf-8")
                result = PREPARE(seed)
                self.assertEqual([reference["source_file_name"] for reference in result["references"]], ["identity.png", "style.png"])
                self.assertNotIn(folder, json.dumps(result))
                self.assertIn("café", result["generation"]["prompt"])
                self.assertEqual(result["paid_calls_made"], 0)
                self.assertIsNone(result["generation"]["openai"]["maximum_charge_usd"])


if __name__ == "__main__":
    unittest.main()
