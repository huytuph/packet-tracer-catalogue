#!/usr/bin/env python3
"""Regression tests for generated-data freshness across SQLite builds."""
from __future__ import annotations

import runpy
import shutil
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1]
CHECKER = runpy.run_path(str(ROOT / 'tests' / 'validate_generated_data.py'))


class GeneratedDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix='pt-generated-tests-')
        cls.expected_database, cls.expected_bundle = CHECKER['build_expected_data'](Path(cls.directory.name))

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def setUp(self):
        self.actual_database = Path(self.directory.name) / 'actual.db'
        self.actual_bundle = Path(self.directory.name) / 'actual.js'
        shutil.copyfile(self.expected_database, self.actual_database)
        shutil.copyfile(self.expected_bundle, self.actual_bundle)

    def compare(self):
        return CHECKER['compare_generated_data'](self.actual_database, self.actual_bundle,
                                                 self.expected_database, self.expected_bundle)

    def change_database(self, sql):
        with closing(sqlite3.connect(self.actual_database)) as conn:
            conn.execute(sql)
            conn.commit()

    def test_fresh_files_match(self):
        self.assertEqual(self.compare(), [])

    def test_older_sqlite_fallback_excludes_only_known_fts_storage(self):
        conn = Mock()
        conn.execute.return_value.fetchall.return_value = []
        self.assertEqual(CHECKER['shadow_table_names'](conn), {
            'device_search_fts_data', 'device_search_fts_idx', 'device_search_fts_content',
            'device_search_fts_docsize', 'device_search_fts_config',
        })
        conn.execute.assert_called_once_with('PRAGMA table_list')

    def test_writer_version_header_is_not_a_data_change(self):
        original = self.actual_database.read_bytes()
        changed = bytearray(original)
        writer_version = int.from_bytes(changed[96:100], 'big')
        changed[96:100] = (writer_version + 1).to_bytes(4, 'big')
        self.actual_database.write_bytes(changed)
        self.assertNotEqual(self.actual_database.read_bytes(), original)
        self.assertEqual(self.compare(), [])

    def test_vacuum_layout_changes_preserve_logical_contents(self):
        self.change_database('VACUUM')
        self.assertEqual(self.compare(), [])

    def test_changed_catalogue_row_is_detected(self):
        self.change_database("UPDATE devices SET description='Stale description' WHERE device_id=1")
        self.assertIn('Database rows differ from the current seed in devices', self.compare())

    def test_changed_fts_logical_row_is_detected(self):
        self.change_database("UPDATE device_search_fts SET display_name='Stale index' WHERE device_id=1")
        self.assertIn('Database rows differ from the current seed in device_search_fts', self.compare())

    def test_changed_schema_is_detected(self):
        self.change_database('CREATE INDEX release_regression ON devices(description)')
        self.assertIn('Database schema differs from the current seed', self.compare())

    def test_browser_bundle_requires_exact_bytes(self):
        self.actual_bundle.write_bytes(self.actual_bundle.read_bytes() + b'\n')
        self.assertIn('Browser bundle differs byte-for-byte from the current seed export', self.compare())


if __name__ == '__main__':
    unittest.main()
