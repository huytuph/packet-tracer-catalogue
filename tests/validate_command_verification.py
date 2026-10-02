#!/usr/bin/env python3
"""Check published command-evidence consistency, not execution authenticity."""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import sys
from contextlib import closing
from datetime import date
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "command-verification.js"
DATABASE = ROOT / "data" / "packet-tracer.db"
BEGIN = "/* BEGIN COMMAND VERIFICATION JSON */"
END = "/* END COMMAND VERIFICATION JSON */"
GUI_MODELS = {"AccessPoint-PT", "LAP-PT", "3702i", "WLC-2504", "WLC-3504", "MX65W", "HomeRouter", "Cloud-PT"}
RECORD_FIELDS = {"id", "model", "major_version", "observed_release", "template_revision", "format", "modules",
                 "prerequisites", "commands", "checks", "evidence"}
EVIDENCE_FIELDS = {"method", "transcript_path", "transcript_sha256", "checked_date", "error_count",
                   "running_config_assertions", "diagnostic_assertions"}
PARSER_ERROR = re.compile(
    r"(?im)^\s*(?:%\s*)?(?:invalid input|ambiguous command|incomplete command|unrecognized command|"
    r"unknown command|command not implemented)(?:\b|:)")


def parse_manifest(source: str, begin: str = BEGIN, end: str = END) -> dict:
    if source.count(begin) != 1 or source.count(end) != 1:
        raise ValueError("Manifest needs exactly one JSON marker pair")
    start = source.index(begin) + len(begin)
    finish = source.index(end)
    if finish < start:
        raise ValueError("Manifest JSON markers are out of order")

    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    def invalid_constant(value):
        raise ValueError(f"Invalid JSON constant: {value}")

    return json.loads(source[start:finish], object_pairs_hook=unique_object, parse_constant=invalid_constant)


def catalogue_metadata(path: Path) -> tuple[set[str], set[int]]:
    with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as conn:
        models = {row[0] for row in conn.execute("SELECT pt_name FROM devices")}
        modules = {row[0] for row in conn.execute("SELECT module_id FROM modules")}
    return models, modules


def printable(value, maximum: int) -> bool:
    return (isinstance(value, str) and 1 <= len(value) <= maximum and value == value.strip()
            and all(32 <= ord(char) <= 126 for char in value))


def strings(value, maximum: int) -> bool:
    return isinstance(value, list) and bool(value) and all(printable(item, maximum) for item in value)


def fields(value, expected: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == expected


def transcript_file(root: Path, value: str) -> Path:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_./-]+", value):
        raise ValueError("Transcript path must be portable ASCII")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or "." in value.split("/") or "" in value.split("/"):
        raise ValueError("Transcript path must not contain absolute or traversal components")
    if len(path.parts) < 3 or path.parts[:2] != ("evidence", "runtime"):
        raise ValueError("Transcript path must be under evidence/runtime/")
    trusted = (root / "evidence" / "runtime").resolve()
    resolved = (root / Path(*path.parts)).resolve()
    if not resolved.is_relative_to(trusted) or not trusted.is_relative_to(root.resolve()):
        raise ValueError("Transcript path escapes the repository runtime-evidence directory")
    if not resolved.is_file():
        raise ValueError("Transcript is not an existing regular file")
    return resolved


def captured_output(transcript: str, rows: list[dict]) -> str | None:
    cursor = 0
    spans = []
    for row in rows:
        # Captured CLI lines may include a device prompt, but must preserve the exact command.
        pattern = re.compile(r"(?m)^(?:[^\r\n]*[>#]\s*)?" + re.escape(row["text"]) + r"\r?$")
        match = pattern.search(transcript, cursor)
        if match is None:
            return None
        spans.append(match.span())
        cursor = match.end()
    for start, finish in reversed(spans):
        transcript = transcript[:start] + transcript[finish:]
    return transcript


