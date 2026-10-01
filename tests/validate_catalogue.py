#!/usr/bin/env python3
"""Zero-dependency validation for the bundled Packet Tracer catalogue."""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "packet-tracer.db"
BUNDLE_PATH = ROOT / "data" / "catalogue-data.js"
VERSION_EVIDENCE_PATH = ROOT / "data" / "version-evidence.json"
INDEX_PATH = ROOT / "index.html"
APP_JS = ROOT / "js" / "app.js"
CSS_PATH = ROOT / "css" / "app.css"

FAILURES: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        FAILURES.append(message)


def one(conn: sqlite3.Connection, sql: str, params=()):
    row = conn.execute(sql, params).fetchone()
    return row[0] if row else None


def validate_database() -> dict[str, int]:
    check(DB_PATH.exists(), "SQLite database is missing")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        integrity = one(conn, "PRAGMA integrity_check")
        check(integrity == "ok", f"SQLite integrity_check returned {integrity!r}")
        fk = conn.execute("PRAGMA foreign_key_check").fetchall()
        check(not fk, f"Foreign-key violations: {fk[:5]}")

        expected_tables = {
            "metadata", "device_categories", "devices", "device_aliases",
            "packet_tracer_versions", "device_version_support", "interface_types",
            "device_interfaces", "slot_types", "device_slots", "modules",
            "module_interfaces", "module_compatibility", "feature_categories",
            "features", "device_feature_support", "roles", "device_roles",
            "cable_types", "connection_rules", "cisco_products",
            "limitations", "sources", "device_search_fts",
        }
        present = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        check(expected_tables <= present, f"Missing schema tables: {sorted(expected_tables - present)}")

        counts = {
            "devices": one(conn, "SELECT COUNT(*) FROM devices"),
            "modules": one(conn, "SELECT COUNT(*) FROM modules"),
            "features": one(conn, "SELECT COUNT(*) FROM features"),
            "sources": one(conn, "SELECT COUNT(*) FROM sources"),
        }
        check(counts["devices"] >= 30, "Expected at least 30 seeded network devices")
        check(counts["modules"] >= 10, "Expected at least 10 expansion modules")
        check(counts["features"] >= 40, "Expected at least 40 normalized features")
        check(counts["sources"] >= 19, "Expected at least 19 evidence sources")

        device_ids = sorted(row[0] for row in conn.execute('SELECT device_id FROM devices'))
        search_ids = sorted(row[0] for row in conn.execute('SELECT device_id FROM device_search_fts'))
        check(search_ids == device_ids, 'SQLite search must index every device exactly once')
        for device_id, display_name in conn.execute('SELECT device_id,display_name FROM devices').fetchall():
            query = '"' + display_name.replace('"', '""') + '"'
            matches = {row[0] for row in conn.execute(
                'SELECT device_id FROM device_search_fts WHERE device_search_fts MATCH ?', (query,))}
            check(device_id in matches, f'SQLite search cannot find device {device_id}: {display_name}')
        for query, expected in (
            ('Catalyst', {'2960-24TT', '3560-24PS', '3650-24PS'}),
            ('"PT8200"', {'C8200'}),
            ('HSRP', {'3560-24PS', '3650-24PS'}),
            ('"HWIC-2T"', {'1841', '2811'}),
        ):
            matches = {row[0] for row in conn.execute('''
                SELECT d.pt_name FROM device_search_fts JOIN devices d
                ON d.device_id=device_search_fts.device_id WHERE device_search_fts MATCH ?
            ''', (query,))}
            check(expected <= matches, f'SQLite search misses expected devices for {query}: {sorted(expected - matches)}')

        valid_states = {
            "native", "configuration_required", "module_required",
            "module_and_configuration", "unsupported", "unknown",
        }
        states = {r[0] for r in conn.execute("SELECT DISTINCT support_mode FROM device_feature_support")}
        check(states <= valid_states, f"Unexpected feature support states: {sorted(states - valid_states)}")

        families = conn.execute("SELECT major_version FROM packet_tracer_versions WHERE is_family=1").fetchall()
        check(sorted(row[0] for row in families) == [6, 7, 8, 9], "Expected exactly the four major Packet Tracer version families")
        legacy_versions = dict(conn.execute("SELECT version_id,version FROM packet_tracer_versions WHERE version_id IN (1,2,3)"))
        check(legacy_versions == {1: '7.2', 2: '8.x', 3: '9.0.0'}, "Legacy version IDs changed")
        coverage = conn.execute("""
            SELECT d.pt_name,COUNT(dvs.support_id) AS version_count
            FROM devices d CROSS JOIN packet_tracer_versions v
            LEFT JOIN device_version_support dvs ON dvs.device_id=d.device_id AND dvs.version_id=v.version_id
            WHERE v.is_family=1 GROUP BY d.device_id HAVING version_count<>4
        """).fetchall()
        check(not coverage, f"Devices without a complete four-family availability matrix: {[r[0] for r in coverage]}")
        availability = conn.execute("""
            SELECT d.pt_name,v.major_version,dvs.*,s.url AS source_url
            FROM device_version_support dvs JOIN devices d USING(device_id)
            JOIN packet_tracer_versions v USING(version_id)
            LEFT JOIN sources s USING(source_id) WHERE v.is_family=1
        """).fetchall()
        check(len(availability) == counts['devices'] * 4, "Expected one availability record per device and version family")
        for row in availability:
            label = f"{row['pt_name']} / PT {row['major_version']}"
            check(bool(row['checked_date']), f"{label}: availability has no checked date")
            if row['available'] is None:
                check(row['verification_status'] == 'Unknown', f"{label}: unknown availability must remain Unknown")
            else:
                check(row['source_id'] is not None and bool(row['source_url']), f"{label}: known availability needs a source")
                check(row['verification_status'] in {'Verified', 'Partial'} and row['evidence_kind'] != 'unverified',
                      f"{label}: known availability needs explicit evidence")
            check(not (row['evidence_kind'] == 'inference' and row['verification_status'] == 'Verified'),
                  f"{label}: inferred availability cannot be Verified")

        check(VERSION_EVIDENCE_PATH.exists(), "Version-evidence matrix is missing")
        if VERSION_EVIDENCE_PATH.exists():
            evidence = json.loads(VERSION_EVIDENCE_PATH.read_text(encoding='utf-8'))
            source_urls = {source['key']: source['url'] for source in evidence['sources']}
            actual = {(row['pt_name'], str(row['major_version'])): row for row in availability}
            expected_pairs = set()
            for device_record in evidence['devices']:
                for major, expected in device_record['versions'].items():
                    pair = (device_record['pt_name'], major)
                    expected_pairs.add(pair)
                    row = actual.get(pair)
                    check(row is not None, f"Missing seeded availability evidence for {pair}")
                    if row is None:
                        continue
                    value = None if row['available'] is None else bool(row['available'])
                    check(value is expected['available'], f"Availability tri-state differs from evidence for {pair}")
                    for field in ('verification_status', 'evidence_kind', 'observed_release'):
                        check(row[field] == expected[field], f"Seeded {field} differs from evidence for {pair}")
                    check(row['support_notes'] == expected['notes'], f"Seeded evidence notes differ for {pair}")
                    check(row['source_url'] == source_urls.get(expected['source_key']), f"Seeded source differs from evidence for {pair}")
            check(expected_pairs == set(actual), "Seeded availability pairs differ from the research matrix")

        interface_versions = {6: 3, 7: 3, 8: 3, 11: 2, 12: 3, 22: 1}
        for row in conn.execute('SELECT di.source_id,di.version_id,di.verification_status,s.url AS source_url FROM device_interfaces di LEFT JOIN sources s USING(source_id)'):
            expected_version = 3 if row['source_url'] == 'https://tutorials.ptnetacad.net/help/default/devicesAndModules_routers.htm' else interface_versions.get(row['source_id'])
            check(row['version_id'] == expected_version, "Interface version scope differs from its evidence")
            check(row['verification_status'] == 'Partial', "Seeded interface context must remain Partial")
        metadata = dict(conn.execute('SELECT key,value FROM metadata'))
        check(metadata.get('schema_version') == '3.0.0', "Expected schema version 3.0.0")
        check(metadata.get('catalogue_version') == '0.3.0', "Expected catalogue version 0.3.0")

        def device(name: str):
            return conn.execute("SELECT device_id FROM devices WHERE display_name=? OR pt_name=? OR model=?", (name, name, name)).fetchone()

        def interface_qty(dev: str, iface: str) -> int:
            row = conn.execute("""
                SELECT COALESCE(SUM(di.quantity),0)
                FROM device_interfaces di
                JOIN devices d ON d.device_id=di.device_id
                JOIN interface_types it ON it.interface_type_id=di.interface_type_id
                WHERE (d.display_name=? OR d.pt_name=? OR d.model=?) AND it.name=?
            """, (dev, dev, dev, iface)).fetchone()
            return int(row[0])

        def feature_state(dev: str, slug: str):
            return one(conn, """
                SELECT dfs.support_mode
                FROM device_feature_support dfs
                JOIN devices d ON d.device_id=dfs.device_id
                JOIN features f ON f.feature_id=dfs.feature_id
                WHERE (d.display_name=? OR d.pt_name=? OR d.model=?) AND f.slug=?
                ORDER BY CASE dfs.support_mode WHEN 'unsupported' THEN 0 ELSE 1 END DESC
                LIMIT 1
            """, (dev, dev, dev, slug))

        check(device("Cisco 1841") is not None, "Cisco 1841 missing")
        check(interface_qty("Cisco 1841", "FastEthernet") == 2, "Cisco 1841 should have 2 built-in FastEthernet ports")
        for module in ("HWIC-2T", "HWIC-4ESW"):
            n = one(conn, """
                SELECT COUNT(*) FROM module_compatibility mc
                JOIN devices d ON d.device_id=mc.device_id
                JOIN modules m ON m.module_id=mc.module_id
                WHERE d.display_name='Cisco 1841' AND m.model=? AND mc.compatible=1
            """, (module,))
            check(n == 1, f"Cisco 1841 compatibility with {module} missing")

        check(interface_qty("Cisco 2911", "GigabitEthernet") == 3, "Cisco 2911 should have 3 built-in GigabitEthernet ports")
        check(interface_qty("2960-24TT", "FastEthernet") == 24, "2960-24TT FE count should be 24")
        check(interface_qty("2960-24TT", "GigabitEthernet") == 2, "2960-24TT GE count should be 2")
        check(feature_state("2960-24TT", "inter_vlan") == "unsupported", "2960 inter-VLAN routing should be unsupported")
        check(interface_qty("3560-24PS", "FastEthernet") == 24, "3560-24PS PT FE count should be 24")
        check(interface_qty("3560-24PS", "GigabitEthernet") == 2, "3560-24PS PT GE count should be 2")
        check(feature_state("3560-24PS", "inter_vlan") in {"native", "configuration_required"}, "3560 should support inter-VLAN routing")
        check(feature_state("3560-24PS", "hsrp") in {"native", "configuration_required"}, "3560 should support HSRP")
        check(feature_state("3560-24PS", "etherchannel") in {"native", "configuration_required"}, "3560 should support EtherChannel")
        check(interface_qty("3650-24PS", "GigabitEthernet") == 28, "3650-24PS bundled PT observation should expose 28 GE interfaces")
        check(feature_state("ASA5506-X", "firepower") == "unsupported", "ASA5506-X FirePOWER should be marked unsupported in PT")
        check(interface_qty('IR1101', 'FastEthernet') == 4, 'IR1101 should retain four documented FastEthernet ports')
        check(interface_qty('IR1101', 'GigabitEthernet') == 1, 'IR1101 combo connector alternatives must count as one interface')
        check(interface_qty('IR8340', 'GigabitEthernet') == 10, 'IR8340 copper/combo interfaces should total ten')
        check(interface_qty('IR8340', 'Gigabit SFP') == 4, 'IR8340 should retain four dedicated SFP interfaces')
        for pt, slots in (('IR1101', {'pim': 2}), ('IR8340', {'nim': 2, 'pim': 2})):
            actual_slots = dict(conn.execute('''SELECT st.slug,ds.quantity FROM device_slots ds
                JOIN devices d USING(device_id) JOIN slot_types st USING(slot_type_id) WHERE d.pt_name=?''', (pt,)))
            check(actual_slots == slots, f'{pt}: documented module slot counts differ')
        check(one(conn, '''SELECT COUNT(*) FROM device_aliases a JOIN devices d USING(device_id)
                          WHERE d.pt_name='C8200' AND a.alias='PT8200' ''') == 1, 'C8200 must be searchable by its PT8200 help label')

        return counts
    finally:
        conn.close()


