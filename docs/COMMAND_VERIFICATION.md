# Command Verification

Device availability, documentation-supported command syntax, parser acceptance and working network behavior are different claims. An inventory listing in Packet Tracer 9.0.1 does not prove that this builder's commands were executed there.

## Current status

`data/command-verification.js` currently contains an empty runtime-evidence manifest. No CLI command case is approved. CLI generation, copying and export are blocked without matching runtime evidence; editing, the parts list and manual GUI worksheets remain available. The installed local release is 9.0.1, but no actual command execution is recorded. No 6.x, 7.x or 8.x runtime testing is established.

The production manifest must contain genuine reviewed simulator executions only. Synthetic Python, Node and DOM fixtures test application behavior; they must never be copied into production as runtime evidence.

## Exact-case boundary

- The global major selector is authoritative. All versions cannot authorize CLI output.
- Each major family may have only one common `observed_release` across all recorded models. Conflicting releases fail closed as ambiguous. A future 9.x record tested in 9.0.1 authorizes that exact recorded release, not every 9.x release.
- A generated case must match the model, template revision, output format, selected module quantities and complete ordered command/check sequences, including literal parameter values and rule IDs.
- Recorded prerequisites must be met in the target topology. Selection does not install modules, establish port roles or create the tested topology; export comments retain the prerequisites.
- Changed parameters, command variants, format, modules or template revision require matching evidence or a new simulator run. A case is not approval for arbitrary user configurations or every command in Cisco's trees.

## Manifest contract

The local JavaScript file exposes `PT_COMMAND_VERIFICATION` in the browser and an equivalent CommonJS export for tests. Its JSON payload is framed by `BEGIN COMMAND VERIFICATION JSON` and `END COMMAND VERIFICATION JSON` comments so the Python validator can parse JSON without executing JavaScript.

The manifest has only `schema_version: 1` and a `records` array. Each record has these fields:

| Field | Requirement |
| --- | --- |
| `id` | Unique ASCII identifier, 1-80 characters; letters, digits, `_`, `.`, `-`, beginning with a letter, digit or `_`. |
| `model` | Exact catalogue `pt_name` of a CLI platform, not a GUI-only device. |
| `major_version` | Integer 6, 7, 8 or 9. |
| `observed_release` | Exact numeric release, two to four components, beginning with the recorded major. One common release per major. |
| `template_revision` | Current generator revision, `2.0.1`. |
| `format` | `txt` or `cfg`; these require separate exact cases. |
| `modules` | Sorted unique catalogue module IDs with integer quantities 1-16, as `{moduleId, quantity}`; empty is permitted. |
| `prerequisites` | Nonempty array of explicit printable ASCII strings, each 1-1024 characters. Record initial state, simulated image, installed slots/ports, roles and topology assumptions here. |
| `commands` | Nonempty ordered array of `{rule_id, text, result}` for every emitted non-comment configuration/EXEC line. |
| `checks` | Nonempty ordered array of the same shape for diagnostics; include `show running-config`. |
| `evidence` | The runtime evidence object described below. |

Command/check `rule_id` uses lowercase letters, digits, `.` and `-`, begins with a lowercase letter or digit, and is 1-100 characters. `text` is the exact trimmed printable ASCII command, 1-1024 characters. Each `result` must be `accepted`; documentation-only or failed/blocked outcomes cannot authorize a case.

| Evidence field | Requirement |
| --- | --- |
| `method` | Exactly `packet-tracer-runtime`. |
| `transcript_path` | Existing UTF-8 file under `evidence/runtime/`; portable relative ASCII path, without absolute paths, backslashes or traversal. Resolved symlinks must stay inside the repository's evidence directory. |
| `transcript_sha256` | Lowercase SHA-256 of the retained file bytes. |
| `checked_date` | Valid calendar date in `YYYY-MM-DD`. |
| `error_count` | Integer zero, backed by reviewed command results. |
| `running_config_assertions` | Nonempty array of literal expected configuration-output strings, each printable ASCII, 1-2048 characters. |
| `diagnostic_assertions` | Nonempty array of literal expected diagnostic-output strings with the same bounds. |

The transcript preserves the ordered submitted commands followed by the recorded diagnostics. Lines may contain Packet Tracer prompts or exact bare commands. Expected-output assertions must occur in captured output, not solely in command echoes. Retain command results, prompts, relevant diagnostic output and fixture metadata; do not publish real credentials or sensitive user topologies. Use disposable fixtures with dummy values so redaction does not change the exact tested command parameters.

Both `.txt` and `.cfg` CLI scripts begin with `enable` and `configure terminal`, contain generated commands line by line, and finish with `end`. The exact recorded command sequence includes these wrappers. Exported scripts contain only command lines; evidence is returned as verification metadata and diagnostic commands remain separate. Each format still requires its own matching case.

Parser acceptance is necessary but insufficient. Inspect configuration state and test relevant network behavior separately. The current schema records expected configuration/diagnostic output; it does not encode or claim complete end-to-end operational certification.

## Validation and review

Run from the repository root:

```text
python tests/validate_command_verification.py
python tests/test_command_verification.py
```

On Windows, use `py` in place of `python` when that is the installed launcher.

The standalone validator checks strict shapes and bounds, known model/module identities, release consistency, trusted transcript paths, hashes, ordered command/check capture, expected output and common parser-error markers. These checks establish internal consistency, not proof that a human or harness actually executed Packet Tracer. A maintainer must review the real execution and state assertions before publishing a record.

The browser uses the prevalidated local manifest and does not read transcript files or recheck their hashes. Source changes and evidence records must pass validation before publishing. A false declaration or invented transcript is not made genuine by a valid hash.

See the [proposed runtime-verification workflow](BUILDER_COVERAGE.md#runtime-verification-workflow) and its official Cisco automation references. No working IPC runner or headless execution is established by this repository. The user must open Packet Tracer, sign in and approve required script privileges; authentication and security approval are not automated.
