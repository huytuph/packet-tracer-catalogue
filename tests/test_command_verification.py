#!/usr/bin/env python3
"""Synthetic validator fixtures only: these are not Packet Tracer executions."""
from __future__ import annotations

import copy
import hashlib
import json
import runpy
import tempfile
import unittest
from pathlib import Path

API = runpy.run_path(str(Path(__file__).with_name("validate_command_verification.py")))


class CommandVerificationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.path = self.root / "evidence" / "runtime" / "synthetic-only.txt"
        self.path.parent.mkdir(parents=True)
        self.transcript = "R#configure terminal\nR(config)#hostname Lab\nLab(config)#end\nLab#show running-config\nhostname Lab\nLab#show ip interface brief\nGigabitEthernet0/0 unassigned administratively down\n"
        self.path.write_bytes(self.transcript.encode("utf-8"))
        self.record = {
            "id": "synthetic-only", "model": "1941", "major_version": 9, "observed_release": "9.0.1",
            "template_revision": "2.0.1", "format": "txt", "modules": [],
            "prerequisites": ["Disposable default device, synthetic unit fixture only"],
            "commands": [{"rule_id": "session.configure", "text": "configure terminal", "result": "accepted"},
                         {"rule_id": "system.hostname", "text": "hostname Lab", "result": "accepted"},
                         {"rule_id": "session.end", "text": "end", "result": "accepted"}],
            "checks": [{"rule_id": "verify.running", "text": "show running-config", "result": "accepted"},
                       {"rule_id": "verify.interfaces", "text": "show ip interface brief", "result": "accepted"}],
            "evidence": {"method": "packet-tracer-runtime", "transcript_path": "evidence/runtime/synthetic-only.txt",
                         "transcript_sha256": hashlib.sha256(self.path.read_bytes()).hexdigest(),
                         "checked_date": "2026-10-02", "error_count": 0,
                         "running_config_assertions": ["hostname Lab"],
                         "diagnostic_assertions": ["GigabitEthernet0/0 unassigned administratively down"]}}

    def errors(self, record=None):
        return API["validate_manifest"]({"schema_version": 1, "records": [record or self.record]},
                                         self.root, {"1941", "HomeRouter"}, {1, 2, 3})

    def test_empty_manifest_and_synthetic_consistency(self):
        self.assertEqual(API["validate_manifest"]({"schema_version": 1, "records": []}, self.root, set(), set()), [])
        self.assertEqual(self.errors(), [])

    def test_json_markers_and_duplicate_keys(self):
        parse = API["parse_manifest"]
        source = API["BEGIN"] + json.dumps({"schema_version": 1, "records": []}) + API["END"]
        self.assertEqual(parse(source)["records"], [])
        for payload in ("", source + API["BEGIN"], API["END"] + API["BEGIN"],
                        API["BEGIN"] + '{"records":[],"records":[]}' + API["END"],
                        API["BEGIN"] + '{"schema_version":NaN}' + API["END"]):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                parse(payload)

    def test_schema_shapes_and_types(self):
        for manifest in (None, [], {}, {"schema_version": True, "records": []},
                         {"schema_version": 1, "records": {}}, {"schema_version": 1, "records": [None]}):
            with self.subTest(manifest=manifest):
                self.assertTrue(API["validate_manifest"](manifest, self.root, {"1941"}, set()))
        for key, value in (("id", "bad/id"), ("model", "HomeRouter"), ("model", []), ("major_version", True),
                           ("major_version", "9"), ("observed_release", "8.2"), ("observed_release", "09.0.1"), ("observed_release", "9.x"),
                           ("template_revision", "1.0.0"), ("format", "pkt"), ("prerequisites", [])):
            with self.subTest(key=key, value=value):
                item = copy.deepcopy(self.record)
                item[key] = value
                self.assertTrue(self.errors(item))

    def test_command_and_assertion_bounds(self):
        item = copy.deepcopy(self.record)
        item["checks"] = [item["checks"][1]]
        self.assertTrue(any("show running-config" in error for error in self.errors(item)))
        for field, value in (("rule_id", "BAD_RULE"), ("text", " hostname Lab"), ("text", "hostname Lab\nend"),
                             ("text", "x" * 1025), ("result", "documented")):
            with self.subTest(field=field):
                item = copy.deepcopy(self.record)
                item["commands"][0][field] = value
                self.assertTrue(self.errors(item))
        for key, value in (("method", "node-test"), ("error_count", True), ("error_count", 1),
                           ("checked_date", "2026-02-30"), ("checked_date", "2026-1-1"),
                           ("running_config_assertions", []), ("diagnostic_assertions", ["x" * 2049])):
            with self.subTest(key=key):
                item = copy.deepcopy(self.record)
                item["evidence"][key] = value
                self.assertTrue(self.errors(item))

    def test_module_id_and_quantity_constraints(self):
        for modules in (None, [{"moduleId": 4, "quantity": 1}], [{"moduleId": 1, "quantity": True}],
                        [{"moduleId": 1, "quantity": 17}], [{"moduleId": 1, "quantity": 1}] * 2,
                        [{"moduleId": 2, "quantity": 1}, {"moduleId": 1, "quantity": 1}]):
            with self.subTest(modules=modules):
                item = copy.deepcopy(self.record)
                item["modules"] = modules
                self.assertTrue(self.errors(item))
        item = copy.deepcopy(self.record)
        item["modules"] = [{"moduleId": 1, "quantity": 16}]
        self.assertEqual(self.errors(item), [])

    def test_trusted_transcript_paths(self):
        for value in ("/evidence/runtime/a.txt", "C:/evidence/runtime/a.txt", "evidence\\runtime\\a.txt",
                      "evidence/runtime/../a.txt", "evidence/runtime/./a.txt", "evidence//runtime/a.txt",
                      "tests/a.txt", "evidence/runtime/missing.txt", None):
            with self.subTest(path=value):
                item = copy.deepcopy(self.record)
                item["evidence"]["transcript_path"] = value
                self.assertTrue(self.errors(item))

    def test_transcript_hash_order_assertions_and_parser_errors(self):
        item = copy.deepcopy(self.record)
        item["evidence"]["transcript_sha256"] = "0" * 64
        self.assertTrue(self.errors(item))
        for transcript in (self.transcript.replace("R#configure terminal\n", ""),
                           self.transcript.replace("\nhostname Lab\n", "\n"),
                           self.transcript.replace("R#configure terminal\n", "").replace("Lab(config)#end", "R#configure terminal\nLab(config)#end"),
                           self.transcript.replace("GigabitEthernet0/0 unassigned administratively down", "no output"),
                           self.transcript + "% Invalid input detected at '^' marker.\n",
                           self.transcript + "% Ambiguous command: example\n",
                           self.transcript + "% Incomplete command.\n",
                           self.transcript + "% Command not implemented\n"):
            with self.subTest(transcript=transcript):
                self.path.write_bytes(transcript.encode("utf-8"))
                item = copy.deepcopy(self.record)
                item["evidence"]["transcript_sha256"] = hashlib.sha256(self.path.read_bytes()).hexdigest()
                self.assertTrue(self.errors(item))

    def test_unique_ids_and_one_exact_release_per_major(self):
        other = copy.deepcopy(self.record)
        manifest = {"schema_version": 1, "records": [self.record, other]}
        self.assertTrue(API["validate_manifest"](manifest, self.root, {"1941"}, set()))
        other["id"] = "second-synthetic-only"
        self.assertEqual(API["validate_manifest"](manifest, self.root, {"1941"}, set()), [])
        other["observed_release"] = "9.0.2"
        self.assertTrue(any("ambiguous" in error for error in API["validate_manifest"](manifest, self.root, {"1941"}, set())))

    def test_symlink_escape_when_supported(self):
        outside = self.root / "outside.txt"
        outside.write_text(self.transcript, encoding="utf-8")
        link = self.path.parent / "escape.txt"
        try:
            link.symlink_to(outside)
        except OSError as exc:
            self.skipTest(f"Symlink creation unavailable: {exc}")
        item = copy.deepcopy(self.record)
        item["evidence"]["transcript_path"] = "evidence/runtime/escape.txt"
        self.assertTrue(self.errors(item))


if __name__ == "__main__":
    unittest.main()
