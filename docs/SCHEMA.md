# SQLite Schema

`data/packet-tracer.db` is the relational master catalogue.

The current contract is schema `3.0.0`, catalogue `0.3.0`. Rebuilds derive SQLite from `tools/init_database.py` and `data/version-evidence.json`.

## Core entities

```text
metadata

device_categories
└── devices
    ├── device_aliases
    ├── device_version_support ── packet_tracer_versions
    ├── device_interfaces ─────── interface_types / packet_tracer_versions
    ├── device_slots ──────────── slot_types
    ├── module_compatibility ──── modules
    ├── device_feature_support ── features ── feature_categories
    ├── device_roles ──────────── roles
    ├── limitations
    └── cisco_products

modules
└── module_interfaces ─────────── interface_types

cable_types
└── connection_rules

sources
└── evidence/source foreign keys across catalogue tables
```

## Tables

### `metadata`
Catalogue/schema versions, generated date, covered Packet Tracer versions, scope and data policy summary.

### `device_categories`
Top-level browse categories such as Router, Layer 2 Switch, Layer 3 / Multilayer Switch, Security Appliance, Wireless and WAN / Cloud.

### `devices`
The Packet Tracer device identity. Important fields include exact PT name, display name, model/family, category, layer capability, generic/modular flags, typical use, verification status and last verification date.

### `device_aliases`
Alternate names/search terms for devices.

### `packet_tracer_versions` / `device_version_support`
`packet_tracer_versions` has `major_version` (6, 7, 8 or 9) and `is_family`. The selector uses family records; exact releases remain available as evidence context.

| Version ID | Version | Major | Family |
| --- | --- | --- | --- |
| 1 | 7.2 | 7 | No |
| 2 | 8.x | 8 | Yes |
| 3 | 9.0.0 | 9 | No |
| 4 | 6.x | 6 | Yes |
| 5 | 7.x | 7 | Yes |
| 6 | 9.x | 9 | Yes |

`device_version_support` has one record per device and family. `available` is nullable: `1` means available, `0` means unavailable and `NULL` means unknown. Each record retains `verification_status`, `source_id`, `observed_release`, `evidence_kind`, `checked_date` and notes. The legacy 3650 observation in 7.2 is retained separately.

A family availability record summarizes evidence within that major version. An exact release observation does not establish support across every minor release, or verify any particular feature or port count.

### `interface_types` / `device_interfaces`
Interface technology and device-local interface quantities/capabilities. Device interfaces describe built-in ports; module-provided ports are modeled separately.

`device_interfaces.version_id` is nullable and each row has a `verification_status`. Version-specific Packet Tracer evidence stays in its own major family; version-neutral hardware records remain Partial supporting context. Interface verification is independent of device availability verification.

### `slot_types` / `device_slots`
Expansion slot types and counts per device.

### `modules` / `module_interfaces` / `module_compatibility`
Packet Tracer expansion modules, the interfaces they add, and version/device compatibility.

### `feature_categories` / `features` / `device_feature_support`
Normalized capabilities. Support state is one of:

```text
native
configuration_required
module_required
module_and_configuration
unsupported
unknown
```

### `roles` / `device_roles`
Build-oriented roles such as Access Switch, Distribution Switch, Multilayer Gateway, NAT Gateway and WAN Router.

### `cable_types` / `connection_rules`
Conventional interface/cable compatibility used by the Connection helper.

### `cisco_products`
Mapping from a Packet Tracer device to real Cisco product/SKU/lifecycle context where appropriate.

These mappings are retained in SQLite and the browser export as supporting reference data; the current device-details UI does not display a product-mapping section.

### `limitations`
Packet Tracer-specific caveats, real-hardware differences and version limitations.

### `sources`
Evidence metadata and source quality tier.

The availability JSON references sources by `source_key`. The seed deduplicates their URLs against existing sources and assigns new URLs deterministic IDs starting at 26. It requires a complete four-family matrix before replacing the database.

### `device_search_fts`
SQLite FTS5 index used for maintainer/database searches, with one row per device. It indexes display name, model, aliases, description, typical use, roles, non-unsupported feature names, interface names and compatible module names. It does not index limitation text or Cisco product mappings.

The index combines recorded releases and is not a version-specific capability check. The offline browser does not query SQLite or FTS5: All versions uses its generated `search_blob`, while a selected family searches the UI's scoped device representation.

## Browser export

`tools/export_browser_data.py` denormalizes the relational records into `data/catalogue-data.js`:

```text
window.PT_CATALOGUE = { ... };
```

This intentionally duplicates some derived data to keep the end-user runtime serverless and compatible with direct `file://` opening.

Every device includes `version_profiles`, keyed `"6"`, `"7"`, `"8"` and `"9"`. Each profile contains its availability record, scoped interfaces/features/modules/limitations, `port_totals`, `total_physical_ports`, `feature_map` and module-expansion aggregates. `interface_verification_status` reports the certainty of its interface records; no interface evidence gives Unknown.

Exported availability uses JSON `true`, `false` or `null`. Profiles include only matching-major or version-neutral technical rows. Existing top-level arrays and aggregates retain the combined All versions view.

## Generated-data validation

`tests/validate_generated_data.py` creates a fresh database and browser export in a temporary directory and compares them with the repository's existing outputs. SQLite comparison checks logical schema and public table contents, including `device_search_fts`; it ignores physical database headers, page layout and FTS shadow-table internals. This avoids treating SQLite implementation differences as catalogue changes. The generated JavaScript must match exactly.

CI performs this comparison before rebuilding, then runs the rebuild validations and checks the JavaScript diff. `tests/validate_catalogue.py` separately checks complete FTS device coverage and functional model, alias, feature and module searches. The offline browser still uses its own search representation.
