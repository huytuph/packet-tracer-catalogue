# Contributing

The project is data-quality sensitive: a real Cisco feature does not automatically mean Packet Tracer simulates it.

## Contribution rights

Contribute only material you have the right to license under the project's [MIT License](LICENSE). Write factual summaries in your own words and retain source attribution.

Do not copy external documentation, code, screenshots, logos, datasets or software installers into the repository unless their terms permit redistribution. Preserve any required third-party license and attribution notices. A source link alone is not redistribution permission.

## Data changes

1. Prefer Cisco/Cisco Networking Academy/Packet Tracer evidence.
2. Add technical sources to the seed's `SOURCES` list; add availability sources to `data/version-evidence.json`.
3. Preserve the exact observed release and the major-version scope of each claim.
4. Use `available: null` and `verification_status: "Unknown"` when availability is unverified. Missing evidence does not establish absence.
5. Rebuild the database and browser bundle.
6. Run validation before committing.

Linux/macOS:

```text
sh tools/rebuild.sh
```

Windows:

```text
tools\rebuild.bat
```

## Version evidence

`data/version-evidence.json` contains `sources` and `devices` arrays. Every seeded `pt_name` must have exactly four `versions` entries, keyed `"6"`, `"7"`, `"8"` and `"9"`.

| Record | Required fields |
| --- | --- |
| Source | `key`, `url`, `title`, `publisher`, `source_type`, `publication_date`, `source_tier`, `notes` |
| Availability | `available`, `verification_status`, `source_key`, `observed_release`, `evidence_kind`, `notes` |

- `available` is JSON `true`, `false` or `null`; numeric `0` and `1` are rejected.
- Known availability or absence needs a source key and explicit evidence. Keep claims within the release or range supported by that source.
- `evidence_kind` is `documentation`, `observation`, `inference` or `unverified`. Inferences can be Partial, never Verified.
- `observed_release` records the precise release or range when known; use `null` when it is unknown. An optional `checked_date` overrides the seed's recorded access date.
- New source URLs receive deterministic IDs starting at 26; duplicate URLs reuse an existing source identity.

Availability verification is separate from interface, feature and module verification. Do not copy capabilities between major versions just because the device exists in both. Add technical records with their own version and source; retain real-hardware information as version-neutral Partial context.

Both rebuild scripts run `tests/validate_catalogue.py`, `tests/test_version_profiles.py`, `tests/validate_generated_data.py` and `tests/test_generated_data.py`. When Node is available they also syntax-check the runtime scripts and run `tests/validate_runtime.js`, `tests/validate_config_builder.js` and `tests/validate_builder_ui.js`. UI tests use DOM stubs; they do not replace visual browser checks or execution in Packet Tracer. Maintainers need Python 3.10 or newer with SQLite FTS5 support; no pip packages are required. CI installs Node and runs these checks through the rebuild script.

The generated-data checker compares existing outputs with a fresh temporary build without overwriting them. SQLite comparison covers logical schema and public table rows, including FTS records; file headers, page layout and FTS shadow internals are not compared. The browser bundle must match exactly. CI checks generated data before rebuilding so a stale committed artifact cannot be hidden by the rebuild, then checks the JavaScript diff.

Commit the evidence JSON with the rebuilt database and browser bundle. Database byte differences alone can result from different SQLite builds; use the semantic checker to determine whether catalogue contents agree.

## Runtime changes

The public runtime must remain compatible with double-clicking `index.html` directly from disk.

Do not introduce runtime dependencies on:

- localhost/web servers,
- `fetch()` for required local data,
- Node/npm,
- Python,
- CDNs,
- external CSS/JS,
- service workers,
- browser extensions.

Optional hyperlinks to external Cisco sources are fine; the catalogue itself must remain usable offline.

## CLI builder changes

Keep command generation in the dependency-free `js/config-builder.js` engine and UI behavior in `js/builder-ui.js`. Run the focused checks with Node:

```text
node --check js/config-builder.js
node --check js/builder-ui.js
node tests/validate_config_builder.js
node tests/validate_builder_ui.js
```

- Cite command templates and preserve their device/version limits. Documentation-supported syntax is not proof that the generated configuration runs in Packet Tracer.
- Initial templates cover hostnames, IPv4 ports, switch VLAN/access/trunk settings (numeric VLANs 1-1001), Layer 2 management SVIs and static routes for 12 classic IOS models. Router switched ports require a selected EtherSwitch module and reference existing VLANs only; other models remain selection-list only.
- Test templates in the exact installed Packet Tracer release before describing their generated commands as runtime-verified. Record the model, release, commands, results and source; automated generator tests alone do not justify a Verified claim.
- Cover invalid input, command injection, unavailable/unknown capability records, version changes and stale previews in regression tests.
- Keep selected devices and modules as a planning list. Selecting a module does not install it, establish its interface names, configure cabling or deploy commands to a simulator.
- Preserve the export boundary: `.txt` is CLI text and `.cfg` is configuration-only text. Neither is a Packet Tracer `.pkt` topology or a guarantee that every target accepts the file.

### Template references

- [Packet Tracer router IOS command tree](https://tutorials.ptnetacad.net/help/default/CLI_routerIOS.htm)
- [Packet Tracer switch IOS command tree](https://tutorials.ptnetacad.net/help/default/CLI_switchIOS.htm)
- [Configuring routers](https://tutorials.ptnetacad.net/help/default/config_routers.htm)
- [Router devices and modules](https://tutorials.ptnetacad.net/help/default/devicesAndModules_routers.htm)

These official Cisco help pages provide syntax and hardware context. They are not an execution test of this builder's output, do not establish support across every older release, and do not make the generated templates runtime-verified.

## Publishing checks

Configure publishing in [Settings > Pages](https://github.com/huytuph/packet-tracer-catalogue/settings/pages): choose **Deploy from a branch**, select **main** and **/(root)**, then save. See GitHub's [publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Keep `index.html` at the repository root and preserve relative asset paths; the same files must work from disk and under the project's GitHub Pages URL.

1. Run the relevant validation before committing; rebuild both generated data files when the seed or evidence changes.
2. Push the intended updates to the configured publishing branch (`main`).
3. Check catalogue validation and Pages deployment separately in Actions. The validation workflow does not deploy Pages or gate branch-based publishing.
4. Smoke-test the published website and a downloaded copy: version selection, finder/search, comparisons, module and connection lookups, CLI builder previews/exports, device details and keyboard navigation.

Pages serves the generated JavaScript catalogue, not a live database or Python backend. Publishing does not install an offline cache; use the downloaded files for reliable offline access.