def validate_bundle(db_counts: dict[str, int]) -> None:
    check(BUNDLE_PATH.exists(), "Browser data bundle is missing")
    text = BUNDLE_PATH.read_text(encoding="utf-8")
    prefix = "window.PT_CATALOGUE = "
    check(text.startswith(prefix), "catalogue-data.js must assign window.PT_CATALOGUE")
    if not text.startswith(prefix):
        return
    payload = text[len(prefix):].strip()
    if payload.endswith(";"):
        payload = payload[:-1]
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        FAILURES.append(f"catalogue-data.js JSON payload is invalid: {exc}")
        return
    check(len(data.get("devices", [])) == db_counts["devices"], "Browser device count differs from SQLite")
    check(len(data.get("modules", [])) == db_counts["modules"], "Browser module count differs from SQLite")
    check(len(data.get("sources", [])) == db_counts["sources"], "Browser source count differs from SQLite")
    check(data.get("stats", {}).get("features") == db_counts["features"], "Browser feature count differs from SQLite")
    for device in data.get('devices', []):
        profiles = device.get('version_profiles', {})
        check(set(profiles) == {'6', '7', '8', '9'}, f"{device['pt_name']}: missing version profiles")
        family_availability = {str(row['major_version']): row for row in device['versions'] if row['is_family']}
        for major, profile in profiles.items():
            label = f"{device['pt_name']} / PT {major}"
            check(profile.get('availability') == family_availability.get(major), f"{label}: profile availability differs from version evidence")
            value = profile.get('availability', {}).get('available')
            check(value is None or type(value) is bool, f"{label}: browser availability must be true, false or null")
            for field in ('interfaces', 'features', 'modules', 'limitations'):
                expected = [row for row in device[field] if row['major_version'] in (None, int(major))]
                check(profile.get(field) == expected, f"{label}: {field} leaks or omits version-specific evidence")
            interfaces = profile.get('interfaces', [])
            totals = {}
            for interface in interfaces:
                totals[interface['slug']] = totals.get(interface['slug'], 0) + (interface['quantity'] or 0)
            check(profile.get('port_totals') == totals, f"{label}: interface totals differ from the scoped records")
            physical = sum(row['quantity'] or 0 for row in interfaces if row['slug'] != 'wireless')
            check(profile.get('total_physical_ports') == physical, f"{label}: physical-port total differs from the scoped records")
            feature_map = {row['slug']: row for row in profile.get('features', [])}
            check(profile.get('feature_map') == feature_map, f"{label}: feature map differs from the scoped records")
            statuses = {row['verification_status'] for row in interfaces}
            status = 'Unknown' if not statuses or 'Unknown' in statuses else 'Verified' if statuses == {'Verified'} else 'Partial'
            check(profile.get('interface_verification_status') == status, f"{label}: interface certainty differs from the evidence")
            expansion = {}
            total_expansion = 0
            for module in profile.get('modules', []):
                quantity = module.get('max_quantity') or 1
                total_expansion = max(total_expansion, sum(row['quantity'] or 0 for row in module['interfaces']) * quantity)
                for interface in module['interfaces']:
                    expansion[interface['slug']] = max(expansion.get(interface['slug'], 0), (interface['quantity'] or 0) * quantity)
            check(profile.get('max_module_port_additions') == expansion, f"{label}: module expansion leaks unscoped compatibility")
            check(profile.get('max_module_total_ports') == total_expansion, f"{label}: module total differs from scoped compatibility")


