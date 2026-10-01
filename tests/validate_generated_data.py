#!/usr/bin/env python3
"""Check committed generated data without relying on SQLite binary layout."""
from __future__ import annotations

import io
import runpy
import sqlite3
import sys
import tempfile
from contextlib import closing, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / 'data' / 'packet-tracer.db'
BUNDLE_PATH = ROOT / 'data' / 'catalogue-data.js'


def shadow_table_names(conn: sqlite3.Connection) -> set[str]:
    table_list = conn.execute('PRAGMA table_list').fetchall()
    if table_list:
        return {row[1] for row in table_list if row[2] == 'shadow'}
    # Early Python 3.10 builds predate table_list; this seed has one FTS5 table.
    return {f'device_search_fts_{suffix}' for suffix in ('data', 'idx', 'content', 'docsize', 'config')}


def database_snapshot(path: Path):
    with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as conn:
        integrity = conn.execute('PRAGMA integrity_check').fetchone()[0]
        if integrity != 'ok':
            raise ValueError(f'SQLite integrity check failed: {integrity}')
        shadow_tables = shadow_table_names(conn)
        schema = [tuple(row) for row in conn.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')
                  if not row[1].startswith('sqlite_') and row[2] not in shadow_tables]
        contents = {}
        for kind, name, _, _ in schema:
            if kind != 'table':
                continue
            identifier = '"' + name.replace('"', '""') + '"'
            contents[name] = sorted(conn.execute(f'SELECT * FROM {identifier}').fetchall(), key=repr)
        return schema, contents


def database_differences(actual: Path, expected: Path) -> list[str]:
    actual_schema, actual_rows = database_snapshot(actual)
    expected_schema, expected_rows = database_snapshot(expected)
    failures = []
    if actual_schema != expected_schema:
        failures.append('Database schema differs from the current seed')
    for table in sorted(set(actual_rows) | set(expected_rows)):
        if actual_rows.get(table) != expected_rows.get(table):
            failures.append(f'Database rows differ from the current seed in {table}')
    return failures


def build_expected_data(directory: Path):
    database = directory / 'packet-tracer.db'
    bundle = directory / 'catalogue-data.js'
    seed = runpy.run_path(str(ROOT / 'tools' / 'init_database.py'))
    seed['main'].__globals__['DB'] = database
    export = runpy.run_path(str(ROOT / 'tools' / 'export_browser_data.py'))
    export['main'].__globals__.update(DB=database, OUT=bundle)
    with redirect_stdout(io.StringIO()):
        seed['main']()
        export['main']()
    return database, bundle


def compare_generated_data(actual_database: Path, actual_bundle: Path,
                           expected_database: Path, expected_bundle: Path) -> list[str]:
    failures = database_differences(actual_database, expected_database)
    if actual_bundle.read_bytes() != expected_bundle.read_bytes():
        failures.append('Browser bundle differs byte-for-byte from the current seed export')
    return failures


def main() -> int:
    try:
        with tempfile.TemporaryDirectory(prefix='pt-catalogue-check-') as directory:
            expected_database, expected_bundle = build_expected_data(Path(directory))
            failures = compare_generated_data(DB_PATH, BUNDLE_PATH, expected_database, expected_bundle)
    except (OSError, sqlite3.Error, ValueError) as exc:
        failures = [f'Generated-data check failed: {exc}']
    if failures:
        print('GENERATED DATA VALIDATION FAILED')
        for failure in failures:
            print(f' - {failure}')
        return 1
    print('GENERATED DATA VALIDATION PASSED')
    print('database=matching logical schema and rows | browser_bundle=exact bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