def validate_manifest(manifest, root: Path, models: set[str], module_ids: set[int]) -> list[str]:
    errors: list[str] = []

    def require(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    if not fields(manifest, {"schema_version", "records"}):
        return ["Manifest must contain only schema_version and records"]
    require(type(manifest["schema_version"]) is int and manifest["schema_version"] == 1, "Unsupported manifest schema_version")
    if not isinstance(manifest["records"], list):
        return errors + ["Manifest records must be an array"]
    ids: set[str] = set()
    releases: dict[int, str] = {}
    for index, record in enumerate(manifest["records"]):
        label = f"Record {index + 1}"
        initial_errors = len(errors)
        if not fields(record, RECORD_FIELDS):
            errors.append(f"{label}: missing or unexpected fields")
            continue
        identifier = record["id"]
        valid_id = isinstance(identifier, str) and re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}", identifier) is not None
        require(valid_id, f"{label}: invalid id")
        if valid_id:
            require(identifier not in ids, f"{label}: duplicate id")
            ids.add(identifier)
        model = record["model"]
        require(isinstance(model, str) and model in models and model not in GUI_MODELS, f"{label}: model must be a known CLI platform")
        major = record["major_version"]
        valid_major = type(major) is int and major in (6, 7, 8, 9)
        require(valid_major, f"{label}: invalid major_version")
        release = record["observed_release"]
        valid_release = isinstance(release, str) and re.fullmatch(r"\d+\.\d+(?:\.\d+){0,2}", release) is not None
        require(valid_release and valid_major and release.split(".")[0] == str(major), f"{label}: observed_release must match the major version")
        if valid_major and valid_release:
            require(major not in releases or releases[major] == release, f"{label}: ambiguous observed releases for major {major}")
            releases.setdefault(major, release)
        require(record["template_revision"] == "2.1.0", f"{label}: unsupported template_revision")
        require(record["format"] in ("txt", "cfg"), f"{label}: invalid format")
        modules = record["modules"]
        valid_modules = isinstance(modules, list)
        selected_ids: list[int] = []
        if valid_modules:
            for item in modules:
                if not fields(item, {"moduleId", "quantity"}):
                    valid_modules = False
                    continue
                module_id, quantity = item["moduleId"], item["quantity"]
                if not (type(module_id) is int and 0 < module_id <= 9007199254740991 and module_id in module_ids
                        and type(quantity) is int and 1 <= quantity <= 16):
                    valid_modules = False
                    continue
                selected_ids.append(module_id)
            valid_modules = valid_modules and selected_ids == sorted(set(selected_ids))
        require(valid_modules, f"{label}: modules need unique sorted known IDs and integer quantities 1-16")
        require(strings(record["prerequisites"], 1024), f"{label}: prerequisites must be nonempty printable strings")
        valid_rows = True
        for kind in ("commands", "checks"):
            rows = record[kind]
            good = isinstance(rows, list) and bool(rows)
            if good:
                for row in rows:
                    good = good and fields(row, {"rule_id", "text", "result"})
                    if not fields(row, {"rule_id", "text", "result"}):
                        continue
                    rule = row["rule_id"]
                    good = (good and isinstance(rule, str) and re.fullmatch(r"[a-z0-9][a-z0-9.-]{0,99}", rule) is not None
                            and printable(row["text"], 1024) and row["result"] == "accepted")
            require(good, f"{label}: {kind} require ordered accepted printable command records")
            valid_rows = valid_rows and good
        if valid_rows:
            require(any(row["text"] == "show running-config" for row in record["checks"]), f"{label}: checks must include show running-config")
        evidence = record["evidence"]
        if not fields(evidence, EVIDENCE_FIELDS):
            errors.append(f"{label}: invalid evidence fields")
            continue
        require(evidence["method"] == "packet-tracer-runtime", f"{label}: evidence must be actual Packet Tracer runtime evidence")
        require(type(evidence["error_count"]) is int and evidence["error_count"] == 0, f"{label}: error_count must be integer zero")
        checked = evidence["checked_date"]
        valid_date = isinstance(checked, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", checked) is not None
        if valid_date:
            try:
                date.fromisoformat(checked)
            except ValueError:
                valid_date = False
        require(valid_date, f"{label}: invalid checked_date")
        digest = evidence["transcript_sha256"]
        require(isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest) is not None, f"{label}: invalid transcript_sha256")
        for kind in ("running_config_assertions", "diagnostic_assertions"):
            require(strings(evidence[kind], 2048), f"{label}: {kind} must be nonempty printable expected-output strings")
        if len(errors) != initial_errors:
            continue
        try:
            path = transcript_file(root, evidence["transcript_path"])
            content = path.read_bytes()
            require(hashlib.sha256(content).hexdigest() == digest, f"{label}: transcript SHA-256 differs")
            transcript = content.decode("utf-8")
            require(not PARSER_ERROR.search(transcript), f"{label}: transcript contains a parser error")
            output = captured_output(transcript, record["commands"] + record["checks"]) if valid_rows else None
            require(output is not None, f"{label}: transcript lacks ordered commands/checks")
            for kind in ("running_config_assertions", "diagnostic_assertions"):
                require(output is not None and all(assertion in output for assertion in evidence[kind]), f"{label}: captured output lacks {kind}")
        except (OSError, ValueError, UnicodeError) as exc:
            errors.append(f"{label}: {exc}")
    return errors


def main() -> int:
    try:
        manifest = parse_manifest(MANIFEST.read_text(encoding="utf-8"))
        models, modules = catalogue_metadata(DATABASE)
        errors = validate_manifest(manifest, ROOT, models, modules)
    except (OSError, ValueError, sqlite3.Error) as exc:
        errors = [str(exc)]
    if errors:
        print("COMMAND VERIFICATION FAILED")
        for error in errors:
            print(f" - {error}")
        return 1
    print(f"COMMAND VERIFICATION PASSED | runtime_records={len(manifest['records'])}")
    print("Schema, transcript consistency and hashes checked; execution authenticity requires review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
