#!/usr/bin/env python3
"""Export the SQLite master catalogue to a browser-safe JavaScript data bundle.

The generated data/catalogue-data.js uses a plain global assignment so it can be
loaded directly by file:// without fetch(), ES modules, a local server, or any
runtime dependency.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "packet-tracer.db"
OUT = ROOT / "data" / "catalogue-data.js"


def rows(cur, sql, params=()):
    return [dict(r) for r in cur.execute(sql, params).fetchall()]


def add_aggregates(profile):
    totals = {}
    for interface in profile['interfaces']:
        totals[interface['slug']] = totals.get(interface['slug'], 0) + (interface['quantity'] or 0)
    profile['port_totals'] = totals
    profile['total_physical_ports'] = sum(i['quantity'] or 0 for i in profile['interfaces'] if i['slug'] != 'wireless')
    profile['feature_map'] = {feature['slug']: feature for feature in profile['features']}

    statuses = {interface['verification_status'] for interface in profile['interfaces']}
    profile['interface_verification_status'] = ('Unknown' if not statuses or 'Unknown' in statuses
                                               else 'Verified' if statuses == {'Verified'} else 'Partial')

    # Expansion remains a theoretical maximum for one compatible module model.
    expansion = {}
    max_total_expansion = 0
    for compatibility in profile['modules']:
        max_quantity = compatibility.get('max_quantity') or 1
        module_total = sum(interface['quantity'] or 0 for interface in compatibility['interfaces']) * max_quantity
        max_total_expansion = max(max_total_expansion, module_total)
        for interface in compatibility['interfaces']:
            expansion[interface['slug']] = max(expansion.get(interface['slug'], 0), (interface['quantity'] or 0) * max_quantity)
    profile['max_module_port_additions'] = expansion
    profile['max_module_total_ports'] = max_total_expansion


def version_profile(device, major):
    availability = next((version for version in device['versions']
                         if version['major_version'] == major and version['is_family']), None)
    if availability is None:
        availability = {
            'major_version': major, 'version': f'{major}.x', 'is_family': True,
            'available': None, 'verification_status': 'Unknown', 'source_id': None,
            'observed_release': None, 'evidence_kind': 'unverified', 'checked_date': None,
            'support_notes': 'No explicit availability evidence is recorded for this version family.',
        }
    profile = {'major_version': major, 'availability': availability}
    for field in ('interfaces', 'features', 'modules', 'limitations'):
        profile[field] = [row for row in device[field] if row['major_version'] in (None, major)]
    add_aggregates(profile)
    return profile


def main() -> None:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    metadata = {r["key"]: r["value"] for r in cur.execute("SELECT key,value FROM metadata")}
    categories = rows(cur, "SELECT category_id,slug,name,sort_order FROM device_categories ORDER BY sort_order,name")
    sources = rows(cur, "SELECT * FROM sources ORDER BY source_tier,publisher,title")
    source_map = {s["source_id"]: s for s in sources}
    versions = rows(cur, "SELECT * FROM packet_tracer_versions ORDER BY version_id")
    for version in versions:
        version['is_family'] = bool(version['is_family'])
    interface_types = rows(cur, "SELECT * FROM interface_types ORDER BY name")
    modules = rows(cur, "SELECT * FROM modules ORDER BY model")
    module_map = {m["module_id"]: m for m in modules}
    feature_catalog = rows(cur, """
        SELECT f.feature_id,f.slug,f.name,f.description,fc.slug AS category_slug,fc.name AS category_name,fc.sort_order
        FROM features f JOIN feature_categories fc ON fc.feature_category_id=f.category_id
        ORDER BY fc.sort_order,f.name
    """)
    feature_map = {f["feature_id"]: f for f in feature_catalog}
    role_catalog = rows(cur, "SELECT * FROM roles ORDER BY name")
    cable_types = rows(cur, "SELECT * FROM cable_types ORDER BY name")
    connection_rules = rows(cur, """
        SELECT cr.*, ia.slug AS interface_a_slug, ia.name AS interface_a_name,
               ib.slug AS interface_b_slug, ib.name AS interface_b_name,
               ca.slug AS category_a_slug, ca.name AS category_a_name,
               cb.slug AS category_b_slug, cb.name AS category_b_name,
               c.slug AS cable_slug, c.name AS cable_name, c.pt_display_name
        FROM connection_rules cr
        LEFT JOIN interface_types ia ON ia.interface_type_id=cr.interface_type_a_id
        LEFT JOIN interface_types ib ON ib.interface_type_id=cr.interface_type_b_id
        LEFT JOIN device_categories ca ON ca.category_id=cr.category_a_id
        LEFT JOIN device_categories cb ON cb.category_id=cr.category_b_id
        JOIN cable_types c ON c.cable_type_id=cr.cable_type_id
        ORDER BY cr.connection_rule_id
    """)

    # Expand module interface details once.
    for m in modules:
        m["interfaces"] = rows(cur, """
            SELECT mi.quantity,mi.name_pattern,COALESCE(mi.speed_mbps,it.speed_mbps) AS speed_mbps,mi.notes,
                   it.interface_type_id,it.slug,it.name,it.medium,it.connector
            FROM module_interfaces mi JOIN interface_types it USING(interface_type_id)
            WHERE mi.module_id=? ORDER BY it.name
        """, (m["module_id"],))
        src = source_map.get(m.get("source_id"))
        m["source"] = src

    devices = []
    category_map = {c["category_id"]: c for c in categories}
    for d in rows(cur, "SELECT * FROM devices ORDER BY display_name"):
        did = d["device_id"]
        d["category"] = category_map[d["category_id"]]
        d["aliases"] = [r["alias"] for r in rows(cur, "SELECT alias FROM device_aliases WHERE device_id=? ORDER BY alias", (did,))]
        d["versions"] = rows(cur, """
            SELECT dvs.*,ptv.version,ptv.release_date,ptv.major_version,ptv.is_family,
                   s.publisher AS source_publisher,s.title AS source_title,s.url AS source_url,s.source_tier
            FROM device_version_support dvs JOIN packet_tracer_versions ptv USING(version_id)
            LEFT JOIN sources s USING(source_id)
            WHERE device_id=? ORDER BY ptv.version_id
        """, (did,))
        for version in d['versions']:
            version['available'] = None if version['available'] is None else bool(version['available'])
            version['is_family'] = bool(version['is_family'])
        d["interfaces"] = rows(cur, """
            SELECT di.*,it.slug,it.name,it.speed_mbps,it.medium,it.connector,it.layer,it.duplex,
                   ptv.version,ptv.major_version,
                   s.publisher AS source_publisher,s.title AS source_title,s.url AS source_url,s.source_tier
            FROM device_interfaces di JOIN interface_types it USING(interface_type_id)
            LEFT JOIN packet_tracer_versions ptv USING(version_id)
            LEFT JOIN sources s USING(source_id)
            WHERE di.device_id=? ORDER BY COALESCE(it.speed_mbps,0),it.name
        """, (did,))
        d["slots"] = rows(cur, """
            SELECT ds.*,st.slug,st.name,st.description,
                   s.publisher AS source_publisher,s.title AS source_title,s.url AS source_url,s.source_tier
            FROM device_slots ds JOIN slot_types st USING(slot_type_id)
            LEFT JOIN sources s USING(source_id)
            WHERE ds.device_id=? ORDER BY st.name
        """, (did,))
        compat = rows(cur, """
            SELECT mc.*,m.model,m.module_type,m.description,m.slots_required,
                   st.slug AS slot_slug,st.name AS slot_name,ptv.version,ptv.major_version,
                   s.publisher AS source_publisher,s.title AS source_title,s.url AS source_url,s.source_tier
            FROM module_compatibility mc JOIN modules m USING(module_id)
            LEFT JOIN slot_types st USING(slot_type_id)
            LEFT JOIN packet_tracer_versions ptv USING(version_id)
            LEFT JOIN sources s USING(source_id)
            WHERE mc.device_id=? AND mc.compatible=1 ORDER BY m.model
        """, (did,))
        for c in compat:
            c["interfaces"] = module_map[c["module_id"]]["interfaces"]
        d["modules"] = compat
        d["features"] = rows(cur, """
            SELECT dfs.*,f.slug,f.name,f.description,fc.slug AS category_slug,fc.name AS category_name,
                   ptv.version,ptv.major_version,m.model AS required_module,
                   s.publisher AS source_publisher,s.title AS source_title,s.url AS source_url,s.source_tier
            FROM device_feature_support dfs
            JOIN features f USING(feature_id)
            JOIN feature_categories fc ON fc.feature_category_id=f.category_id
            LEFT JOIN packet_tracer_versions ptv USING(version_id)
            LEFT JOIN modules m ON m.module_id=dfs.required_module_id
            LEFT JOIN sources s USING(source_id)
            WHERE dfs.device_id=? ORDER BY fc.sort_order,f.name
        """, (did,))
        d["roles"] = rows(cur, """
            SELECT r.slug,r.name,r.description,dr.suitability,dr.notes
            FROM device_roles dr JOIN roles r USING(role_id)
            WHERE dr.device_id=? ORDER BY r.name
        """, (did,))
        d["limitations"] = rows(cur, """
            SELECT l.*,ptv.version,ptv.major_version,s.publisher AS source_publisher,s.title AS source_title,s.url AS source_url,s.source_tier
            FROM limitations l LEFT JOIN packet_tracer_versions ptv USING(version_id)
            LEFT JOIN sources s USING(source_id)
            WHERE l.device_id=? ORDER BY CASE severity WHEN 'warning' THEN 0 ELSE 1 END,title
        """, (did,))
        d["cisco_products"] = rows(cur, "SELECT * FROM cisco_products WHERE device_id=? ORDER BY cisco_product_id", (did,))

        add_aggregates(d)
        d["role_slugs"] = [r["slug"] for r in d["roles"]]
        d['version_profiles'] = {str(major): version_profile(d, major) for major in (6, 7, 8, 9)}

        tokens = [d["display_name"], d.get("model") or "", d.get("family") or "", d["category"]["name"], d.get("layer_capability") or "",
                  d.get("description") or "", d.get("typical_use") or ""]
        tokens += d["aliases"]
        tokens += [f["name"] for f in d["features"] if f["support_mode"] != "unsupported"]
        tokens += [r["name"] for r in d["roles"]]
        tokens += [i["name"] for i in d["interfaces"]]
        tokens += [m["model"] for m in d["modules"]]
        d["search_blob"] = " ".join(tokens).lower()
        devices.append(d)

    data = {
        "metadata": metadata,
        "stats": {
            "devices": len(devices),
            "modules": len(modules),
            "features": len(feature_catalog),
            "sources": len(sources),
            "categories": len(categories),
        },
        "categories": categories,
        "versions": versions,
        "interfaceTypes": interface_types,
        "featureCatalog": feature_catalog,
        "roleCatalog": role_catalog,
        "modules": modules,
        "cableTypes": cable_types,
        "connectionRules": connection_rules,
        "sources": sources,
        "devices": devices,
    }
    text = "window.PT_CATALOGUE = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"Wrote {OUT} ({OUT.stat().st_size:,} bytes)")
    con.close()

if __name__ == "__main__":
    main()
