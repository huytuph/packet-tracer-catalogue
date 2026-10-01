# Cisco Packet Tracer Network Device Catalogue

Offline-first catalogue and build-assistance tool for **Cisco Packet Tracer Network Devices**.

This is an independent community project, not affiliated with, endorsed by, or sponsored by Cisco or Cisco Networking Academy. Cisco and Packet Tracer names are used to identify the software and products being catalogued; all trademarks belong to their respective owners.

## Run it

No install is required.

1. Clone or download this repository.
2. Double-click **`index.html`**.
3. The catalogue opens in your default browser and works offline.

After future updates:

```text
git pull
```

Then reopen or refresh `index.html`.

> End users do **not** need Python, Node.js, SQLite, Docker, a web server, or internet access.

## What it does

- **Global version selector** - choose All versions or Packet Tracer 6, 7, 8 or 9 across the catalogue, finder, comparison, modules and connections.
- **Requirements Finder** — choose device type, minimum port counts, interfaces and required features; results explain why a device matches, partially matches, or needs an expansion module.
- **Browse / Search** — search models, aliases, roles, interfaces, modules and features; sort/filter results.
- **Device details** — Packet Tracer ports, features, common roles, modules, limitations and sources. Real Cisco product mappings are retained in the database for reference.
- **Compare** — compare up to four Packet Tracer network devices side by side.
- **Module compatibility** — device → compatible modules and module → compatible devices.
- **Connections** — suggests conventional Packet Tracer cable/interface combinations between two selected devices.
- **Sources** — evidence catalogue with source quality tiers.

## Data policy

This project is designed to answer **“What can I use in Packet Tracer for this build?”**

- Packet Tracer-observed/supported behaviour takes precedence over the real physical Cisco product for matching.
- Real Cisco specifications are supporting context, not a substitute for Packet Tracer behaviour.
- `Unknown` means the capability has not been verified; it is **not** treated as supported.
- Device availability is recorded separately for each major version as available, unavailable or unknown. Unknown availability is not evidence that a device is absent.
- A documented device in one release does not verify every interface or feature, or every minor release in that family. Exact observations retain their release and source.
- Sources are retained with each evidence-backed record.

See [`docs/DATA_POLICY.md`](docs/DATA_POLICY.md).

## Repository layout

```text
packet-tracer-catalogue/
├── index.html                  # offline entry point
├── css/
│   └── app.css
├── js/
│   └── app.js
├── data/
│   ├── packet-tracer.db        # SQLite master catalogue
│   ├── catalogue-data.js       # generated browser-readable data
│   └── version-evidence.json   # maintained major-version availability evidence
├── docs/
│   ├── DATA_POLICY.md
│   └── SCHEMA.md
├── tools/
│   ├── init_database.py        # rebuild/seed SQLite (maintainer)
│   ├── export_browser_data.py  # SQLite -> catalogue-data.js
│   ├── rebuild.sh
│   └── rebuild.bat
├── tests/
│   ├── validate_catalogue.py
│   ├── test_version_profiles.py
│   ├── validate_generated_data.py
│   ├── test_generated_data.py
│   └── validate_runtime.js
└── .github/workflows/
    └── validate.yml
```

## Why both SQLite and `catalogue-data.js`?

`data/packet-tracer.db` is the relational master database. Browsers apply security restrictions to local `file://` pages, especially for fetching `.db`, WASM and JSON files. The generated `data/catalogue-data.js` exposes the same catalogue as a local JavaScript object, allowing `index.html` to work reliably when opened directly from disk.

Maintainers edit the technical seed in `tools/init_database.py` and the availability evidence in `data/version-evidence.json`. A rebuild recreates SQLite from those inputs and overwrites direct database edits. The browser reads the generated JavaScript bundle; it does not load the evidence JSON at runtime.

```text
packet-tracer.db
      ↓ maintainer export
catalogue-data.js
      ↓
index.html
```

## Maintainer workflow

Python 3.10 or newer with SQLite FTS5 support is needed **only for maintainers who rebuild the bundled data**. The scripts use Python's standard library; no pip packages are required. Node.js is optional locally for JavaScript checks and is installed by CI.

Windows:

```text
tools\rebuild.bat
```

Linux / macOS:

```text
sh tools/rebuild.sh
```

The rebuild process:

1. checks the complete availability-evidence matrix and recreates `data/packet-tracer.db`,
2. regenerates `data/catalogue-data.js`,
3. validates schema/data/offline invariants and tests version-profile isolation,
4. checks generated-data consistency and tests the freshness checker,
5. runs JavaScript syntax checks and version-aware UI regression tests when `node` is available.

To check existing generated files without replacing them:

Windows:

```text
py tests/validate_generated_data.py
```

Linux / macOS:

```text
python3 tests/validate_generated_data.py
```

The checker builds fresh outputs in a temporary directory. It compares SQLite's logical schema and public table rows, including FTS records, rather than platform-dependent database bytes. It compares the browser JavaScript bundle exactly. CI runs this check before rebuilding, then runs the rebuild validations and checks the generated JavaScript diff.

## Current bundled coverage

The seed catalogue includes representative Packet Tracer routers, L2/L3 switches, industrial network devices, security appliances, wireless devices/controllers, cloud/WAN devices and relevant expansion modules. The UI deliberately exposes verification state so incomplete capability coverage is visible rather than guessed.

Each of the 34 seeded devices has availability records for all four major-version families. Technical coverage is narrower: interfaces, features, modules and limitations retain their own recorded version scope. Selecting a major version does not copy technical claims from another family. Version-neutral hardware interfaces remain Partial supporting context. All versions shows the combined catalogue and may include observations from different releases.

The current exact counts are displayed in the application's **About** tab and validated by `tests/validate_catalogue.py`.

## GitHub Pages

The same repository can be served directly by GitHub Pages. No code changes are required. Local/offline and GitHub Pages use the same `index.html`, CSS, JavaScript and bundled catalogue data.

## Browser compatibility

Designed for current Chrome/Chromium, Edge, Firefox and Safari. It uses ordinary local `<script>` and `<link>` references and does not rely on `fetch()`, ES module imports, service workers, CDNs or a localhost server.

## License

Original project code, documentation and catalogue contributions are licensed under the [MIT License](LICENSE).

External source documents, software and other third-party materials retain their own ownership and terms; this project's license does not relicense them or grant trademark rights. Source links and citations identify evidence, not permission to redistribute the linked materials.
