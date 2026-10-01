#!/usr/bin/env python3
"""Create the Packet Tracer catalogue SQLite database with the bundled seed dataset.

Maintainer tool only. End users do not need Python; the browser uses data/catalogue-data.js.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "packet-tracer.db"
VERSION_EVIDENCE = ROOT / "data" / "version-evidence.json"
TODAY = "2026-10-01"
PT9_ROUTER_HELP_SOURCE = 'pt9_routers_official'

SCHEMA = r'''
PRAGMA foreign_keys = ON;

CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE device_categories (
    category_id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sources (
    source_id INTEGER PRIMARY KEY,
    publisher TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL,
    publication_date TEXT,
    accessed_date TEXT NOT NULL,
    source_tier INTEGER NOT NULL,
    notes TEXT
);

CREATE TABLE packet_tracer_versions (
    version_id INTEGER PRIMARY KEY,
    version TEXT NOT NULL UNIQUE,
    release_date TEXT,
    notes TEXT,
    major_version INTEGER NOT NULL CHECK (major_version IN (6,7,8,9)),
    is_family INTEGER NOT NULL DEFAULT 0 CHECK (is_family IN (0,1))
);

CREATE TABLE devices (
    device_id INTEGER PRIMARY KEY,
    pt_name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    model TEXT,
    family TEXT,
    category_id INTEGER NOT NULL REFERENCES device_categories(category_id),
    layer_capability TEXT NOT NULL,
    manufacturer TEXT NOT NULL DEFAULT 'Cisco',
    is_generic INTEGER NOT NULL DEFAULT 0 CHECK (is_generic IN (0,1)),
    is_modular INTEGER NOT NULL DEFAULT 0 CHECK (is_modular IN (0,1)),
    description TEXT,
    typical_use TEXT,
    verification_status TEXT NOT NULL DEFAULT 'Partial',
    last_verified TEXT
);

CREATE TABLE device_aliases (
    alias_id INTEGER PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    UNIQUE(device_id, alias)
);

CREATE TABLE device_version_support (
    support_id INTEGER PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    version_id INTEGER NOT NULL REFERENCES packet_tracer_versions(version_id),
    available INTEGER CHECK (available IN (0,1)),
    palette_path TEXT,
    support_notes TEXT,
    verification_status TEXT NOT NULL DEFAULT 'Unknown' CHECK (verification_status IN ('Verified','Partial','Unknown')),
    source_id INTEGER REFERENCES sources(source_id),
    observed_release TEXT,
    evidence_kind TEXT NOT NULL DEFAULT 'unverified' CHECK (evidence_kind IN ('documentation','observation','inference','unverified')),
    checked_date TEXT NOT NULL,
    UNIQUE(device_id, version_id)
);

CREATE TABLE interface_types (
    interface_type_id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    speed_mbps REAL,
    medium TEXT,
    connector TEXT,
    layer TEXT,
    duplex TEXT,
    description TEXT
);

CREATE TABLE device_interfaces (
    device_interface_id INTEGER PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    interface_type_id INTEGER NOT NULL REFERENCES interface_types(interface_type_id),
    quantity INTEGER NOT NULL DEFAULT 0,
    name_pattern TEXT,
    built_in INTEGER NOT NULL DEFAULT 1 CHECK (built_in IN (0,1)),
    switchport_capable INTEGER CHECK (switchport_capable IN (0,1)),
    routed_port_capable INTEGER CHECK (routed_port_capable IN (0,1)),
    poe_capable INTEGER CHECK (poe_capable IN (0,1)),
    notes TEXT,
    source_id INTEGER REFERENCES sources(source_id),
    version_id INTEGER REFERENCES packet_tracer_versions(version_id),
    verification_status TEXT NOT NULL DEFAULT 'Unknown' CHECK (verification_status IN ('Verified','Partial','Unknown'))
);

CREATE TABLE slot_types (
    slot_type_id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT
);

CREATE TABLE device_slots (
    device_slot_id INTEGER PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    slot_type_id INTEGER NOT NULL REFERENCES slot_types(slot_type_id),
    quantity INTEGER NOT NULL,
    slot_name TEXT,
    notes TEXT,
    source_id INTEGER REFERENCES sources(source_id)
);

CREATE TABLE modules (
    module_id INTEGER PRIMARY KEY,
    model TEXT NOT NULL UNIQUE,
    module_type TEXT NOT NULL,
    description TEXT,
    slots_required INTEGER NOT NULL DEFAULT 1,
    pt_available INTEGER NOT NULL DEFAULT 1 CHECK (pt_available IN (0,1)),
    notes TEXT,
    source_id INTEGER REFERENCES sources(source_id)
);

CREATE TABLE module_interfaces (
    module_interface_id INTEGER PRIMARY KEY,
    module_id INTEGER NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
    interface_type_id INTEGER NOT NULL REFERENCES interface_types(interface_type_id),
    quantity INTEGER NOT NULL,
    name_pattern TEXT,
    speed_mbps REAL,
    notes TEXT
);

CREATE TABLE module_compatibility (
    compatibility_id INTEGER PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    module_id INTEGER NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
    version_id INTEGER REFERENCES packet_tracer_versions(version_id),
    compatible INTEGER NOT NULL CHECK (compatible IN (0,1)),
    slot_type_id INTEGER REFERENCES slot_types(slot_type_id),
    max_quantity INTEGER,
    notes TEXT,
    verification_status TEXT NOT NULL DEFAULT 'Partial',
    source_id INTEGER REFERENCES sources(source_id),
    UNIQUE(device_id, module_id, version_id)
);

CREATE TABLE feature_categories (
    feature_category_id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE features (
    feature_id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES feature_categories(feature_category_id),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT
);

CREATE TABLE device_feature_support (
    device_feature_id INTEGER PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    feature_id INTEGER NOT NULL REFERENCES features(feature_id),
    version_id INTEGER REFERENCES packet_tracer_versions(version_id),
    support_mode TEXT NOT NULL CHECK (support_mode IN (
        'native','configuration_required','module_required','module_and_configuration','unsupported','unknown'
    )),
    configuration_required INTEGER NOT NULL DEFAULT 0 CHECK (configuration_required IN (0,1)),
    required_module_id INTEGER REFERENCES modules(module_id),
    notes TEXT,
    verification_status TEXT NOT NULL DEFAULT 'Partial',
    source_id INTEGER REFERENCES sources(source_id),
    UNIQUE(device_id, feature_id, version_id)
);

CREATE TABLE roles (
    role_id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT
);

CREATE TABLE device_roles (
    device_role_id INTEGER PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(role_id),
    suitability TEXT NOT NULL DEFAULT 'good',
    notes TEXT,
    UNIQUE(device_id, role_id)
);

CREATE TABLE cable_types (
    cable_type_id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    medium TEXT,
    connector_a TEXT,
    connector_b TEXT,
    requires_clocking INTEGER NOT NULL DEFAULT 0 CHECK (requires_clocking IN (0,1)),
    pt_display_name TEXT,
    description TEXT
);

CREATE TABLE connection_rules (
    connection_rule_id INTEGER PRIMARY KEY,
    interface_type_a_id INTEGER REFERENCES interface_types(interface_type_id),
    interface_type_b_id INTEGER REFERENCES interface_types(interface_type_id),
    category_a_id INTEGER REFERENCES device_categories(category_id),
    category_b_id INTEGER REFERENCES device_categories(category_id),
    cable_type_id INTEGER NOT NULL REFERENCES cable_types(cable_type_id),
    recommended INTEGER NOT NULL DEFAULT 1 CHECK (recommended IN (0,1)),
    auto_mdix_alternative TEXT,
    notes TEXT
);

CREATE TABLE cisco_products (
    cisco_product_id INTEGER PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    official_product_name TEXT,
    sku TEXT,
    product_family TEXT,
    lifecycle_status TEXT,
    end_of_sale_date TEXT,
    end_of_support_date TEXT,
    official_url TEXT
);

CREATE TABLE limitations (
    limitation_id INTEGER PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    version_id INTEGER REFERENCES packet_tracer_versions(version_id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    source_id INTEGER REFERENCES sources(source_id)
);

CREATE INDEX idx_devices_category ON devices(category_id);
CREATE INDEX idx_device_interfaces_device ON device_interfaces(device_id);
CREATE INDEX idx_device_features_device ON device_feature_support(device_id);
CREATE INDEX idx_module_compat_device ON module_compatibility(device_id);
CREATE INDEX idx_module_compat_module ON module_compatibility(module_id);

CREATE VIRTUAL TABLE device_search_fts USING fts5(
    device_id UNINDEXED,
    display_name,
    model,
    aliases,
    description,
    typical_use,
    roles,
    features,
    interfaces,
    modules,
    tokenize='unicode61'
);
'''

# --- Seed constants -------------------------------------------------------
CATEGORIES = [
    (1, 'router', 'Routers', 10),
    (2, 'switch_l2', 'Layer 2 Switches', 20),
    (3, 'switch_l3', 'Layer 3 / Multilayer Switches', 30),
    (4, 'security', 'Security Appliances', 40),
    (5, 'wireless_ap', 'Wireless Access Points', 50),
    (6, 'wireless_controller', 'Wireless Controllers', 60),
    (7, 'wireless_router', 'Wireless Routers', 70),
    (8, 'wan_cloud', 'WAN / Cloud Devices', 80),
    (9, 'industrial_router', 'Industrial Routers', 90),
    (10, 'industrial_switch', 'Industrial Switches', 100),
    (11, 'industrial_security', 'Industrial Security', 110),
    (12, 'generic_network', 'Generic Network Devices', 120),
]

SOURCES = [
    (1, 'Cisco Networking Academy', 'Packet Tracer - Compare Layer 2 and Layer 3 Devices', 'https://contenthub.netacad.com/courses/ensa/_common/11.5.1-packet-tracer---compare-layer-2-and-layer-3-devices.pdf', 'NetAcad Packet Tracer lab', None, TODAY, 1, 'Official Cisco Networking Academy activity comparing 2960, 3650 and ISR4321.'),
    (2, 'Cisco', 'Cisco 3900/2900/1900 Series Software Configuration Guide - Basic Router Configuration', 'https://www.cisco.com/c/en/us/td/docs/routers/access/1900/software/configuration/guide/Software_Configuration/routconf.html', 'Hardware/software guide', None, TODAY, 1, 'Official onboard interface table for 1941/2901/2911.'),
    (3, 'Cisco', 'Cisco 3900 Series and Cisco 2900 Series Hardware Installation Guide', 'https://www.cisco.com/c/en/us/td/docs/routers/access/2900/hardware/installation/guide/Hardware_Installation_Guide/Overview.html', 'Hardware installation guide', None, TODAY, 1, 'Official slots, ports and interface numbering.'),
    (4, 'Cisco', 'Catalyst 3750, 3560 and 2970 Release Notes', 'https://www.cisco.com/en/US/docs/switches/lan/catalyst2970/software/release/12.2_25_sec/release/notes/OL7454.html', 'Product documentation', None, TODAY, 1, 'Official physical Catalyst 3560 port variants.'),
    (5, 'Cisco', 'Cisco Catalyst 2960 Series Switches Q&A', 'https://www.cisco.com/c/dam/global/de_at/assets/unified_partners/smb/vertriebliche-positionierung/switching/downloads/cat_2960_faq_e.pdf', 'Product documentation', None, TODAY, 1, 'Official 2960-24TT description: 24 10/100 plus two 10/100/1000 uplinks.'),
    (6, 'PacketTracerNetwork.com', 'ISR routers emulated in Cisco Packet Tracer 9.0', 'https://www.packettracernetwork.com/features/cisco-packet-tracer-routers.html', 'Packet Tracer-specific reference', '2025-10-04', TODAY, 3, 'Third-party PT-specific inventory; use with verification status.'),
    (7, 'PacketTracerNetwork.com', 'Wireless LAN controllers & access points emulated in Cisco Packet Tracer 9.0', 'https://www.packettracernetwork.com/features/wireless-lan-devices.html', 'Packet Tracer-specific reference', '2025-09-27', TODAY, 3, 'PT-specific WLC/AP capabilities.'),
    (8, 'PacketTracerNetwork.com', 'Firewalls and Meraki security appliances emulated in Cisco Packet Tracer 9.0', 'https://www.packettracernetwork.com/features/cisco-packet-tracer-firewalls.html', 'Packet Tracer-specific reference', '2025-09-22', TODAY, 3, 'PT-specific ASA and Meraki capabilities.'),
    (9, 'PacketTracerNetwork.com', 'WIC modules, Network modules, and transceivers emulated in Cisco Packet Tracer 9.0', 'https://www.packettracernetwork.com/features/cisco-wic-modules.html', 'Packet Tracer-specific reference', '2025-09-14', TODAY, 3, 'PT-specific module descriptions.'),
    (10, 'PTBuilder community project', 'Device Module Compatibility List', 'https://github-wiki-see.page/m/kimmknight/PTBuilder/wiki/Device-Module-Compatibility-List', 'Packet Tracer API-derived compatibility', None, TODAY, 4, 'Derived from Packet Tracer API; may expose modules not visible in GUI.'),
    (11, 'MCP Packet Tracer community project', 'Verified Device Ports from live Packet Tracer 8.x', 'https://github.com/Deiviidsito/MCP_Packet_Tracer/blob/main/WIKI.md', 'Packet Tracer live-probe reference', None, TODAY, 4, 'Community live probing of PT 8.x interfaces; useful where official PT inventory is absent.'),
    (12, 'PacketTracerNetwork.com', 'Packet Tracer 9.0.0 new features', 'https://www.packettracernetwork.com/features/packet-tracer-9-new-features.html', 'Packet Tracer-specific release reference', '2025-10-27', TODAY, 3, 'Lists PT 9 industrial routers, switch and firewall.'),
    (13, 'Cisco', 'ASA 5505 Basic Interface Configuration', 'https://www.cisco.com/c/en/us/td/docs/security/asa/asa92/configuration/general/asa-general-cli/interface-basic-5505.html', 'Configuration guide', None, TODAY, 1, 'Official ASA 5505 eight Fast Ethernet switchports, two PoE.'),
    (14, 'Cisco', 'ASA 5506-X Hardware Installation Guide - Overview', 'https://www.cisco.com/c/en/us/td/docs/security/asa/hw/maintenance/5506xguide/b_Install_Guide_5506/b_Install_Guide_5506_chapter_01.html', 'Hardware installation guide', None, TODAY, 1, 'Official eight GE data ports plus management.'),
    (15, 'Cisco', 'Cisco 4000 Series ISR - Interfaces and Modules', 'https://www.cisco.com/c/en/us/products/routers/4000-series-integrated-services-routers-isr/relevant-interfaces-and-modules.html', 'Product documentation', None, TODAY, 1, 'Official NIM serial module compatibility.'),
    (16, 'Cisco', 'End-of-Sale and End-of-Life Announcement for select ISR 4000 platforms', 'https://www.cisco.com/c/en/us/products/collateral/routers/4000-series-integrated-services-routers-isr/select-isr4k-series-platform-eol.html', 'Lifecycle notice', None, TODAY, 1, 'Official ISR4321/4331 product descriptions and lifecycle.'),
    (22, 'Network Engineering Stack Exchange', 'Packet Tracer 3650-24PS interface observation', 'https://networkengineering.stackexchange.com/questions/68382/is-there-a-gigabit-switch-in-packet-tracer-more-than-two-gigabit-ports/68387', 'Community observation', '2020-06-10', TODAY, 4, 'PT 7.2 observation: 24 fixed GE plus four uplink GE/SFP positions.'),
    (24, 'Cisco Community', 'Add FastEthernet port to 1841 router', 'https://community.cisco.com/t5/routing-and-sd-wan/add-fastethernet-port-to-1841-router/td-p/4702997', 'Cisco Community Packet Tracer discussion', '2022-10-14', TODAY, 2, 'Explains PT 1841 HWIC-4ESW behavior and HWIC-2T option.'),
    (25, 'Cisco', 'ASA 5506-X Series Quick Start Guide', 'https://www.cisco.com/c/en/us/td/docs/security/asa/quick_start/5506X/5506x-quick-start.html', 'Configuration guide', None, TODAY, 1, 'Official ASA 5506-X default interface behavior.'),
]

VERSIONS = [
    (1, '7.2', None, 'Included for historical device/interface observations where source is version-specific.', 7, 0),
    (2, '8.x', None, 'Packet Tracer 8.x family; exact minor-version behavior can vary.', 8, 1),
    (3, '9.0.0', '2025-10-27', 'Specific release represented by existing technical evidence.', 9, 0),
    (4, '6.x', None, 'Packet Tracer 6.x family; availability requires explicit version evidence.', 6, 1),
    (5, '7.x', None, 'Packet Tracer 7.x family; exact minor-version availability can vary.', 7, 1),
    (6, '9.x', None, 'Packet Tracer 9.x family; exact minor-version availability can vary.', 9, 1),
]

INTERFACE_TYPES = [
    (1, 'ethernet10', 'Ethernet 10 Mbps', 10, 'Copper', 'RJ-45', 'L2/L3', 'Half/Full', '10BASE-T Ethernet'),
    (2, 'fastethernet', 'FastEthernet', 100, 'Copper', 'RJ-45', 'L2/L3', 'Half/Full', '100BASE-TX Ethernet'),
    (3, 'gigabitethernet', 'GigabitEthernet', 1000, 'Copper', 'RJ-45', 'L2/L3', 'Full', '1000BASE-T Ethernet'),
    (4, 'gigabit_sfp', 'Gigabit SFP', 1000, 'Fiber/Copper transceiver', 'SFP', 'L2/L3', 'Full', '1 Gb/s SFP slot/transceiver'),
    (5, 'tengigabit', 'TenGigabitEthernet', 10000, 'Copper/Fiber', 'SFP+/RJ-45', 'L2/L3', 'Full', '10 Gb/s Ethernet'),
    (6, 'serial', 'Serial WAN', None, 'Serial', 'Smart Serial', 'L3', 'N/A', 'Synchronous/asynchronous serial WAN interface'),
    (7, 'console', 'Console', None, 'Copper', 'RJ-45/USB', 'Management', 'N/A', 'Out-of-band management console'),
    (8, 'wireless', 'Wireless Radio', None, 'RF', 'Radio', 'L2', 'N/A', '802.11 wireless radio'),
    (9, 'coaxial', 'Coaxial', None, 'Coaxial', 'Coax', 'L1/L2', 'N/A', 'Coaxial WAN interface'),
    (10, 'modem', 'Modem/Phone', None, 'Copper', 'RJ-11', 'WAN', 'N/A', 'Analog modem/telephone interface'),
    (11, 'cellular', 'Cellular', None, 'RF', 'Cellular radio', 'L3', 'N/A', 'Cellular WAN interface'),
    (12, 'management_ge', 'Management GigabitEthernet', 1000, 'Copper', 'RJ-45', 'Management', 'Full', 'Dedicated management Ethernet'),
]

SLOT_TYPES = [
    (1, 'wic_hwic', 'WIC/HWIC', 'WAN/High-Speed WAN interface card slot'),
    (2, 'ehwic', 'EHWIC', 'Enhanced HWIC slot'),
    (3, 'nim', 'NIM', 'Network Interface Module slot'),
    (4, 'nm', 'NM', 'Network Module slot'),
    (5, 'sfp', 'SFP', 'Small Form-Factor Pluggable transceiver slot'),
    (6, 'pim', 'PIM', 'Pluggable Interface Module slot'),
    (7, 'generic', 'Generic Module Slot', 'Packet Tracer generic modular slot'),
]

FEATURE_CATEGORIES = [
    (1, 'switching', 'Switching', 10),
    (2, 'routing', 'Routing', 20),
    (3, 'redundancy', 'Redundancy', 30),
    (4, 'gateway_security', 'Gateway / Security', 40),
    (5, 'wan', 'WAN', 50),
    (6, 'wireless', 'Wireless', 60),
    (7, 'management', 'Management / Services', 70),
    (8, 'industrial', 'Industrial / OT', 80),
]

FEATURES = [
    (1,1,'vlan','VLAN','802.1Q VLAN segmentation'),
    (2,1,'dot1q_trunk','802.1Q Trunking','Tagged VLAN trunking'),
    (3,1,'stp','STP','Spanning Tree Protocol'),
    (4,1,'rstp','RSTP / Rapid PVST+','Rapid spanning tree family'),
    (5,1,'etherchannel','EtherChannel','Link aggregation / port-channel'),
    (6,1,'lacp','LACP','IEEE link aggregation negotiation'),
    (7,1,'pagp','PAgP','Cisco Port Aggregation Protocol'),
    (8,1,'port_security','Port Security','Switchport MAC security'),
    (9,1,'voice_vlan','Voice VLAN','Voice VLAN support'),
    (10,1,'svi','SVI','Switched Virtual Interface'),
    (11,1,'routed_ports','Routed Physical Ports','Physical switchports convertible to L3'),
    (12,1,'poe','PoE','Power over Ethernet'),
    (13,1,'span','SPAN','Port mirroring'),
    (14,1,'lldp','LLDP','Link Layer Discovery Protocol'),
    (15,1,'rep','REP','Resilient Ethernet Protocol'),
    (16,2,'inter_vlan','Inter-VLAN Routing','Routing between VLANs'),
    (17,2,'static_routing','Static Routing','Static IPv4 routing'),
    (18,2,'default_route','Default Route','Default route support'),
    (19,2,'rip','RIP / RIPv2','Routing Information Protocol'),
    (20,2,'ospf','OSPF','Open Shortest Path First'),
    (21,2,'eigrp','EIGRP','Enhanced Interior Gateway Routing Protocol'),
    (22,2,'ipv6_routing','IPv6 Routing','IPv6 unicast routing'),
    (23,2,'ospfv3','OSPFv3','OSPF for IPv6'),
    (24,2,'bgp','BGP','Border Gateway Protocol'),
    (25,3,'hsrp','HSRP','Hot Standby Router Protocol'),
    (26,3,'vrrp','VRRP','Virtual Router Redundancy Protocol'),
    (27,3,'glbp','GLBP','Gateway Load Balancing Protocol'),
    (28,4,'nat','NAT','Network Address Translation'),
    (29,4,'pat','PAT','Port Address Translation / NAT overload'),
    (30,4,'acl_standard','Standard ACL','Standard IPv4 access lists'),
    (31,4,'acl_extended','Extended ACL','Extended IPv4 access lists'),
    (32,4,'stateful_firewall','Stateful Firewall','Stateful traffic inspection'),
    (33,4,'vpn','VPN','VPN / IPsec capability'),
    (34,4,'firepower','FirePOWER','FirePOWER/NGIPS services'),
    (35,5,'serial_wan','Serial WAN','Serial WAN connectivity'),
    (36,5,'ppp','PPP','Point-to-Point Protocol'),
    (37,5,'hdlc','HDLC','Cisco HDLC serial encapsulation'),
    (38,5,'frame_relay','Frame Relay','Frame Relay simulation'),
    (39,5,'pppoe','PPPoE','PPP over Ethernet'),
    (40,6,'wireless_ap','Wireless AP','Acts as wireless access point'),
    (41,6,'wireless_controller','Wireless Controller','Central wireless LAN controller'),
    (42,6,'capwap','CAPWAP','Controller/AP CAPWAP tunneling'),
    (43,6,'wpa2','WPA2','WPA2 wireless security'),
    (44,6,'wpa3','WPA3','WPA3 wireless security'),
    (45,6,'cellular_3g4g','3G/4G Cellular','Cellular WAN support'),
    (46,6,'cellular_5g','5G Cellular','5G cellular WAN support'),
    (47,7,'dhcp_server','DHCP Server','DHCP address service'),
    (48,7,'dhcp_relay','DHCP Relay','DHCP relay / helper capability'),
    (49,7,'dhcp_proxy','DHCP Proxy','Wireless controller DHCP proxy'),
    (50,7,'web_gui','Web GUI','Browser-based configuration interface'),
    (51,8,'industrial_ot','Industrial / OT Networking','Industrial/operational technology focus'),
    (52,8,'ptp','Precision Time Protocol','PTP timing'),
]

ROLES = [
    (1,'access_switch','Access Switch','Connects endpoint/access devices'),
    (2,'distribution_switch','Distribution Switch','Aggregates access switches and applies L3 policy'),
    (3,'core_switch','Core Switch','High-capacity switching/routing backbone'),
    (4,'multilayer_gateway','Multilayer VLAN Gateway','SVI/inter-VLAN default gateway'),
    (5,'internet_gateway','Internet/NAT Gateway','Routes/NATs between LAN and WAN'),
    (6,'wan_router','WAN Router','Routes between sites/WAN technologies'),
    (7,'isp_router','ISP/Outside Router','Represents provider/outside routing'),
    (8,'firewall','Firewall','Security boundary / stateful firewall'),
    (9,'wireless_ap','Wireless Access Point','Provides Wi-Fi access'),
    (10,'wireless_controller','Wireless Controller','Manages lightweight APs'),
    (11,'wireless_router','Wireless Router','Small/home integrated router/AP/switch'),
    (12,'wan_emulation','WAN Emulation','Emulates provider/cloud media'),
    (13,'industrial_router','Industrial Router','Rugged OT routing'),
    (14,'industrial_switch','Industrial Switch','Rugged OT switching'),
    (15,'industrial_firewall','Industrial Firewall','Rugged OT security boundary'),
]

CABLES = [
    (1,'copper_straight','Copper Straight-Through','Copper','RJ-45','RJ-45',0,'Copper Straight-Through','Conventional Ethernet cable for unlike device types (for example router-to-switch).'),
    (2,'copper_crossover','Copper Cross-Over','Copper','RJ-45','RJ-45',0,'Copper Cross-Over','Conventional Ethernet cable for like device types such as switch-to-switch or router-to-router.'),
    (3,'fiber','Fiber','Fiber','SFP/LC','SFP/LC',0,'Fiber','Optical Ethernet connection when both endpoints have compatible fiber/SFP interfaces.'),
    (4,'serial_dce','Serial DCE','Serial','Smart Serial','Smart Serial',1,'Serial DCE','WAN serial cable; DCE endpoint supplies clocking.'),
    (5,'serial_dte','Serial DTE','Serial','Smart Serial','Smart Serial',0,'Serial DTE','WAN serial DTE side.'),
    (6,'console','Console','Copper','RJ-45/USB','Console',0,'Console','Out-of-band management cable.'),
    (7,'coax','Coaxial','Coaxial','Coax','Coax',0,'Coaxial','Coaxial WAN/media connection.'),
    (8,'phone','Phone','Copper','RJ-11','RJ-11',0,'Phone','Analog telephone/modem connection.'),
]

# model, display, family, category, layer, generic, modular, description, typical, verify
DEVICES = [
    ('1841','Cisco 1841','1841','ISR 1800',1,'L3',0,1,'Legacy modular ISR commonly used in Packet Tracer labs. Two built-in FastEthernet routed ports; serial and EtherSwitch connectivity are added with modules.','Small WAN router, gateway, serial lab router','Verified'),
    ('2811','Cisco 2811','2811','ISR 2800',1,'L3',0,1,'Legacy modular ISR with two built-in FastEthernet ports and multiple expansion slots.','WAN router, gateway, voice/serial lab router','Partial'),
    ('1941','Cisco 1941','1941','ISR 1900',1,'L3',0,1,'ISR with two built-in GigabitEthernet routed ports and EHWIC expansion.','Branch router, NAT gateway, WAN lab router','Verified'),
    ('2901','Cisco 2901','2901','ISR 2900',1,'L3',0,1,'ISR with two built-in GigabitEthernet routed ports and EHWIC expansion.','Branch router, gateway, WAN lab router','Verified'),
    ('2911','Cisco 2911','2911','ISR 2900',1,'L3',0,1,'ISR with three built-in GigabitEthernet routed ports and modular WAN expansion.','Branch/campus gateway, NAT router, WAN router','Verified'),
    ('ISR4321','Cisco ISR 4321','ISR 4321','ISR 4000',1,'L3',0,1,'Modern ISR represented in Packet Tracer and NetAcad labs; two onboard GigabitEthernet ports and NIM expansion.','Branch WAN router, enterprise edge','Verified'),
    ('ISR4331','Cisco ISR 4331','ISR 4331','ISR 4000',1,'L3',0,1,'Modern ISR with three GigabitEthernet ports in the real platform family and modular NIM/SM expansion.','Branch/campus edge router','Partial'),
    ('819','Cisco 819 ISR','819','ISR 800',9,'L3',0,1,'Industrial/M2M ISR represented with cellular WAN and internal wireless capabilities in Packet Tracer.','Cellular branch/industrial WAN router','Partial'),
    ('829','Cisco 829 ISR','829','ISR 800',9,'L3',0,1,'Industrial ISR used for cellular/IoT networking labs.','Industrial/cellular WAN router','Partial'),
    ('CGR1240','Cisco CGR 1240','CGR 1240','Connected Grid Router',9,'L3',0,1,'Connected Grid Router available in Packet Tracer industrial networking scenarios.','Industrial/utility WAN router','Partial'),
    ('C8200','Cisco Catalyst 8200','C8200-1N-4T','Catalyst 8200',1,'L3',0,1,'Catalyst 8200 edge platform added to Packet Tracer 9.0 for modern WAN/SASE scenarios.','Modern enterprise edge/WAN router','Partial'),
    ('IR1101','Cisco Catalyst IR1101','IR1101','Catalyst IR1100',9,'L3',0,1,'Rugged industrial router added in Packet Tracer 9.0. Installed 9.0.1 help documents four FastEthernet ports, one GigabitEthernet RJ-45/SFP combo interface and two cellular-module slots. The combo alternatives share one interface.','Industrial edge router','Partial'),
    ('IR8340','Cisco Catalyst IR8340','IR8340','Catalyst IR8300',9,'L3',0,1,'Rugged industrial router added in Packet Tracer 9.0. Installed 9.0.1 help documents twelve LAN interfaces (four RJ-45, four RJ-45/SFP combo, four SFP), two combo WAN interfaces, two NIM and two PIM slots. Each combo interface is counted once.','Industrial aggregation/router','Partial'),
    ('Router-PT','Packet Tracer Generic Router','Router-PT','Packet Tracer Generic',12,'L3',1,1,'Generic configurable Packet Tracer router used when a specific Cisco model is not required.','Flexible lab router','Partial'),
    ('2950-24','Cisco Catalyst 2950-24','2950-24','Catalyst 2950',2,'L2',0,0,'Legacy Layer 2 access switch represented in Packet Tracer.','Basic access switching/VLAN labs','Partial'),
    ('2950T-24','Cisco Catalyst 2950T-24','2950T-24','Catalyst 2950',2,'L2',0,0,'Layer 2 access switch with 24 FastEthernet access ports plus two Gigabit uplinks in Packet Tracer references.','Access switch with GE uplinks','Partial'),
    ('2960-24TT','Cisco Catalyst 2960-24TT','2960-24TT','Catalyst 2960',2,'L2',0,0,'Default Packet Tracer Layer 2 access switch: 24 FastEthernet access ports and two GigabitEthernet uplinks.','Access switch, VLAN/trunk/EtherChannel labs','Verified'),
    ('3560-24PS','Cisco Catalyst 3560-24PS','3560-24PS','Catalyst 3560',3,'L2+L3',0,0,'Packet Tracer multilayer switch with 24 FastEthernet plus two GigabitEthernet interfaces; supports routed ports and inter-VLAN routing.','Distribution/core, HSRP gateway, inter-VLAN routing','Verified'),
    ('3650-24PS','Cisco Catalyst 3650-24PS','3650-24PS','Catalyst 3650',3,'L2+L3',0,0,'Packet Tracer multilayer switch used in NetAcad labs; commonly represented with 24 fixed Gigabit access ports plus four Gigabit uplink positions.','Modern multilayer core/distribution switch','Partial'),
    ('IE-2000','Cisco IE-2000','IE-2000','Industrial Ethernet 2000',10,'L2',0,0,'Industrial Ethernet switch introduced in Packet Tracer 7.x for OT labs.','Industrial access switch','Partial'),
    ('IE-3400','Cisco Catalyst IE-3400','IE-3400-8P2S-A','Catalyst IE3400',10,'L2+L3',0,0,'Rugged multilayer industrial switch added in Packet Tracer 9.0 with ten Gigabit Ethernet ports.','Industrial distribution/multilayer switch','Partial'),
    ('Switch-PT','Packet Tracer Generic Switch','Switch-PT','Packet Tracer Generic',12,'L2',1,1,'Generic Packet Tracer switch with modular/flexible interfaces.','Generic access switch','Partial'),
    ('Switch-PT-Empty','Packet Tracer Empty Switch','Switch-PT-Empty','Packet Tracer Generic',12,'L2',1,1,'Empty modular Packet Tracer switch chassis; add modules to create the required interface mix.','Custom modular switch labs','Partial'),
    ('ASA5505','Cisco ASA 5505','ASA 5505','ASA 5500',4,'L2+L3',0,0,'Legacy ASA firewall with eight FastEthernet switchports and logical VLAN interfaces.','Firewall, NAT, VPN, DMZ labs','Verified'),
    ('ASA5506-X','Cisco ASA 5506-X','ASA 5506-X','ASA 5500-X',4,'L3',0,0,'ASA firewall emulated in Packet Tracer; eight GE data interfaces plus management on physical hardware. FirePOWER features are not simulated.','Firewall/NAT/VPN edge','Verified'),
    ('MX65W','Cisco Meraki MX65W','MX65W','Meraki MX',4,'L3',0,0,'Simplified cloud-managed security appliance in Packet Tracer with VLANs, DHCP, wireless, outbound firewall rules and PPPoE.','Cloud-managed branch security/wireless','Partial'),
    ('ISA3000','Cisco ISA 3000','ISA-3000-2C2F-K9','Industrial Security Appliance',11,'L3',0,0,'Industrial firewall added in Packet Tracer 9.0 with two GE SFP, two 10/100/1000 copper and one management port.','Industrial firewall/segmentation','Partial'),
    ('AccessPoint-PT','Packet Tracer Access Point','AccessPoint-PT','Packet Tracer Wireless',5,'L2',1,0,'Generic Packet Tracer access point for basic wireless labs.','Basic standalone Wi-Fi access point','Partial'),
    ('LAP-PT','Packet Tracer Lightweight AP','LAP-PT','Packet Tracer Wireless',5,'L2',1,0,'Lightweight access point designed to register to a wireless LAN controller.','Controller-based Wi-Fi AP','Partial'),
    ('3702i','Cisco Aironet 3702i','3702i','Aironet 3700',5,'L2',0,0,'Lightweight enterprise AP emulated in Packet Tracer with PoE, DHCP client and WLC registration.','Controller-based enterprise Wi-Fi AP','Verified'),
    ('WLC-2504','Cisco 2504 WLC','2504','Wireless LAN Controller 2500',6,'L2/L3 services',0,0,'Wireless controller emulated with CAPWAP, SSID-to-VLAN mapping, WPA/WPA2 and DHCP services.','Small/medium wireless LAN controller','Verified'),
    ('WLC-3504','Cisco 3504 WLC','3504','Wireless LAN Controller 3500',6,'L2/L3 services',0,0,'Wireless controller with four GE plus one multigigabit interface (limited to 1G in Packet Tracer reference).','Wireless LAN controller','Verified'),
    ('HomeRouter','Packet Tracer Home Router','Home Router','Linksys-style Home Router',7,'L3',1,0,'Integrated small-network wireless router/switch/AP with WPA/WPA2 features.','Home/SOHO wireless router','Partial'),
    ('Cloud-PT','Packet Tracer Cloud','Cloud-PT','Packet Tracer WAN',8,'WAN',1,1,'WAN/cloud emulation device with serial, modem, Ethernet and coaxial interfaces.','WAN provider/media emulation','Verified'),
]

# Interfaces keyed by device pt_name: list(type_slug, qty, pattern, switchport, routed, poe, notes, source)
DEVICE_INTERFACES = {
    '1841':[('fastethernet',2,'FastEthernet0/0-1',0,1,0,'Built-in routed ports.',11)],
    '2811':[('fastethernet',2,'FastEthernet0/0-1',0,1,0,'Built-in routed ports.',6)],
    '1941':[('gigabitethernet',2,'GigabitEthernet0/0-1',0,1,0,'Built-in routed ports.',2)],
    '2901':[('gigabitethernet',2,'GigabitEthernet0/0-1',0,1,0,'Built-in routed ports.',2)],
    '2911':[('gigabitethernet',3,'GigabitEthernet0/0-2',0,1,0,'Built-in routed ports.',2)],
    'ISR4321':[('gigabitethernet',2,'GigabitEthernet0/0/0-1',0,1,0,'Packet Tracer/NetAcad representation.',1)],
    'ISR4331':[('gigabitethernet',3,'GigabitEthernet0/0/0-2',0,1,0,'Platform family description; verify current PT Physical tab.',16)],
    '819':[('gigabitethernet',4,'GigabitEthernet LAN/WAN',1,1,0,'Exact PT naming varies; partial record.',6),('cellular',1,'Cellular0',0,1,0,'3G/4G WAN.',6),('wireless',1,'WLAN radio',0,0,0,'Integrated wireless AP capability.',6)],
    '829':[('gigabitethernet',4,'GigabitEthernet',1,1,0,'Exact PT port layout should be verified in current version.',6),('cellular',1,'Cellular',0,1,0,'Cellular WAN.',6)],
    'CGR1240':[('gigabitethernet',2,'GigabitEthernet',0,1,0,'Partial PT record; verify Physical tab.',6),('cellular',1,'Cellular',0,1,0,'Industrial cellular WAN.',6)],
    'C8200':[('gigabitethernet',4,'GigabitEthernet',0,1,0,'C8200-1N-4T style representation; verify PT 9 Physical tab.',12)],
    'IR1101':[
        ('fastethernet',4,'FastEthernet LAN ports',None,None,None,'Installed PT 9.0.1 help: four 10/100BASE-T ports; runtime capabilities remain unverified.',PT9_ROUTER_HELP_SOURCE),
        ('gigabitethernet',1,'GigabitEthernet combo uplink',None,None,None,'Installed PT 9.0.1 help: one RJ-45/SFP combo interface, represented once in GigabitEthernet totals. Copper and SFP are alternative connectors, not two simultaneous ports.',PT9_ROUTER_HELP_SOURCE),
    ],
    'IR8340':[
        ('gigabitethernet',4,'RJ-45 LAN ports',None,None,1,'Installed PT 9.0.1 help: four RJ-45 LAN ports with PoE/PoE+/UPoE; runtime behavior remains unverified.',PT9_ROUTER_HELP_SOURCE),
        ('gigabitethernet',4,'Combo LAN interfaces',None,None,None,'Installed PT 9.0.1 help: four RJ-45/SFP combo LAN interfaces. Each is counted once as GigabitEthernet; SFP is an alternative connector.',PT9_ROUTER_HELP_SOURCE),
        ('gigabit_sfp',4,'SFP LAN interfaces',None,None,None,'Installed PT 9.0.1 help: four dedicated SFP LAN interfaces, separate from the combo connector alternatives.',PT9_ROUTER_HELP_SOURCE),
        ('gigabitethernet',2,'Combo WAN interfaces',None,None,None,'Installed PT 9.0.1 help: two RJ-45/SFP combo WAN interfaces. Each is counted once as GigabitEthernet; SFP is an alternative connector.',PT9_ROUTER_HELP_SOURCE),
    ],
    'Router-PT':[('fastethernet',4,'FastEthernet modular/default',0,1,0,'Generic router commonly used with four FastEthernet ports.',24)],
    '2950-24':[('fastethernet',24,'FastEthernet0/1-24',1,0,0,'Basic L2 ports.',11)],
    '2950T-24':[('fastethernet',24,'FastEthernet0/1-24',1,0,0,'Access ports.',11),('gigabitethernet',2,'GigabitEthernet0/1-2',1,0,0,'Uplink ports.',11)],
    '2960-24TT':[('fastethernet',24,'FastEthernet0/1-24',1,0,0,'Access ports.',11),('gigabitethernet',2,'GigabitEthernet0/1-2',1,0,0,'Copper uplinks in PT/2960-24TT.',5)],
    '3560-24PS':[('fastethernet',24,'FastEthernet0/1-24',1,1,1,'PT exposes these as switchports; multilayer routing available.',11),('gigabitethernet',2,'GigabitEthernet0/1-2',1,1,0,'Packet Tracer live-probe representation; differs from physical SFP-only uplinks on some real 3560-24PS documentation.',11)],
    '3650-24PS':[('gigabitethernet',24,'GigabitEthernet1/0/1-24',1,1,1,'Fixed copper access ports in PT observations.',22),('gigabitethernet',4,'GigabitEthernet1/1/1-4',1,1,0,'Uplink positions observed in PT 7.2; may support copper/fiber depending PT representation.',22)],
    'IE-2000':[('fastethernet',8,'FastEthernet0/1-8',1,0,0,'Community Packet Tracer inventory.',11),('gigabitethernet',2,'GigabitEthernet0/1-2',1,0,0,'Community Packet Tracer inventory.',11)],
    'IE-3400':[('gigabitethernet',10,'GigabitEthernet',1,1,1,'PT 9 release reference: ten Gigabit Ethernet ports.',12)],
    'Switch-PT':[('fastethernet',8,'FastEthernet0/0-7',1,0,0,'Generic switch default in community PT inventory.',11)],
    'Switch-PT-Empty':[],
    'ASA5505':[('fastethernet',8,'Ethernet0/0-7',1,0,1,'Eight Fast Ethernet switchports; two ports support PoE on physical platform.',13)],
    'ASA5506-X':[('gigabitethernet',8,'GigabitEthernet1/1-8',0,1,0,'Eight 10/100/1000 data ports.',14),('management_ge',1,'Management1/1',0,0,0,'Dedicated management interface.',14)],
    'MX65W':[('gigabitethernet',5,'Ethernet ports',1,1,0,'Port count retained as partial; verify PT Physical tab for exact representation.',8),('wireless',1,'Wireless radio',0,0,0,'Integrated wireless capability.',8)],
    'ISA3000':[('gigabitethernet',2,'Copper GE',0,1,0,'Two 10/100/1000Base-T ports.',12),('gigabit_sfp',2,'SFP GE',0,1,0,'Two 1GbE SFP ports.',12),('management_ge',1,'Management',0,0,0,'Management port.',12)],
    'AccessPoint-PT':[('fastethernet',1,'Port0',1,0,0,'Generic wired uplink; PT representation can vary.',11),('wireless',1,'Radio',0,0,0,'Wireless radio.',11)],
    'LAP-PT':[('fastethernet',1,'Port0',1,0,1,'Lightweight AP uplink; PoE behavior depends PT model.',7),('wireless',1,'Radio',0,0,0,'Controller-managed radio.',7)],
    '3702i':[('gigabitethernet',1,'GigabitEthernet0',1,0,1,'Enterprise AP uplink with PoE support.',7),('wireless',2,'2.4/5 GHz radios',0,0,0,'Dual-band enterprise AP representation.',7)],
    'WLC-2504':[('gigabitethernet',4,'Traffic ports',1,0,0,'PT-specific reference states four Gigabit traffic interfaces.',7),('management_ge',1,'Management',0,0,0,'Management interface.',7)],
    'WLC-3504':[('gigabitethernet',5,'GE/mGig interfaces',1,0,0,'Four GE plus one mGig limited to 1G in PT reference.',7)],
    'HomeRouter':[('fastethernet',5,'Internet + LAN1-4',1,1,0,'Typical WRT-style PT home router representation; verify current PT model.',7),('wireless',2,'2.4/5 GHz radios',0,0,0,'PT reference describes 2.4G and 5G wireless modes.',7)],
    'Cloud-PT':[('serial',4,'Serial0-3',0,0,0,'PT live-probe ports.',11),('modem',2,'Modem4-5',0,0,0,'PT live-probe ports.',11),('ethernet10',1,'Ethernet6',1,0,0,'PT live-probe port.',11),('coaxial',1,'Coaxial7',0,0,0,'PT live-probe port.',11)],
}

DEVICE_SLOTS = {
    '1841':[('wic_hwic',2,'HWIC/WIC slots','Two modular WAN interface slots.',10)],
    '2811':[('wic_hwic',4,'HWIC/WIC slots','Four integrated HWIC slots.',6),('nm',1,'Enhanced network module slot','Network module expansion.',6)],
    '1941':[('ehwic',2,'EHWIC slots','Two enhanced HWIC slots.',2)],
    '2901':[('ehwic',4,'EHWIC slots','Four enhanced high-speed WAN interface card slots.',3)],
    '2911':[('ehwic',4,'EHWIC slots','Four enhanced high-speed WAN interface card slots.',3),('nm',1,'Service module slot','Service module expansion.',3)],
    'ISR4321':[('nim',2,'NIM slots','Two NIM slots described by official product/lifecycle material.',16)],
    'ISR4331':[('nim',2,'NIM slots','Two NIM slots.',16),('nm',1,'Service module slot','One service module slot.',16)],
    'C8200':[('nim',1,'NIM slot','C8200-1N-4T family naming indicates one NIM slot; verify PT representation.',12)],
    'IR1101':[('pim',2,'Cellular module slots','Installed PT 9.0.1 help documents two 4G LTE/5G module slots.',PT9_ROUTER_HELP_SOURCE)],
    'IR8340':[('nim',2,'NIM slots','Installed PT 9.0.1 help documents two NIM slots.',PT9_ROUTER_HELP_SOURCE),('pim',2,'PIM slots','Installed PT 9.0.1 help documents two PIM slots.',PT9_ROUTER_HELP_SOURCE)],
    'Router-PT':[('generic',4,'Generic slots','Packet Tracer generic modular chassis.',10)],
    'Switch-PT-Empty':[('generic',10,'Generic switch slots','Empty modular PT switch chassis.',11)],
}

MODULES = [
    ('HWIC-2T','Serial WAN interface card','Two-port serial High-Speed WAN Interface Card.',1,1,'Common Packet Tracer serial expansion.',9),
    ('HWIC-4ESW','EtherSwitch interface card','Four Ethernet switching ports; ports operate as switchports and typically use an SVI for L3 addressing.',1,1,'Useful for adding switched Ethernet to compatible ISR routers.',9),
    ('WIC-1T','Serial WAN interface card','Single-port serial WIC.',1,1,'Legacy serial expansion.',9),
    ('WIC-2T','Serial WAN interface card','Two-port asynchronous/synchronous serial WIC.',1,1,'Legacy serial expansion.',9),
    ('WIC-1ENET','Ethernet WIC','Single-port 10 Mbps Ethernet interface card.',1,1,'Legacy Ethernet expansion.',9),
    ('HWIC-1GE-SFP','Gigabit/SFP interface card','Single Gigabit/SFP interface card in PT compatibility references.',1,1,'Availability in GUI can vary.',10),
    ('NIM-2T','Serial NIM','Two-port serial Network Interface Module.',1,1,'Modern ISR serial expansion.',15),
    ('NM-1FE-TX','FastEthernet network module','One FastEthernet copper network module.',1,1,'Useful with modular legacy routers such as 2811.',9),
    ('GLC-T','Copper SFP transceiver','1000BASE-T copper SFP transceiver.',1,1,'SFP transceiver rather than WAN card.',9),
    ('GLC-LH-SMD','Fiber SFP transceiver','1000BASE-LX/LH SFP transceiver for fiber.',1,1,'Fiber SFP transceiver.',9),
    ('P-LTEA18-GL','Cellular PIM','3G/4G/LTE pluggable interface module for PT 9 industrial routers.',1,1,'PT 9 industrial cellular module.',12),
    ('P-5GS6-GL','5G Cellular PIM','5G pluggable interface module for PT 9 industrial routers.',1,1,'PT 9 industrial 5G module.',12),
]

MODULE_INTERFACES = {
    'HWIC-2T':[('serial',2,'Serial0/x/0-1',None,'Two serial WAN ports.')],
    'HWIC-4ESW':[('fastethernet',4,'FastEthernet0/x/0-3',100,'Four Layer-2 EtherSwitch ports.')],
    'WIC-1T':[('serial',1,'Serial0/x/0',None,'One serial port.')],
    'WIC-2T':[('serial',2,'Serial0/x/0-1',None,'Two serial ports.')],
    'WIC-1ENET':[('ethernet10',1,'Ethernet',10,'One 10 Mbps Ethernet port.')],
    'HWIC-1GE-SFP':[('gigabit_sfp',1,'GigabitEthernet/SFP',1000,'One GE SFP position.')],
    'NIM-2T':[('serial',2,'Serial0/x/0-1',None,'Two high-speed serial ports.')],
    'NM-1FE-TX':[('fastethernet',1,'FastEthernet1/0',100,'One FastEthernet copper port.')],
    'GLC-T':[('gigabitethernet',1,'SFP transceiver',1000,'1000BASE-T via SFP slot.')],
    'GLC-LH-SMD':[('gigabit_sfp',1,'SFP transceiver',1000,'1000BASE-LX/LH fiber.')],
    'P-LTEA18-GL':[('cellular',1,'Cellular',None,'LTE cellular interface.')],
    'P-5GS6-GL':[('cellular',1,'Cellular',None,'5G cellular interface.')],
}

# device, module, version_id/null, compatible, slot_type, max_qty, notes, verification, source
MODULE_COMPAT = [
    ('1841','HWIC-2T',2,1,'wic_hwic',2,'Supported in PT; common serial expansion.','Verified',10),
    ('1841','HWIC-4ESW',2,1,'wic_hwic',2,'Four added switchports; use VLAN/SVI rather than treating each as routed port.','Verified',24),
    ('1841','WIC-1T',2,1,'wic_hwic',2,'Legacy serial WIC.','Partial',10),
    ('1841','WIC-2T',2,1,'wic_hwic',2,'Legacy serial WIC.','Partial',10),
    ('1841','WIC-1ENET',2,1,'wic_hwic',2,'10 Mbps Ethernet WIC in compatibility list.','Partial',10),
    ('1841','HWIC-1GE-SFP',2,1,'wic_hwic',2,'API-derived compatibility; GUI availability can vary.','Partial',10),
    ('2811','HWIC-2T',2,1,'wic_hwic',4,'Serial expansion.','Partial',10),
    ('2811','HWIC-4ESW',2,1,'wic_hwic',4,'EtherSwitch expansion.','Partial',10),
    ('2811','NM-1FE-TX',2,1,'nm',1,'Adds a routed FastEthernet port.','Partial',24),
    ('1941','HWIC-2T',2,1,'ehwic',2,'Serial expansion in PT compatibility references.','Partial',10),
    ('1941','HWIC-4ESW',2,1,'ehwic',2,'EtherSwitch expansion in PT compatibility references.','Partial',10),
    ('1941','NIM-2T',3,1,'ehwic',1,'API-derived PT compatibility can differ from physical slot naming; verify PT Physical tab.','Partial',10),
    ('2901','HWIC-2T',2,1,'ehwic',4,'Serial expansion.','Partial',10),
    ('2901','NIM-2T',3,1,'ehwic',2,'PT/API compatibility; verify current PT version.','Partial',10),
    ('2911','HWIC-2T',2,1,'ehwic',4,'Serial expansion.','Partial',10),
    ('2911','NIM-2T',3,1,'ehwic',2,'PT/API compatibility; verify current PT version.','Partial',10),
    ('ISR4321','NIM-2T',3,1,'nim',2,'Official 4000-series NIM-2T support plus PT router presence.','Partial',15),
    ('ISR4331','NIM-2T',3,1,'nim',2,'Official 4000-series NIM-2T support plus PT router presence.','Partial',15),
    ('IR1101','P-LTEA18-GL',3,1,'pim',1,'PT 9 release reference.','Partial',12),
    ('IR1101','P-5GS6-GL',3,1,'pim',1,'PT 9 release reference.','Partial',12),
    ('IR8340','P-LTEA18-GL',3,1,'pim',2,'PT 9 release reference.','Partial',12),
    ('IR8340','P-5GS6-GL',3,1,'pim',2,'PT 9 release reference.','Partial',12),
]

# Device feature helpers. Anything not listed remains unknown, not implicitly unsupported.
SWITCH_L2 = ['vlan','dot1q_trunk','stp','rstp','etherchannel','lacp','pagp','port_security','voice_vlan','svi']
SWITCH_L3_EXTRA = ['routed_ports','inter_vlan','static_routing','default_route','ospf','eigrp','ipv6_routing','hsrp']
ROUTER_BASE = ['static_routing','default_route','rip','ospf','eigrp','nat','pat','acl_standard','acl_extended','dhcp_server','dhcp_relay','ppp','hdlc']

FEATURE_SUPPORT = {}

def fset(device, features, mode='configuration_required', source=6, verify='Partial', notes=None, version=3):
    FEATURE_SUPPORT.setdefault(device, [])
    for feat in features:
        FEATURE_SUPPORT[device].append((feat, version, mode, 1 if 'configuration' in mode else 0, None, notes, verify, source))

def fspecial(device, feat, mode, source, verify='Partial', notes=None, version=3, req_module=None):
    FEATURE_SUPPORT.setdefault(device, []).append((feat, version, mode, 1 if 'configuration' in mode else 0, req_module, notes, verify, source))

for r in ['1841','2811','1941','2901','2911','ISR4321','ISR4331','Router-PT']:
    fset(r, ROUTER_BASE, 'configuration_required', 6, 'Partial', 'Command availability depends on the IOS image simulated by the selected Packet Tracer device/version.')
    fset(r, ['ipv6_routing','ospfv3'], 'configuration_required', 6, 'Partial', 'Newer IOS images generally expose IPv6 features; verify selected PT image.')
    fspecial(r,'serial_wan','module_required',10,'Partial','Requires a compatible serial WIC/HWIC/NIM in typical PT configurations.',3,'HWIC-2T' if r not in ('ISR4321','ISR4331') else 'NIM-2T')

for r in ['819','829','CGR1240']:
    fset(r, ['static_routing','default_route','ospf','eigrp','nat','pat','acl_standard','acl_extended','dhcp_server','ipv6_routing','cellular_3g4g'], 'configuration_required', 6, 'Partial')
for r in ['IR1101','IR8340']:
    fset(r, ['static_routing','default_route','ospf','nat','pat','acl_standard','acl_extended','ipv6_routing','industrial_ot'], 'configuration_required', 12, 'Partial')
    fspecial(r,'cellular_3g4g','module_required',12,'Partial','Requires LTE PIM.',3,'P-LTEA18-GL')
    fspecial(r,'cellular_5g','module_required',12,'Partial','Requires 5G PIM.',3,'P-5GS6-GL')
fset('C8200',['static_routing','default_route','ospf','eigrp','bgp','nat','pat','acl_standard','acl_extended','vpn','ipv6_routing'],'configuration_required',12,'Partial')

for s in ['2950-24','2950T-24','2960-24TT','Switch-PT']:
    fset(s, SWITCH_L2, 'configuration_required', 1 if s=='2960-24TT' else 11, 'Partial')
    fspecial(s,'inter_vlan','unsupported',1,'Verified','Layer 2 access switch; SVI is for management, not normal inter-VLAN routing.')
for s in ['3560-24PS','3650-24PS']:
    fset(s, SWITCH_L2 + SWITCH_L3_EXTRA, 'configuration_required', 1, 'Verified' if s=='3650-24PS' else 'Partial')
    fspecial(s,'poe','native',4 if s=='3560-24PS' else 1,'Partial','PoE model designation; Packet Tracer power behavior is simulated.')
    fset(s,['span','lldp'],'configuration_required',1,'Partial')
fset('IE-2000',['vlan','dot1q_trunk','stp','rstp','etherchannel','lldp','rep','span','industrial_ot'],'configuration_required',12,'Partial')
fset('IE-3400',['vlan','dot1q_trunk','stp','rstp','etherchannel','lacp','svi','routed_ports','inter_vlan','static_routing','ospf','hsrp','lldp','rep','industrial_ot','ptp'],'configuration_required',12,'Partial')

# Security
fset('ASA5505',['nat','pat','acl_standard','acl_extended','stateful_firewall','vpn','vlan','svi','dhcp_server','static_routing','default_route'],'configuration_required',13,'Verified')
fspecial('ASA5505','poe','native',13,'Verified','Two physical ports provide PoE on the real ASA 5505 platform.')
fset('ASA5506-X',['nat','pat','acl_standard','acl_extended','stateful_firewall','vpn','dhcp_server','static_routing','default_route'],'configuration_required',8,'Verified')
fspecial('ASA5506-X','firepower','unsupported',8,'Verified','Packet Tracer emulates ASA software but not FirePOWER services.')
fset('MX65W',['vlan','dhcp_server','wireless_ap','wpa2','stateful_firewall','pppoe','web_gui'],'configuration_required',8,'Verified')
fset('ISA3000',['stateful_firewall','acl_extended','nat','industrial_ot','static_routing'],'configuration_required',12,'Partial')

# Wireless
fset('AccessPoint-PT',['wireless_ap','wpa2'],'configuration_required',7,'Partial')
fset('LAP-PT',['wireless_ap','capwap','wpa2'],'configuration_required',7,'Partial')
fset('3702i',['wireless_ap','capwap','wpa2','poe'],'configuration_required',7,'Verified')
fset('WLC-2504',['wireless_controller','capwap','vlan','wpa2','dhcp_server','dhcp_proxy','web_gui'],'configuration_required',7,'Verified')
fset('WLC-3504',['wireless_controller','capwap','vlan','wpa2','dhcp_server','dhcp_proxy','web_gui'],'configuration_required',7,'Verified')
fset('HomeRouter',['wireless_ap','wpa2','dhcp_server','nat','pat','web_gui'],'configuration_required',7,'Partial')

# Cloud
fset('Cloud-PT',['serial_wan','frame_relay'],'configuration_required',11,'Partial')

DEVICE_ROLES = {
    '1841':['wan_router','isp_router','internet_gateway'], '2811':['wan_router','internet_gateway'],
    '1941':['wan_router','internet_gateway'], '2901':['wan_router','internet_gateway'], '2911':['wan_router','internet_gateway'],
    'ISR4321':['wan_router','internet_gateway'], 'ISR4331':['wan_router','internet_gateway'], 'C8200':['wan_router','internet_gateway'],
    '819':['industrial_router','wan_router'], '829':['industrial_router','wan_router'], 'CGR1240':['industrial_router','wan_router'],
    'IR1101':['industrial_router','wan_router'], 'IR8340':['industrial_router','wan_router'], 'Router-PT':['wan_router','isp_router'],
    '2950-24':['access_switch'], '2950T-24':['access_switch'], '2960-24TT':['access_switch'],
    '3560-24PS':['distribution_switch','core_switch','multilayer_gateway'], '3650-24PS':['distribution_switch','core_switch','multilayer_gateway'],
    'IE-2000':['industrial_switch','access_switch'], 'IE-3400':['industrial_switch','distribution_switch','multilayer_gateway'],
    'Switch-PT':['access_switch'], 'Switch-PT-Empty':['access_switch'],
    'ASA5505':['firewall','internet_gateway'], 'ASA5506-X':['firewall','internet_gateway'], 'MX65W':['firewall','wireless_router'], 'ISA3000':['industrial_firewall','firewall'],
    'AccessPoint-PT':['wireless_ap'], 'LAP-PT':['wireless_ap'], '3702i':['wireless_ap'],
    'WLC-2504':['wireless_controller'], 'WLC-3504':['wireless_controller'], 'HomeRouter':['wireless_router','internet_gateway'],
    'Cloud-PT':['wan_emulation'],
}

LIMITATIONS = [
    ('3560-24PS',2,'Packet Tracer port representation differs from some physical 3560-24PS documentation','Community live-probe references show 24 FastEthernet + 2 GigabitEthernet interfaces in Packet Tracer, while Cisco physical 3560-24PS documentation describes 24 10/100 PoE ports plus two SFP module slots. Requirements Finder uses the Packet Tracer representation.','warning',11),
    ('3650-24PS',1,'Version-dependent port representation','A PT 7.2 observation reports 28 GigabitEthernet ports (24 fixed + 4 uplink positions). Verify the Physical tab if your PT version differs.','warning',22),
    ('ASA5506-X',3,'FirePOWER is not emulated','Packet Tracer emulates ASA 5506-X software/security functions but does not emulate FirePOWER services.','warning',8),
    ('1841',2,'HWIC-4ESW ports are switchports','HWIC-4ESW adds Layer-2 EtherSwitch ports. Use VLANs/SVIs rather than assigning routed IP addresses directly to each module switchport.','info',24),
    ('1841',2,'Serial is not built in','Add a compatible serial WIC/HWIC such as HWIC-2T before using Serial DCE/DTE links.','info',24),
    ('WLC-3504',3,'Multigigabit interface limited in Packet Tracer reference','The PT-specific reference states the multigigabit interface is limited to 1 Gb/s in the simulation.','info',7),
    ('WLC-2504',3,'Wireless feature subset','Mobility management and rogue AP detection are not supported in the cited Packet Tracer reference.','info',7),
]

CISCO_PRODUCTS = [
    ('1841','Cisco 1841 Modular Router','CISCO1841','Cisco 1800 Series','Historical / legacy',None,None,'https://www.cisco.com/c/en/us/products/routers/1841-integrated-services-router-isr/index.html'),
    ('2960-24TT','Catalyst 2960 24 10/100 + 2 1000BT LAN Base Image','WS-C2960-24TT-L','Catalyst 2960','Historical / legacy',None,None,'https://www.cisco.com/c/en/us/products/switches/catalyst-2960-series-switches/index.html'),
    ('3560-24PS','Catalyst 3560 24 10/100 PoE + 2 SFP IP Base Image','WS-C3560-24PS-S','Catalyst 3560','Historical / legacy',None,None,'https://www.cisco.com/c/en/us/products/switches/catalyst-3560-series-switches/index.html'),
    ('2911','Cisco ONE - ISR 2911','C1-CISCO2911/K9','Cisco 2900 Series','Historical / legacy',None,None,'https://www.cisco.com/c/en/us/products/routers/2911-integrated-services-router-isr/index.html'),
    ('ASA5506-X','Cisco ASA 5506-X Adaptive Security Appliance','ASA5506-K9','ASA 5500-X','Historical / legacy',None,None,'https://www.cisco.com/c/en/us/products/security/asa-5506-x-firepower-services/index.html'),
    ('WLC-2504','2504 Wireless Controller with 5 AP Licenses','AIR-CT2504-5-K9','Cisco 2500 Wireless Controller','End of sale / historical','2018-04-30',None,'https://www.cisco.com/c/en/us/products/wireless/2500-series-wireless-controllers/index.html'),
    ('ISR4321','Cisco ISR 4321 (2GE,2NIM,4G FLASH,4G DRAM,IPB)','ISR4321/K9','Cisco ISR 4000','End-of-sale announced',None,None,'https://www.cisco.com/c/en/us/products/routers/4321-integrated-services-router-isr/index.html'),
    ('ISR4331','Cisco ISR 4331 (3GE,2NIM,1SM)','ISR4331/K9','Cisco ISR 4000','End-of-sale announced',None,None,'https://www.cisco.com/c/en/us/products/routers/4331-integrated-services-router-isr/index.html'),
]

ALIASES = {
    '1841':['CISCO1841','ISR 1841'], '2811':['ISR 2811'], '1941':['ISR 1941'], '2901':['ISR 2901'], '2911':['ISR 2911'],
    'ISR4321':['4321','ISR 4321'], 'ISR4331':['4331','ISR 4331'], '2960-24TT':['2960','Catalyst 2960'],
    '3560-24PS':['3560','Multilayer Switch 3560'], '3650-24PS':['3650','Multilayer Switch 3650'],
    'ASA5506-X':['ASA 5506','5506-X'], 'WLC-2504':['2504','WLC 2504'], 'WLC-3504':['3504','WLC 3504'],
    'Cloud-PT':['Cloud','WAN Cloud'], 'AccessPoint-PT':['AP-PT','Access Point'], 'LAP-PT':['Lightweight AP'],
    'C8200':['PT8200'],
}


def load_version_evidence(path: Path | None = None):
    path = path or VERSION_EVIDENCE
    evidence = json.loads(path.read_text(encoding='utf-8'))
    source_records = evidence.get('sources', [])
    source_by_key = {}
    for source in source_records:
        key = source['key']
        if key in source_by_key or not source.get('url'):
            raise ValueError(f'Invalid or duplicate version-evidence source: {key!r}')
        source_by_key[key] = source

    expected_devices = {device[0] for device in DEVICES}
    records = {}
    for device in evidence.get('devices', []):
        pt = device['pt_name']
        if pt not in expected_devices or pt in records:
            raise ValueError(f'Unexpected or duplicate version-evidence device: {pt!r}')
        versions = device['versions']
        if set(versions) != {'6', '7', '8', '9'}:
            raise ValueError(f'{pt}: version evidence must cover families 6, 7, 8 and 9')
        for major, record in versions.items():
            label = f'{pt} / PT {major}'
            available = record['available']
            status = record['verification_status']
            kind = record['evidence_kind']
            source_key = record['source_key']
            if available is not None and type(available) is not bool:
                raise ValueError(f'{label}: availability must be true, false or null')
            if status not in {'Verified', 'Partial', 'Unknown'}:
                raise ValueError(f'{label}: invalid verification status {status!r}')
            if kind not in {'documentation', 'observation', 'inference', 'unverified'}:
                raise ValueError(f'{label}: invalid evidence kind {kind!r}')
            if source_key is not None and source_key not in source_by_key:
                raise ValueError(f'{label}: unknown evidence source {source_key!r}')
            if available is None and status != 'Unknown':
                raise ValueError(f'{label}: unknown availability must be marked Unknown')
            if available is not None and (source_key is None or status == 'Unknown' or kind == 'unverified'):
                raise ValueError(f'{label}: known availability requires attributable evidence')
            if kind == 'inference' and status == 'Verified':
                raise ValueError(f'{label}: inferred availability cannot be marked Verified')
            if 'observed_release' not in record or 'notes' not in record:
                raise ValueError(f'{label}: missing release or evidence notes')
        records[pt] = versions
    if set(records) != expected_devices:
        raise ValueError(f'Missing version-evidence devices: {sorted(expected_devices - set(records))}')

    # Source IDs are deterministic and existing URLs retain their original identity.
    source_id_by_url = {source[3]: source[0] for source in SOURCES}
    added_sources = []
    new_urls = sorted({source['url'] for source in source_records} - set(source_id_by_url))
    for source_id, url in enumerate(new_urls, start=26):
        source = min((s for s in source_records if s['url'] == url), key=lambda s: s['key'])
        added_sources.append((source_id, source['publisher'], source['title'], url,
                              source['source_type'], source.get('publication_date'), TODAY,
                              source['source_tier'], source.get('notes')))
        source_id_by_url[url] = source_id
    source_ids = {key: source_id_by_url[source['url']] for key, source in source_by_key.items()}
    return added_sources, source_ids, records


def main() -> None:
    added_sources, evidence_source_ids, availability_records = load_version_evidence()
    if PT9_ROUTER_HELP_SOURCE not in evidence_source_ids:
        raise ValueError(f'Missing technical evidence source: {PT9_ROUTER_HELP_SOURCE}')
    DB.parent.mkdir(parents=True, exist_ok=True)
    if DB.exists():
        DB.unlink()
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    cur = con.cursor()

    cur.executemany('INSERT INTO device_categories VALUES (?,?,?,?)', CATEGORIES)
    cur.executemany('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?)', SOURCES)
    cur.executemany('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?)', added_sources)
    cur.executemany('INSERT INTO packet_tracer_versions VALUES (?,?,?,?,?,?)', VERSIONS)
    cur.executemany('INSERT INTO interface_types VALUES (?,?,?,?,?,?,?,?,?)', INTERFACE_TYPES)
    cur.executemany('INSERT INTO slot_types VALUES (?,?,?,?)', SLOT_TYPES)
    cur.executemany('INSERT INTO feature_categories VALUES (?,?,?,?)', FEATURE_CATEGORIES)
    cur.executemany('INSERT INTO features VALUES (?,?,?,?,?)', FEATURES)
    cur.executemany('INSERT INTO roles VALUES (?,?,?,?)', ROLES)
    cur.executemany('INSERT INTO cable_types VALUES (?,?,?,?,?,?,?,?,?)', CABLES)

    category_id = {r[1]: r[0] for r in CATEGORIES}
    for i,d in enumerate(DEVICES, start=1):
        pt,display,model,family,cat,layer,generic,modular,desc,use,verify = d
        cur.execute('''INSERT INTO devices(device_id,pt_name,display_name,model,family,category_id,layer_capability,manufacturer,is_generic,is_modular,description,typical_use,verification_status,last_verified)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                    (i,pt,display,model,family,cat,layer,'Packet Tracer Generic' if generic else 'Cisco',generic,modular,desc,use,verify,TODAY))
    device_id = {r[1]: r[0] for r in cur.execute('SELECT device_id, pt_name FROM devices')}

    for pt, aliases in ALIASES.items():
        for a in aliases:
            cur.execute('INSERT INTO device_aliases(device_id,alias) VALUES (?,?)',(device_id[pt],a))

    family_ids = {version[4]: version[0] for version in VERSIONS if version[5]}
    for pt, records in availability_records.items():
        for major in (6, 7, 8, 9):
            record = records[str(major)]
            cur.execute('''INSERT INTO device_version_support(device_id,version_id,available,palette_path,support_notes,verification_status,source_id,observed_release,evidence_kind,checked_date)
                           VALUES (?,?,?,?,?,?,?,?,?,?)''',
                        (device_id[pt], family_ids[major], record['available'], 'Network Devices',
                         record['notes'], record['verification_status'], evidence_source_ids.get(record['source_key']),
                         record['observed_release'], record['evidence_kind'], record.get('checked_date') or TODAY))
    # Explicit older version observations.
    cur.execute('INSERT INTO device_version_support(device_id,version_id,available,palette_path,support_notes,verification_status,source_id,observed_release,evidence_kind,checked_date) VALUES (?,?,?,?,?,?,?,?,?,?)',
                (device_id['3650-24PS'],1,1,'Network Devices > Switches','PT 7.2 observation reports 28 Gigabit interfaces.','Partial',22,'7.2','observation',TODAY))

    itype = {r[1]: r[0] for r in INTERFACE_TYPES}
    interface_versions = {6: 3, 7: 3, 8: 3, 11: 2, 12: 3, 22: 1, PT9_ROUTER_HELP_SOURCE: 3}
    for pt, items in DEVICE_INTERFACES.items():
        for typ,qty,pattern,sw,routed,poe,notes,src in items:
            cur.execute('''INSERT INTO device_interfaces(device_id,interface_type_id,quantity,name_pattern,built_in,switchport_capable,routed_port_capable,poe_capable,notes,source_id,version_id,verification_status)
                           VALUES (?,?,?,?,1,?,?,?,?,?,?,?)''',
                        (device_id[pt],itype[typ],qty,pattern,sw,routed,poe,notes,evidence_source_ids.get(src,src),interface_versions.get(src),'Partial'))

    slot_type = {r[1]: r[0] for r in SLOT_TYPES}
    for pt, items in DEVICE_SLOTS.items():
        for slug,qty,name,notes,src in items:
            cur.execute('INSERT INTO device_slots(device_id,slot_type_id,quantity,slot_name,notes,source_id) VALUES (?,?,?,?,?,?)',
                        (device_id[pt],slot_type[slug],qty,name,notes,evidence_source_ids.get(src,src)))

    for i,m in enumerate(MODULES,start=1):
        model,mtype,desc,slots,avail,notes,src=m
        cur.execute('INSERT INTO modules(module_id,model,module_type,description,slots_required,pt_available,notes,source_id) VALUES (?,?,?,?,?,?,?,?)',(i,model,mtype,desc,slots,avail,notes,src))
    module_id={r[1]:r[0] for r in cur.execute('SELECT module_id,model FROM modules')}
    for model, items in MODULE_INTERFACES.items():
        for typ,qty,pattern,speed,notes in items:
            cur.execute('INSERT INTO module_interfaces(module_id,interface_type_id,quantity,name_pattern,speed_mbps,notes) VALUES (?,?,?,?,?,?)',
                        (module_id[model],itype[typ],qty,pattern,speed,notes))
    for pt,mod,ver,compat,slot,maxq,notes,verify,src in MODULE_COMPAT:
        cur.execute('''INSERT INTO module_compatibility(device_id,module_id,version_id,compatible,slot_type_id,max_quantity,notes,verification_status,source_id)
                       VALUES (?,?,?,?,?,?,?,?,?)''',(device_id[pt],module_id[mod],ver,compat,slot_type[slot],maxq,notes,verify,src))

    feature_id={r[2]:r[0] for r in FEATURES}
    for pt, rows in FEATURE_SUPPORT.items():
        for feat,ver,mode,config,reqmod,notes,verify,src in rows:
            cur.execute('''INSERT OR REPLACE INTO device_feature_support(device_id,feature_id,version_id,support_mode,configuration_required,required_module_id,notes,verification_status,source_id)
                           VALUES (?,?,?,?,?,?,?,?,?)''', (device_id[pt],feature_id[feat],ver,mode,config,module_id.get(reqmod) if reqmod else None,notes,verify,src))

    role_id={r[1]:r[0] for r in ROLES}
    for pt, rs in DEVICE_ROLES.items():
        for role in rs:
            cur.execute('INSERT INTO device_roles(device_id,role_id,suitability,notes) VALUES (?,?,?,?)',(device_id[pt],role_id[role],'good',None))

    cable_id={r[1]:r[0] for r in CABLES}
    # Category-aware conventional cabling rules.
    # router-switch, firewall-switch, AP-switch => straight; switch-switch/router-router => crossover; serial => DCE/DTE; fiber => fiber.
    for a,b,cable,note in [
        ('router','switch_l2','copper_straight','Conventional copper Ethernet connection; auto-MDIX may allow either cable on capable interfaces.'),
        ('router','switch_l3','copper_straight','Conventional router-to-switch copper Ethernet connection.'),
        ('switch_l2','switch_l2','copper_crossover','Conventional switch-to-switch copper Ethernet connection; auto-MDIX may allow straight-through.'),
        ('switch_l2','switch_l3','copper_crossover','Conventional switch-to-switch copper Ethernet connection; common for trunks/uplinks.'),
        ('switch_l3','switch_l3','copper_crossover','Conventional switch-to-switch copper Ethernet connection; suitable for EtherChannel member links.'),
        ('router','router','copper_crossover','Conventional direct Ethernet router-to-router connection.'),
        ('security','switch_l2','copper_straight','Conventional firewall/security appliance to switch connection.'),
        ('security','switch_l3','copper_straight','Conventional firewall/security appliance to switch connection.'),
        ('wireless_ap','switch_l2','copper_straight','AP uplink to access switch; PoE may power supported AP models.'),
        ('wireless_ap','switch_l3','copper_straight','AP uplink to switch; PoE may power supported AP models.'),
        ('wireless_controller','switch_l2','copper_straight','WLC Ethernet uplink to switch.'),
        ('wireless_controller','switch_l3','copper_straight','WLC Ethernet uplink to switch.'),
    ]:
        cur.execute('INSERT INTO connection_rules(category_a_id,category_b_id,cable_type_id,recommended,auto_mdix_alternative,notes) VALUES (?,?,?,?,?,?)',
                    (category_id[a],category_id[b],cable_id[cable],1,'Automatic connection or alternate copper cable may work when Auto-MDIX is simulated.',note))
    cur.execute('INSERT INTO connection_rules(interface_type_a_id,interface_type_b_id,cable_type_id,recommended,notes) VALUES (?,?,?,?,?)',(itype['serial'],itype['serial'],cable_id['serial_dce'],1,'Use a Serial DCE/DTE pair; configure clock rate on the DCE end where required.'))
    cur.execute('INSERT INTO connection_rules(interface_type_a_id,interface_type_b_id,cable_type_id,recommended,notes) VALUES (?,?,?,?,?)',(itype['gigabit_sfp'],itype['gigabit_sfp'],cable_id['fiber'],1,'Use compatible fiber/transceivers at both ends.'))

    for pt, title,desc,severity,src in [(x[0],x[2],x[3],x[4],x[5]) for x in LIMITATIONS]:
        ver = next(x[1] for x in LIMITATIONS if x[0]==pt and x[2]==title)
        cur.execute('INSERT INTO limitations(device_id,version_id,title,description,severity,source_id) VALUES (?,?,?,?,?,?)',(device_id[pt],ver,title,desc,severity,src))

    for i,p in enumerate(CISCO_PRODUCTS,start=1):
        pt,name,sku,family,status,eos,eosup,url=p
        cur.execute('INSERT INTO cisco_products(cisco_product_id,device_id,official_product_name,sku,product_family,lifecycle_status,end_of_sale_date,end_of_support_date,official_url) VALUES (?,?,?,?,?,?,?,?,?)',
                    (i,device_id[pt],name,sku,family,status,eos,eosup,url))

    # Metadata
    meta = {
        'schema_version':'3.0.0',
        'catalogue_version':'0.3.0',
        'generated_at':TODAY,
        'packet_tracer_versions_covered':'6.x, 7.x, 8.x, 9.x (explicit availability evidence; version-specific technical coverage varies)',
        'scope':'Cisco Packet Tracer Network Devices only',
        'data_policy':'Packet Tracer behavior takes precedence over real-hardware behavior for matching. Unknown/partial fields are not treated as supported.',
    }
    cur.executemany('INSERT INTO metadata(key,value) VALUES (?,?)',meta.items())

    # FTS materialization
    for did,pt,display,model,desc,use in cur.execute('SELECT device_id,pt_name,display_name,model,description,typical_use FROM devices').fetchall():
        aliases=' '.join(r[0] for r in cur.execute('SELECT alias FROM device_aliases WHERE device_id=?',(did,)).fetchall())
        roles=' '.join(r[0] for r in cur.execute('SELECT roles.name FROM device_roles JOIN roles USING(role_id) WHERE device_id=?',(did,)).fetchall())
        feats=' '.join(r[0] for r in cur.execute('SELECT features.name FROM device_feature_support JOIN features USING(feature_id) WHERE device_id=? AND support_mode != "unsupported"',(did,)).fetchall())
        ifaces=' '.join(r[0] for r in cur.execute('SELECT interface_types.name FROM device_interfaces JOIN interface_types USING(interface_type_id) WHERE device_id=?',(did,)).fetchall())
        mods=' '.join(r[0] for r in cur.execute('SELECT modules.model FROM module_compatibility JOIN modules USING(module_id) WHERE device_id=? AND compatible=1',(did,)).fetchall())
        cur.execute('INSERT INTO device_search_fts(device_id,display_name,model,aliases,description,typical_use,roles,features,interfaces,modules) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    (did,display,model,aliases,desc,use,roles,feats,ifaces,mods))

    con.commit()
    # Validate FK and integrity immediately.
    fk = con.execute('PRAGMA foreign_key_check').fetchall()
    integrity = con.execute('PRAGMA integrity_check').fetchone()[0]
    if fk or integrity != 'ok':
        raise SystemExit(f'Database validation failed: foreign_keys={fk}, integrity={integrity}')
    print(f'Created {DB}')
    print('Devices:', con.execute('SELECT COUNT(*) FROM devices').fetchone()[0])
    print('Modules:', con.execute('SELECT COUNT(*) FROM modules').fetchone()[0])
    print('Features:', con.execute('SELECT COUNT(*) FROM features').fetchone()[0])
    print('Sources:', con.execute('SELECT COUNT(*) FROM sources').fetchone()[0])
    con.close()

if __name__ == '__main__':
    main()
