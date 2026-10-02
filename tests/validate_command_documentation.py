#!/usr/bin/env python3
"""Check documentation provenance and rule shapes, not simulator execution."""
from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from validate_command_verification import catalogue_metadata, fields, parse_manifest, printable, GUI_MODELS

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "command-documentation.js"
BEGIN = "/* BEGIN COMMAND DOCUMENTATION JSON */"
END = "/* END COMMAND DOCUMENTATION JSON */"
REVISION = "2.1.0"
REFERENCE_FIELDS = {"id", "model", "major_version", "documented_release", "source_url", "source_kind",
                    "source_sha256", "checked_date", "rule_ids", "constraints", "prerequisites", "notes"}
BASE_RULES = {"exec.enable", "exec.configure-terminal", "global.hostname", "exec.end", "show.running-config"}


def valid_source(value) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return (parsed.scheme == "https" and parsed.netloc == "tutorials.ptnetacad.net"
            and not parsed.query and not parsed.fragment
            and re.fullmatch(r"/help/default/[A-Za-z0-9_./-]+\.(?:htm|html)", parsed.path) is not None
            and not any(part in ("", ".", "..") for part in parsed.path.split("/")[1:]))


def validate_manifest(manifest, models: set[str]) -> list[str]:
    errors: list[str] = []

    def require(condition, message):
        if not condition:
            errors.append(message)

    if not fields(manifest, {"schema_version", "template_revision", "references"}):
        return ["Manifest must contain only schema_version, template_revision and references"]
    require(type(manifest["schema_version"]) is int and manifest["schema_version"] == 1, "Unsupported schema_version")
    require(manifest["template_revision"] == REVISION, "Unsupported template_revision")
    if not isinstance(manifest["references"], list):
        return errors + ["References must be an array"]
    ids, contexts = set(), set()
    for number, record in enumerate(manifest["references"], 1):
        label = f"Reference {number}"
        if not fields(record, REFERENCE_FIELDS):
            errors.append(f"{label}: missing or unexpected fields")
            continue
        identifier = record["id"]
        valid_id = isinstance(identifier, str) and re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}", identifier) is not None
        require(valid_id, f"{label}: invalid id")
        if valid_id:
            require(identifier not in ids, f"{label}: duplicate id")
            ids.add(identifier)
        model, major = record["model"], record["major_version"]
        valid_model = isinstance(model, str) and model in models and model not in GUI_MODELS
        valid_major = type(major) is int and major in (6, 7, 8, 9)
        require(valid_model, f"{label}: model must be a known CLI platform")
        require(valid_major, f"{label}: invalid major_version")
        if valid_model and valid_major:
            require((model, major) not in contexts, f"{label}: ambiguous model/version references")
            contexts.add((model, major))
        release = record["documented_release"]
        require(isinstance(release, str) and re.fullmatch(r"\d+\.\d+(?:\.\d+){0,2}", release) is not None
                and valid_major and release.split(".")[0] == str(major), f"{label}: documented_release must match major_version")
        require(valid_source(record["source_url"]), f"{label}: source must be an official Packet Tracer help URL")
        require(record["source_kind"] == "packet-tracer-installed-help", f"{label}: unsupported source_kind")
        digest = record["source_sha256"]
        require(isinstance(digest, str) and re.fullmatch(r"[a-f0-9]{64}", digest) is not None, f"{label}: invalid source_sha256")
        checked = record["checked_date"]
        valid_date = isinstance(checked, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", checked) is not None
        if valid_date:
            try:
                date.fromisoformat(checked)
            except ValueError:
                valid_date = False
        require(valid_date, f"{label}: invalid checked_date")
        rules = record["rule_ids"]
        valid_rules = isinstance(rules, list) and bool(rules) and all(isinstance(rule, str) and re.fullmatch(r"[a-z0-9][a-z0-9.-]{0,99}", rule) is not None for rule in rules)
        if valid_rules:
            require(len(rules) == len(set(rules)), f"{label}: duplicate rule IDs")
            required = BASE_RULES | {"show.asa.interface-brief" if valid_model and model in {"ASA5505", "ASA5506-X", "ISA3000"} else "show.ios.interface-brief"}
            require(required.issubset(rules), f"{label}: missing baseline script/diagnostic rules")
        require(valid_rules, f"{label}: rule_ids need explicit nonempty command identifiers")
        for kind, maximum in (("prerequisites", 1024), ("notes", 2048)):
            rows = record[kind]
            require(isinstance(rows, list) and all(printable(row, maximum) for row in rows), f"{label}: invalid {kind}")
        constraints = record["constraints"]
        if not isinstance(constraints, list):
            errors.append(f"{label}: constraints must be an array")
            continue
        for constraint in constraints:
            if not fields(constraint, {"rule_id", "pattern", "reason"}):
                errors.append(f"{label}: invalid constraint fields")
                continue
            require(valid_rules and constraint["rule_id"] in rules, f"{label}: constraint rule must be explicitly documented")
            pattern = constraint["pattern"]
            valid_pattern = printable(pattern, 2048) and pattern.startswith("^") and pattern.endswith("$")
            if valid_pattern:
                try:
                    re.compile(pattern)
                except re.error:
                    valid_pattern = False
            require(valid_pattern, f"{label}: constraint needs a valid anchored pattern")
            require(printable(constraint["reason"], 1024), f"{label}: constraint requires a printable reason")
    return errors


def main() -> int:
    try:
        manifest = parse_manifest(MANIFEST.read_text(encoding="utf-8"), BEGIN, END)
        models, _ = catalogue_metadata(ROOT / "data" / "packet-tracer.db")
        errors = validate_manifest(manifest, models)
    except (OSError, ValueError) as error:
        errors = [str(error)]
    if errors:
        print("COMMAND DOCUMENTATION FAILED")
        for error in errors:
            print(" - " + error)
        return 1
    print(f"COMMAND DOCUMENTATION PASSED | model_references={len(manifest['references'])}")
    print("Provenance and rule constraints checked; syntax interpretation requires source review, not runtime claims.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