def validate_offline_runtime() -> None:
    index = INDEX_PATH.read_text(encoding="utf-8")
    app = APP_JS.read_text(encoding="utf-8")
    css = CSS_PATH.read_text(encoding="utf-8")

    check('href="css/app.css"' in index, "index.html must use bundled local CSS")
    check('src="data/catalogue-data.js"' in index, "index.html must load bundled catalogue data")
    check('src="js/app.js"' in index, "index.html must load bundled application JS")

    external_runtime = re.findall(r"<(?:script|link)[^>]+(?:src|href)=['\"]https?://", index, flags=re.I)
    check(not external_runtime, "index.html contains external runtime CSS/JS dependencies")
    check("fetch(" not in app, "Runtime app.js must not require fetch() for local data")
    check("XMLHttpRequest" not in app, "Runtime app.js must not require XMLHttpRequest")
    check("import(" not in app and " from '" not in app and ' from "' not in app, "Runtime app.js must not require JS module loading")
    check("http://" not in css and "https://" not in css, "CSS contains an external URL dependency")

    # Catch simple runtime breakage where app.js references a missing DOM id.
    html_ids = set(re.findall(r'id=[\"\']([^\"\']+)[\"\']', index))
    js_ids = set(re.findall(r"\$\(['\"]#([A-Za-z0-9_-]+)['\"]\)", app))
    missing_ids = sorted(js_ids - html_ids)
    check(not missing_ids, f"app.js references missing DOM ids: {missing_ids}")


if __name__ == "__main__":
    counts = validate_database()
    validate_bundle(counts)
    validate_offline_runtime()
    if FAILURES:
        print("VALIDATION FAILED")
        for item in FAILURES:
            print(f" - {item}")
        sys.exit(1)
    print("VALIDATION PASSED")
    print(" | ".join(f"{k}={v}" for k, v in counts.items()))
    print("offline_runtime=local-only")
