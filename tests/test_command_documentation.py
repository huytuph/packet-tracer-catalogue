#!/usr/bin/env python3
"""Synthetic schema tests only, not Cisco source reviews or simulator runs."""
from __future__ import annotations

import copy
import json
import unittest

from validate_command_documentation import BEGIN, END, REVISION, validate_manifest
from validate_command_verification import parse_manifest


class CommandDocumentationTests(unittest.TestCase):
    def setUp(self):
        self.reference = {"id": "synthetic-schema-only", "model": "2911", "major_version": 9,
                          "documented_release": "9.0.1", "source_url": "https://tutorials.ptnetacad.net/help/default/CLI_routerIOS15.htm",
                          "source_kind": "packet-tracer-installed-help", "source_sha256": "0" * 64, "checked_date": "2026-10-02",
                          "rule_ids": ["exec.enable", "exec.configure-terminal", "global.hostname", "exec.end", "show.running-config", "show.ios.interface-brief"],
                          "constraints": [{"rule_id": "global.hostname", "pattern": "^hostname [A-Za-z0-9_-]+$", "reason": "Synthetic validator fixture only"}],
                          "prerequisites": [], "notes": ["Synthetic schema fixture, not reviewed command evidence"]}

    def errors(self, reference=None):
        return validate_manifest({"schema_version": 1, "template_revision": REVISION, "references": [reference or self.reference]}, {"2911", "HomeRouter"})

    def test_valid_shapes_and_marker_parser(self):
        self.assertEqual(self.errors(), [])
        manifest = {"schema_version": 1, "template_revision": REVISION, "references": []}
        self.assertEqual(parse_manifest(BEGIN + json.dumps(manifest) + END, BEGIN, END), manifest)
        self.assertEqual(validate_manifest(manifest, set()), [])

    def test_context_identity_release_and_provenance(self):
        for key, value in (("id", "bad/id"), ("model", "HomeRouter"), ("model", []), ("major_version", True),
                           ("major_version", "9"), ("documented_release", "8.2.2"), ("documented_release", "9.x"),
                           ("source_kind", "packet-tracer-runtime"), ("source_sha256", "abc"), ("checked_date", "2026-02-30"),
                           ("prerequisites", ["\nsecret"]), ("notes", ["x" * 2049])):
            with self.subTest(key=key, value=value):
                record = copy.deepcopy(self.reference); record[key] = value
                self.assertTrue(self.errors(record))

    def test_only_official_source_urls(self):
        for url in ("https://example.com/ref.htm", "http://tutorials.ptnetacad.net/help/default/ref.htm",
                    "https://tutorials.ptnetacad.net@evil.com/help/default/ref.htm",
                    "https://tutorials.ptnetacad.net/help/default/../ref.htm", "https://tutorials.ptnetacad.net/help/default/ref.htm?x=1",
                    "https://tutorials.ptnetacad.net/help/default/ref.htm#fragment", None):
            with self.subTest(url=url):
                record = copy.deepcopy(self.reference); record["source_url"] = url
                self.assertTrue(self.errors(record))

    def test_rule_and_constraint_safety(self):
        for rules in ([], ["bad_RULE"], self.reference["rule_ids"][:-1], self.reference["rule_ids"] * 2):
            record = copy.deepcopy(self.reference); record["rule_ids"] = rules
            self.assertTrue(self.errors(record))
        for key, value in (("rule_id", "unknown.rule"), ("pattern", "hostname .*"), ("pattern", "^[$"), ("reason", "")):
            record = copy.deepcopy(self.reference); record["constraints"][0][key] = value
            self.assertTrue(self.errors(record))

    def test_duplicate_contexts_and_invalid_top_level(self):
        for manifest in (None, {}, {"schema_version": True, "template_revision": REVISION, "references": []},
                         {"schema_version": 1, "template_revision": "2.0.1", "references": []},
                         {"schema_version": 1, "template_revision": REVISION, "references": [None]}):
            self.assertTrue(validate_manifest(manifest, {"2911"}))
        other = copy.deepcopy(self.reference); other["id"] = "other"
        self.assertTrue(validate_manifest({"schema_version": 1, "template_revision": REVISION, "references": [self.reference, other]}, {"2911"}))

    def test_unexpected_fields_and_missing_baseline(self):
        record = copy.deepcopy(self.reference); record["extra"] = True
        self.assertTrue(self.errors(record))
        record = copy.deepcopy(self.reference); record["constraints"][0]["extra"] = True
        self.assertTrue(self.errors(record))
        for rule in self.reference["rule_ids"]:
            record = copy.deepcopy(self.reference)
            record["rule_ids"].remove(rule)
            self.assertTrue(self.errors(record))

    def test_json_duplicate_fields_and_nonstandard_constants(self):
        for source in (BEGIN + '{"schema_version":1,"schema_version":1}' + END, BEGIN + '{"schema_version":NaN}' + END,
                       BEGIN + '{}' + END + BEGIN, END + BEGIN):
            with self.subTest(source=source), self.assertRaises(ValueError):
                parse_manifest(source, BEGIN, END)


if __name__ == "__main__":
    unittest.main()
