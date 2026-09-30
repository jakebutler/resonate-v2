#!/usr/bin/env python3
"""Prepare deterministic local qualification inputs. No network, keys, or ledger writes."""
import argparse
import hashlib
import json
import struct
from pathlib import Path


def read_reference(entry, order, role, seed_dir):
    path = Path(entry["path"])
    if not path.is_absolute():
        path = seed_dir / path
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != entry["sha256"] or data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Reference hash/format mismatch: {path.name}")
    width, height = struct.unpack(">II", data[16:24])
    return {"order": order, "role": role, "source_file_name": path.name, "sha256": digest,
            "bytes": len(data), "width": width, "height": height,
            "mime_type": "image/png", "approval_provenance": entry["approval_provenance"]}


def prepare(seed_dir):
    manifest_bytes = (seed_dir / "manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    directions = json.loads((seed_dir / "final-direction-prompts.json").read_text(encoding="utf-8"))
    scene = next(value for value in directions if value["article"] == 8)
    style = next(value for value in manifest["approved_heroes"] if value["article"] == 4)
    references = [read_reference(manifest["mascot_reference"], 1, "identity", seed_dir),
                  read_reference(style, 2, "style", seed_dir)]
    prompt = scene["text"] + "\n\nOUTPUT MASTER\nRender a 1536x1024 landscape master; keep the decisive interaction in the center band for a later 16:9 crop."
    feedback = ("Shorten only the projecting grip on the burnt-copper adjustment handwheel by about one fifth. "
                "Keep the wheel, mounting point, raven identity, upward gaze, paper construction, lighting, "
                "car restraints, three monitors, scene arrangement and all other objects unchanged. "
                "The vehicle remains under controlled testing; this is not a new scene.")
    return {
        "format_version": 1, "status": "prepared_unqualified_not_dispatched",
        "paid_calls_made": 0, "spend_ledger_owner": "implementation coordinator",
        "provider_caps_usd": {"digitalocean": 5, "openai": 5},
        "remaining_allowances": "Read coordinator ledger immediately before admission; not inferred here",
        "seed_manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "selected_scene": {"article": 8, "selection_provenance": "Jake's documented Revised Prompt iteration 2",
                           "request_provenance": scene["request_provenance"],
                           "historical_model_id": scene["historical_model_id"],
                           "exact_historical_request_verified": scene["exact_submitted_request_verified"],
                           "candidate_one_shot_validation": "not_tested",
                           "central_story": "A raven mechanic studies live measurements while a roadster remains restrained under testing"},
        "references": references,
        "generation": {"operation": "generate", "request_count": 1,
                       "canonical_model": "gpt-image-2", "ordered_inputs": [1, 2],
                       "prompt": prompt, "prompt_utf8_bytes": len(prompt.encode("utf-8")),
                       "fields": {"n": 1, "size": "1536x1024", "quality": "medium", "output_format": "png",
                                  "background": "opaque", "stream": False},
                       "digitalocean": {"api_model_id": "openai-gpt-image-2", "reference_contract": "unverified",
                                        "maximum_charge_usd": None},
                       "openai": {"api_model_id": "gpt-image-2-2026-04-21", "known_snapshot": "gpt-image-2-2026-04-21",
                                  "path": "/v1/images/edits", "encoding": "multipart", "image_field": "image[]",
                                  "qualification": "not_run", "maximum_charge_usd": None}},
        "edit": {"operation": "edit", "request_count": 1, "same_canonical_model": "gpt-image-2",
                 "parent_image": "Bind exact returned generation bytes, storage ID and SHA256; never use historical approved master as generated output",
                 "ordered_inputs": ["generated-parent", "raven-identity", "paper-style"],
                 "feedback": feedback, "prompt": "Image 1 is the selected image to edit. Image 2 supplies raven identity. Image 3 supplies materials and lighting. " + feedback,
                 "shared_remote_history_assumed": False, "maximum_charge_usd": None,
                 "settings": {"n": 1, "size": "1536x1024", "quality": "medium", "output_format": "png", "background": "opaque", "stream": False}},
        "optional_text_only_probe": {"purpose": "Engineering endpoint/receipt identity only; cannot qualify references or edits",
                                     "prompt": "One matte-paper burnt-copper adjustment handwheel on an off-white background. No text.",
                                     "request_count": 1, "maximum_charge_usd": None, "status": "not_admitted"},
        "admission_blockers": ["No reliable combined billable input/output hard bound established for exact route",
                               "DO references and edits lack a documented request contract",
                               "Provider/account identity and applicable credit eligibility must be attached by coordinator"],
        "human_review_pending": ["Raven identity", "Tactile paper style", "Story readability at 400px", "Localized edit preservation"],
        "receipt_requirements": ["Exact submitted prompt and ordered reference hashes", "Provider and model identity",
                                 "HTTP status and safe request ID", "Attempt and durable claim IDs, logical job lineage, reserved maximum",
                                 "Prompt SHA256, ordered input SHA256/roles and parent version ID", "Provider-reported model or explicit missing identity",
                                 "Durable full output bytes and hash",
                                 "Observed token categories or explicit missing usage", "Invoice versus usage-derived estimate",
                                 "Reserved maximum retained for every uncertain outcome", "Human aesthetic approval recorded separately"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    packet = prepare(args.seed_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(packet, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "status": packet["status"], "paid_calls_made": 0,
                      "reference_hashes_verified": True, "maximum_charge_usd": None}))


if __name__ == "__main__":
    main()
