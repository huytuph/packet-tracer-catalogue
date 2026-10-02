(function (root, factory) {
  'use strict';
  const parser = typeof module === 'object' && module.exports ? require('../assets/vendor/ipaddr.js') : root.ipaddr || globalThis.ipaddr;
  let evidence = root.PT_COMMAND_VERIFICATION;
  let documentation = root.PT_COMMAND_DOCUMENTATION;
  if (typeof module === 'object' && module.exports) {
    try { evidence = require('../data/command-verification.js'); } catch (_) { evidence = null; }
    try { documentation = require('../data/command-documentation.js'); } catch (_) { documentation = null; }
  }
  const api = factory(parser, evidence, documentation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PTConfigBuilder = api;
}(typeof window !== 'undefined' ? window : globalThis, function (ipaddr, manifest, documentation) {
  'use strict';

  const MODELS = {
    '1841': 'router', '2811': 'router', '1941': 'router', '2901': 'router',
    '2911': 'router', 'ISR4321': 'router', 'ISR4331': 'router',
    '819': 'router', '829': 'router', 'CGR1240': 'router', 'Router-PT': 'router',
    'C8200': 'router', 'IR1101': 'router', 'IR8340': 'router',
    '2950-24': 'l2', '2950T-24': 'l2', '2960-24TT': 'l2',
    'Switch-PT': 'l2', 'Switch-PT-Empty': 'l2', 'IE-2000': 'l2',
    '3560-24PS': 'l3', '3650-24PS': 'l3', 'IE-3400': 'l3',
    'ASA5505': 'asa', 'ASA5506-X': 'asa', 'ISA3000': 'asa',
    'WLC-2504': 'gui', 'WLC-3504': 'gui', 'MX65W': 'gui', 'HomeRouter': 'gui',
    'AccessPoint-PT': 'gui', 'LAP-PT': 'gui', '3702i': 'gui', 'Cloud-PT': 'gui'
  };
  const MAJORS = ['6', '7', '8', '9'];
  const TEMPLATE_REVISION = '2.1.0';
  let runtimeRecords = [];
  let documentationReferences = [];
  try {
    if (manifest?.schema_version === 1 && Array.isArray(manifest.records)) runtimeRecords = JSON.parse(JSON.stringify(manifest.records));
  } catch (_) { runtimeRecords = []; }
  try {
    if (exactFields(documentation, ['schema_version', 'template_revision', 'references']) && documentation.schema_version === 1 && documentation.template_revision === TEMPLATE_REVISION && Array.isArray(documentation.references)) documentationReferences = JSON.parse(JSON.stringify(documentation.references));
  } catch (_) { documentationReferences = []; }
  const HELP = 'https://tutorials.ptnetacad.net/help/default/';
  const FEATURES = {
    dot1q_trunk: '802.1Q Trunking', etherchannel: 'EtherChannel', lacp: 'LACP', lldp: 'LLDP',
    pagp: 'PAgP', poe: 'PoE', port_security: 'Port Security', rep: 'REP', rstp: 'RSTP / Rapid PVST+',
    routed_ports: 'Routed Physical Ports', span: 'SPAN', stp: 'STP', svi: 'SVI', vlan: 'VLAN', voice_vlan: 'Voice VLAN',
    bgp: 'BGP', default_route: 'Default Route', eigrp: 'EIGRP', ipv6_routing: 'IPv6 Routing', inter_vlan: 'Inter-VLAN Routing',
    ospf: 'OSPF', ospfv3: 'OSPFv3', rip: 'RIP / RIPv2', static_routing: 'Static Routing', glbp: 'GLBP', hsrp: 'HSRP', vrrp: 'VRRP',
    acl_extended: 'Extended ACL', firepower: 'FirePOWER', nat: 'NAT', pat: 'PAT', acl_standard: 'Standard ACL',
    stateful_firewall: 'Stateful Firewall', vpn: 'VPN', frame_relay: 'Frame Relay', hdlc: 'HDLC', ppp: 'PPP', pppoe: 'PPPoE',
    serial_wan: 'Serial WAN', cellular_3g4g: '3G/4G Cellular', cellular_5g: '5G Cellular', capwap: 'CAPWAP', wpa2: 'WPA2',
    wpa3: 'WPA3', wireless_ap: 'Wireless AP', wireless_controller: 'Wireless Controller', dhcp_proxy: 'DHCP Proxy',
    dhcp_relay: 'DHCP Relay', dhcp_server: 'DHCP Server', web_gui: 'Web GUI', industrial_ot: 'Industrial / OT Networking', ptp: 'Precision Time Protocol'
  };
  const ROUTER_TEMPLATES = new Set(['default_route', 'static_routing', 'rip', 'ospf', 'eigrp', 'bgp', 'ipv6_routing',
    'inter_vlan', 'hsrp', 'vlan', 'dot1q_trunk', 'svi', 'acl_standard', 'acl_extended', 'nat', 'pat', 'dhcp_server', 'dhcp_relay', 'serial_wan', 'hdlc', 'ppp']);
  const SWITCH_TEMPLATES = new Set(['vlan', 'dot1q_trunk', 'svi', 'stp', 'rstp', 'etherchannel', 'lacp', 'pagp', 'port_security', 'voice_vlan']);
  const L3_TEMPLATES = new Set([...SWITCH_TEMPLATES, 'routed_ports', 'default_route', 'static_routing', 'rip', 'ospf', 'eigrp', 'bgp', 'ipv6_routing', 'inter_vlan', 'hsrp', 'acl_standard', 'acl_extended', 'dhcp_relay', 'dhcp_server']);
  const ASA_TEMPLATES = new Set(['static_routing', 'default_route', 'acl_extended', 'nat', 'pat', 'vlan', 'svi']);
  const HARDWARE = new Set(['poe', 'cellular_3g4g', 'cellular_5g', 'industrial_ot', 'wireless_ap', 'wireless_controller']);
  const GUI_FEATURES = new Set(['vlan', 'nat', 'pat', 'stateful_firewall', 'pppoe', 'wpa2', 'wireless_ap', 'wireless_controller', 'dhcp_proxy', 'dhcp_server', 'web_gui', 'capwap', 'frame_relay', 'serial_wan']);
  const BUILTIN_SWITCHING = new Set(['819', '829', 'IR1101', 'IR8340']);
  const ETHERSWITCH_MODULES = new Set(['HWIC-4ESW', 'NM-ESW-161', 'NIM-ES2-4']);
  const INTERFACE_TYPES = {e: 'Ethernet', eth: 'Ethernet', ethernet: 'Ethernet',
    f: 'FastEthernet', fa: 'FastEthernet', fastethernet: 'FastEthernet',
    g: 'GigabitEthernet', gi: 'GigabitEthernet', gigabitethernet: 'GigabitEthernet',
    s: 'Serial', se: 'Serial', serial: 'Serial'};

  function supportsDevice(device) {
    return !!device && Object.prototype.hasOwnProperty.call(MODELS, device.pt_name);
  }

  function exactFields(value, fields) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(field => Object.prototype.hasOwnProperty.call(value, field));
  }

  function describe(device, context = {}) {
    const kind = supportsDevice(device) ? MODELS[device.pt_name] : null;
    const major = typeof context.major === 'string' ? context.major : '';
    const profile = MAJORS.includes(major) ? selectedProfile(device, major) : null;
    const evidence = knownPresence(profile) ? profile : null;
    const facts = (Array.isArray(evidence?.features) ? evidence.features : Object.values(evidence?.feature_map || {})).filter(row => scoped(row, major));
    const templates = kind === 'router' ? ROUTER_TEMPLATES : kind === 'l2' ? SWITCH_TEMPLATES : kind === 'l3' ? L3_TEMPLATES : ASA_TEMPLATES;
    const sections = kind === 'gui' ? ['settings'] : kind === 'asa' ? ['system', 'asa'] : kind === 'l2' ? ['system', 'interfaces', 'vlans', 'management', 'switching'] : ['system', 'interfaces', 'vlans', 'svis', 'routes', 'protocols', 'dhcp', 'acls', ...(kind === 'router' ? ['nat'] : []), ...(kind === 'l3' ? ['switching'] : [])];
    let source = kind === 'router' ? 'CLI_routerIOS15.htm' : kind === 'asa' ? 'CLI_asa.htm' : kind === 'gui' ? 'config_others.htm' : 'CLI_switchIOS.htm';
    const sources = {
      '829': 'CLI_router829.htm', 'C8200': 'commandReference/8200_universal_security_17.6.3.html',
      'IR1101': 'commandReference/ir1101_universalk9.17.10.01a.html', 'IR8340': 'commandReference/8340_universalk9_17.8.1.html',
      'IE-3400': 'commandReference/3x00_17.6.3_MD.html', 'IE-2000': 'commandReference/2000_15.2_EY.html',
      'ASA5505': 'commandReference/5505_9.2.html', 'ASA5506-X': 'commandReference/5506_9.6.html', 'ISA3000': 'commandReference/ISA-3000-2C2F.html',
      'MX65W': 'config_MerakiDevices.htm', 'HomeRouter': 'config_HomeRouter.htm', 'Cloud-PT': 'config_clouds.htm',
      'WLC-2504': 'config_WLCs.htm', 'WLC-3504': 'config_WLCs.htm'
    };
    if (sources[device?.pt_name]) source = sources[device.pt_name];
    const coverage = Object.entries(FEATURES).map(([slug, name]) => {
      const rows = facts.filter(row => row.slug === slug), unsupported = rows.some(row => row.verification_status === 'Verified' && row.support_mode === 'unsupported');
      const status = major === '' ? 'Unverified combined draft' : unsupported ? 'Verified unsupported' : rows.some(row => row.verification_status === 'Verified' && row.support_mode !== 'unsupported') ? 'Verified catalogue evidence; template untested' : rows.length ? 'Partial or unknown evidence; template untested' : 'Unknown evidence; template untested';
      let disposition = unsupported ? 'unsupported' : kind === 'gui' && GUI_FEATURES.has(slug) ? 'gui' : HARDWARE.has(slug) ? 'hardware' : templates?.has(slug) && kind !== 'gui' ? 'template' : 'advanced';
      if (!kind) disposition = 'unsupported';
      const reason = disposition === 'template' ? 'Typed standard template, not every command; confirm device, port roles and installed release.' : disposition === 'gui' ? 'Manual configuration worksheet only; not executable CLI.' : disposition === 'hardware' ? 'Physical capability or prerequisite; no synthetic software command.' : disposition === 'unsupported' ? unsupported ? 'Selected-major evidence explicitly verifies this feature unsupported.' : 'Device has no supported adapter.' : 'No typed template for this feature on this adapter; configure separately using its command reference.';
      return {slug, name, kind: disposition, status, reason};
    });
    const field = (label, type = 'text', choices) => ({label, type, ...(choices ? {choices} : {})});
    let worksheetFields = [];
    const wireless = [field('SSID'), field('Channel', 'number'), field('Authentication', 'select', ['Open', 'WEP', 'WPA-PSK', 'WPA2-PSK']), field('Encryption', 'select', ['AES', 'TKIP']), field('Wireless passphrase', 'password'), field('WEP key', 'password')];
    if (device?.pt_name === 'AccessPoint-PT') worksheetFields = [field('Radio enabled', 'checkbox'), ...wireless, field('Ethernet enabled', 'checkbox'), field('Ethernet bandwidth', 'select', ['Auto', '10', '100', '1000']), field('Duplex', 'select', ['Auto', 'Half', 'Full'])];
    if (device?.pt_name === 'LAP-PT' || device?.pt_name === '3702i') worksheetFields = [field('Radio enabled', 'checkbox'), field('Coverage range', 'number'), ...(device.pt_name === '3702i' ? [field('Primary controller IPv4'), field('Management IPv4'), field('Management mask'), field('Ethernet enabled', 'checkbox'), field('Duplex', 'select', ['Auto', 'Half', 'Full'])] : [])];
    if (device?.pt_name === 'WLC-2504' || device?.pt_name === 'WLC-3504') worksheetFields = [field('Management IPv4'), field('Management mask'), field('Management gateway'), field('WLAN name'), field('SSID'), field('VLAN', 'number'), field('Authentication', 'select', ['Open', 'WEP', 'WPA-PSK', 'WPA2-PSK']), field('Encryption', 'select', ['AES', 'TKIP']), field('Wireless passphrase', 'password'), field('Central switching', 'checkbox'), field('Central authentication', 'checkbox'), field('AP group'), field('DHCP pool settings')];
    if (device?.pt_name === 'HomeRouter') worksheetFields = [field('Internet mode', 'select', ['DHCP', 'Static', 'Wireless AP', 'Media Bridge']), field('Internet IPv4'), field('Internet mask'), field('Internet gateway'), field('LAN IPv4'), field('LAN mask'), field('Radio band', 'select', ['2.4 GHz', '5 GHz 1', '5 GHz 2']), ...wireless, field('RADIUS IPv4'), field('RADIUS shared secret', 'password'), field('Guest SSID')];
    if (device?.pt_name === 'MX65W') worksheetFields = [field('WAN mode', 'select', ['DHCP', 'Static', 'PPPoE']), field('WAN IPv4'), field('WAN mask'), field('WAN gateway'), field('PPPoE username'), field('PPPoE password', 'password'), field('NAT / VLAN addressing'), field('SSID'), field('Authentication', 'select', ['Open', 'WEP', 'WPA2 PSK', 'WPA2 Enterprise']), field('Wireless passphrase', 'password'), field('Outbound firewall rules'), {...field('DHCP server settings'), readOnly: true}];
    if (device?.pt_name === 'Cloud-PT') worksheetFields = [field('Serial interface'), field('Serial enabled', 'checkbox'), field('LMI', 'select', ['ANSI', 'Cisco', 'Q933a']), field('DLCI', 'number'), field('Frame Relay cross-connects'), field('Ethernet interface'), field('Provider network', 'select', ['DSL', 'Cable']), field('DSL / Cable cross-connects'), field('Modem phone number')];
    const reference = documentationReference(device, major);
    return {platform: kind === 'gui' ? 'gui-plan' : kind === 'asa' ? 'asa' : kind ? 'ios-' + kind : null,
      cli: !!kind && kind !== 'gui', sections: kind ? sections : [], coverage, sources: kind ? [reference?.source_url || HELP + source] : [], worksheetFields,
      builtInSwitching: BUILTIN_SWITCHING.has(device?.pt_name), vlanCreation: kind === 'l2' || kind === 'l3', managementSVI: kind === 'l2',
      ipv6Routing: kind === 'router' || kind === 'l3', interfaceServices: kind === 'router' ? ['ipv6', 'serial', 'subinterface', 'helperAddress', 'natRole', 'acl', 'hsrp', 'switchport'] : kind === 'l3' ? ['ipv6', 'helperAddress', 'acl', 'hsrp', 'switchport'] : kind === 'l2' ? ['switchport'] : []};
  }

  function createConfig(device, index = 1) {
    const number = Number.isInteger(index) && index > 0 && index <= 9999 ? index : 1;
    const kind = MODELS[device?.pt_name], name = device?.pt_name || '';
    const prefix = kind === 'router' ? 'R' : kind === 'asa' ? 'FW' : name.startsWith('WLC-') ? 'WLC' : name === 'HomeRouter' ? 'HR' : name === 'MX65W' ? 'MX' : name === 'Cloud-PT' ? 'CLOUD' : kind === 'gui' ? 'AP' : 'SW';
    return {hostname: prefix + number,
      interfaces: [], vlans: [], management: {enabled: false, vlan: 1, address: '', mask: '', gateway: ''},
      routes: [], enableRouting: false, ipv6Routing: false, interfacesConfirmed: false,
      system: {domainName: '', enableSecret: '', users: [], ssh: {enabled: false, version: 2, rsaBits: 1024, vtyStart: 0, vtyEnd: 4}},
      svis: [], protocols: {ospf: {enabled: false, processId: 1, routerId: '', networks: []}, eigrp: {enabled: false, asn: 1, networks: []},
        rip: {enabled: false, networks: []}, bgp: {enabled: false, asn: 65001, neighbors: [], networks: []}},
      switching: {stpMode: '', priorities: [], channels: []}, dhcp: {pools: [], excluded: []}, acls: [], nat: {pat: [], static: []},
      asa: {interfaces: [], routes: [], acls: [], bindings: [], objects: []}, settings: []};
  }

  function integer(value, minimum, maximum) {
    if (typeof value !== 'number' && (!printable(value, 16) || !/^\d+$/.test(value))) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
  }

  function printable(value, maximum) {
    return typeof value === 'string' && value.length <= maximum && !/[^\x20-\x7e]/.test(value);
  }

  function ipv4(value) {
    if (!printable(value, 15) || !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return null;
    const octets = value.split('.').map(Number);
    if (octets.some(octet => octet > 255)) return null;
    return {text: octets.join('.'), number: octets.reduce((total, octet) => total * 256 + octet, 0), octets};
  }

  function unicast(ip) {
    return !!ip && ip.octets[0] > 0 && ip.octets[0] < 224 && ip.octets[0] !== 127;
  }

  function subnetMask(value) {
    const parsed = ipv4(value);
    if (!parsed) return null;
    const inverse = (~parsed.number) >>> 0;
    if ((inverse & (inverse + 1)) !== 0) return null;
    return {...parsed, prefix: Math.clz32(inverse)};
  }

  function interfaceName(value) {
    if (!printable(value, 50)) return null;
    const virtual = /^(Loopback|Lo|Port-channel|Po)(\d{1,4})$/i.exec(value);
    if (virtual) {
      const type = /^lo/i.test(virtual[1]) ? 'Loopback' : 'Port-channel', number = Number(virtual[2]);
      if (type === 'Port-channel' && (number < 1 || number > 6)) return null;
      return {text: type + number, type};
    }
    const match = /^(Ethernet|Eth|E|FastEthernet|Fa|F|GigabitEthernet|Gi|G|Serial|Se|S)(\d{1,3}(?:\/\d{1,3}){0,2})(?:\.(\d{1,4}))?$/i.exec(value);
    if (!match) return null;
    const slots = match[2].split('/').map(Number);
    if (slots.some(slot => slot > 255)) return null;
    const type = INTERFACE_TYPES[match[1].toLowerCase()];
    const unit = match[3] === undefined ? null : integer(match[3], 1, 4094);
    if (match[3] !== undefined && unit === null) return null;
    return {text: type + slots.join('/') + (unit === null ? '' : '.' + unit), type, unit};
  }

  function ipv6Address(value) {
    if (!printable(value, 64) || !/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(value)) return null;
    const [address, length] = value.split('/'), prefix = integer(length, 1, 128);
    if (prefix === null || !ipaddr?.isValid(address)) return null;
    const parsed = ipaddr.parse(address);
    if (parsed.kind() !== 'ipv6' || ['multicast', 'unspecified', 'loopback', 'ipv4Mapped', 'linkLocal'].includes(parsed.range())) return null;
    return {text: parsed.toString() + '/' + prefix, prefix};
  }

  function identifier(value, maximum = 32) {
    return printable(value, maximum) && /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(value);
  }

  function secret(value) {
    return printable(value, 128) && /^[A-Za-z0-9_@%+=.,:!$^*(){}\[\]/-]+$/.test(value);
  }

  function domain(value) {
    return printable(value, 253) && value.split('.').every(label => label.length > 0 && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
  }

  function vlanNumber(value) {
    return integer(value, 1, 1001);
  }

  function allowedVlans(value) {
    if (value === undefined || value === '') return 'all';
    if (!printable(value, 512)) return null;
    if (value === 'all' || value === 'none') return value;
    const ranges = value.split(',').map(part => part.trim());
    const seen = new Set();
    const normalized = [];
    for (const range of ranges) {
      if (!/^\d{1,4}(?:-\d{1,4})?$/.test(range)) return null;
      const [first, last = first] = range.split('-').map(Number);
      if (!vlanNumber(first) || !vlanNumber(last) || first > last) return null;
      for (let vlan = first; vlan <= last; vlan++) {
        if (seen.has(vlan)) return null;
        seen.add(vlan);
      }
      normalized.push(first === last ? String(first) : first + '-' + last);
    }
    return normalized.join(',');
  }

  function selectedProfile(device, major) {
    const profile = device?.version_profiles?.[major];
    return profile && (profile.major_version === undefined || String(profile.major_version) === major) ? profile : null;
  }

  function scoped(row, major) {
    if (!row) return false;
    if (row.major_version !== undefined && row.major_version !== null) return String(row.major_version) === major;
    if (row.version !== undefined && row.version !== null && row.version !== '') return String(row.version).split('.')[0] === major;
    return true;
  }

  function knownPresence(profile) {
    return profile?.availability?.available === true || profile?.availability?.available === 1;
  }

  function validRuntimeRecord(record) {
    const sequence = rows => Array.isArray(rows) && rows.length > 0 && rows.every(row =>
      row && typeof row.rule_id === 'string' && /^[a-z0-9][a-z0-9.-]{0,99}$/.test(row.rule_id) && printable(row.text, 1024) && row.text === row.text.trim() && row.text.length > 0 && row.result === 'accepted');
    const assertions = rows => Array.isArray(rows) && rows.length > 0 && rows.every(row => printable(row, 2048) && row === row.trim() && row.length > 0);
    const evidence = record?.evidence;
    return !!record && identifier(record.id, 80) && typeof record.model === 'string' && supportsDevice({pt_name: record.model}) && MODELS[record.model] !== 'gui' &&
      Number.isInteger(record.major_version) && MAJORS.includes(String(record.major_version)) &&
      typeof record.observed_release === 'string' && /^\d+\.\d+(?:\.\d+){0,2}$/.test(record.observed_release) && record.observed_release.split('.')[0] === String(record.major_version) &&
      record.template_revision === TEMPLATE_REVISION && ['txt', 'cfg'].includes(record.format) &&
      Array.isArray(record.modules) && record.modules.length <= 16 && record.modules.every((row, index) => Number.isSafeInteger(row?.moduleId) && row.moduleId > 0 && Number.isInteger(row.quantity) && row.quantity > 0 && row.quantity <= 16 && (index === 0 || row.moduleId > record.modules[index - 1].moduleId)) &&
      new Set(record.modules.map(row => row.moduleId)).size === record.modules.length &&
      Array.isArray(record.prerequisites) && record.prerequisites.length > 0 && record.prerequisites.every(row => printable(row, 1024) && row === row.trim() && row.length > 0) &&
      sequence(record.commands) && sequence(record.checks) && record.checks.some(row => row.text === 'show running-config') &&
      evidence?.method === 'packet-tracer-runtime' && typeof evidence.transcript_path === 'string' && evidence.transcript_path.startsWith('evidence/runtime/') && /^[A-Za-z0-9_./-]+$/.test(evidence.transcript_path) && !evidence.transcript_path.split('/').includes('..') &&
      typeof evidence.transcript_sha256 === 'string' && /^[a-f0-9]{64}$/.test(evidence.transcript_sha256) &&
      typeof evidence.checked_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(evidence.checked_date) && Number.isFinite(Date.parse(evidence.checked_date + 'T00:00:00Z')) && new Date(evidence.checked_date + 'T00:00:00Z').toISOString().slice(0, 10) === evidence.checked_date &&
      evidence.error_count === 0 && assertions(evidence.running_config_assertions) && assertions(evidence.diagnostic_assertions);
  }

  function recordsFor(device, major) {
    if (!supportsDevice(device) || MODELS[device.pt_name] === 'gui' || !MAJORS.includes(major)) return [];
    return runtimeRecords.filter(record => validRuntimeRecord(record) && record.model === device.pt_name && String(record.major_version) === major)
      .sort((a, b) => b.evidence.checked_date.localeCompare(a.evidence.checked_date) || b.observed_release.localeCompare(a.observed_release, undefined, {numeric: true}) || a.id.localeCompare(b.id));
  }

  function runtimeStatus(device, context = {}) {
    const major = typeof context.major === 'string' ? context.major : '', records = recordsFor(device, major);
    const base = {scope: 'exact-tested-cases', recordCount: records.length, recordIds: records.map(record => record.id)};
    if (!records.length) return {...base, status: 'Unknown', observedRelease: null,
      reason: major === '' ? 'All versions cannot certify an exact runtime-tested command sequence.' : 'No runtime-tested command case is recorded for this model and global version.'};
    if (new Set(runtimeRecords.filter(record => validRuntimeRecord(record) && String(record.major_version) === major).map(record => record.observed_release)).size !== 1) return {...base, status: 'Unknown', observedRelease: null,
      reason: 'Conflicting exact runtime releases are recorded for this global version across models; no implicit release can be selected.'};
    return {...base, status: 'Verified', observedRelease: records[0].observed_release,
      reason: 'Tested cases exist; changed commands, parameters, format or modules must match a recorded case. This is not verification of every model command.'};
  }

  function validDocumentationReference(reference) {
    const strings = (rows, maximum) => Array.isArray(rows) && rows.every(row => printable(row, maximum) && row.length > 0 && row === row.trim());
    const validRule = rule => typeof rule === 'string' && /^[a-z0-9][a-z0-9.-]{0,99}$/.test(rule);
    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    if (!exactFields(reference, ['id', 'model', 'major_version', 'documented_release', 'source_url', 'source_kind', 'source_sha256', 'checked_date', 'rule_ids', 'constraints', 'prerequisites', 'notes']) || !identifier(reference.id, 80) || typeof reference.model !== 'string' || !supportsDevice({pt_name: reference.model}) || MODELS[reference.model] === 'gui' ||
        !Number.isInteger(reference.major_version) || !MAJORS.includes(String(reference.major_version)) ||
        typeof reference.documented_release !== 'string' || !/^\d+\.\d+(?:\.\d+){0,2}$/.test(reference.documented_release) || reference.documented_release.split('.')[0] !== String(reference.major_version) ||
        reference.source_kind !== 'packet-tracer-installed-help' || typeof reference.source_url !== 'string' || !/^https:\/\/tutorials\.ptnetacad\.net\/help\/default\/[A-Za-z0-9_./-]+\.(?:htm|html)$/.test(reference.source_url) || reference.source_url.slice(HELP.length).split('/').some(part => ['', '.', '..'].includes(part)) ||
        typeof reference.source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(reference.source_sha256) || !validDate(reference.checked_date) ||
        !Array.isArray(reference.rule_ids) || reference.rule_ids.length === 0 || !reference.rule_ids.every(validRule) || new Set(reference.rule_ids).size !== reference.rule_ids.length ||
        !strings(reference.prerequisites, 1024) || !strings(reference.notes, 2048) || !Array.isArray(reference.constraints)) return false;
    const required = ['exec.enable', 'exec.configure-terminal', 'global.hostname', 'exec.end', 'show.running-config', MODELS[reference.model] === 'asa' ? 'show.asa.interface-brief' : 'show.ios.interface-brief'];
    if (!required.every(rule => reference.rule_ids.includes(rule))) return false;
    return reference.constraints.every(constraint => {
      if (!exactFields(constraint, ['rule_id', 'pattern', 'reason']) || !reference.rule_ids.includes(constraint.rule_id) || !printable(constraint.pattern, 2048) || !constraint.pattern.startsWith('^') || !constraint.pattern.endsWith('$') || !printable(constraint.reason, 1024) || !constraint.reason.length) return false;
      try { new RegExp(constraint.pattern); return true; } catch (_) { return false; }
    });
  }

  function documentationReference(device, major) {
    if (!supportsDevice(device) || MODELS[device.pt_name] === 'gui' || !MAJORS.includes(major)) return null;
    const references = documentationReferences.filter(reference => validDocumentationReference(reference) && reference.model === device.pt_name && String(reference.major_version) === major);
    return references.length === 1 ? references[0] : null;
  }

  function verificationStatus(device, context = {}) {
    const major = typeof context.major === 'string' ? context.major : '', reference = documentationReference(device, major);
    const base = {model: device?.pt_name || null, majorVersion: major, documentedRelease: reference?.documented_release || null,
      documentationSources: reference ? [reference.source_url] : [], documentationRecordId: reference?.id || null,
      runtime: runtimeStatus(device, {major})};
    if (!reference) return {...base, status: 'Unknown', reason: major === '' ? 'Select one global version for model-specific command documentation.' : 'No reviewed model-specific command documentation is recorded for this global version. References for another Packet Tracer release cannot approve it.'};
    return {...base, status: 'Documentation-backed', reason: 'Reviewed command templates use the official Packet Tracer ' + reference.documented_release + ' reference. This establishes documented syntax, not simulator execution.'};
  }

  function undocumentedCommands(reference, commands, checks) {
    const failures = [];
    const labels = {'ios.acl.extended.': 'extended ACL', 'ios.acl.standard.': 'standard ACL', 'asa.acl.': 'ASA ACL',
      'asa.object.': 'ASA NAT object', 'ios.interface.': 'interface', 'ios.routing.': 'routing protocol', 'show.': 'diagnostic'};
    for (const row of [...commands, ...checks]) {
      const label = Object.entries(labels).find(([prefix]) => row.rule_id.startsWith(prefix))?.[1] || 'configuration';
      if (!reference.rule_ids.includes(row.rule_id)) failures.push('No reviewed official syntax for the selected ' + label + ' command on ' + reference.model + ' (' + row.rule_id + ').');
      else for (const constraint of reference.constraints.filter(constraint => constraint.rule_id === row.rule_id)) {
        if (!new RegExp('^(?:' + constraint.pattern + ')$').test(row.text)) failures.push('Unsupported or undocumented command variant (' + row.rule_id + '): ' + constraint.reason);
      }
    }
    return [...new Set(failures)];
  }

  function matchingRecord(device, major, format, modules, commands, checks) {
    const selectedRelease = runtimeStatus(device, {major}).observedRelease;
    const sameSequence = (actual, recorded) => actual.length === recorded.length && actual.every((row, index) => row.rule_id === recorded[index].rule_id && row.text === recorded[index].text);
    const moduleKey = rows => JSON.stringify(rows.map(row => ({moduleId: row.moduleId ?? row.id, quantity: row.quantity})).sort((a, b) => a.moduleId - b.moduleId));
    return recordsFor(device, major).find(record => record.observed_release === selectedRelease && record.format === format &&
      moduleKey(record.modules) === moduleKey(modules) && sameSequence(commands, record.commands) && sameSequence(checks, record.checks)) || null;
  }

  function inspect(item, device, context) {
    const errors = [], warnings = [], normalized = {interfaces: [], vlans: [], routes: [], modules: []};
    const warn = message => { if (!warnings.includes(message)) warnings.push(message); };
    const fail = message => { if (!errors.includes(message)) errors.push(message); };
    const major = typeof context?.major === 'string' ? context.major : null;
    const kind = MODELS[device?.pt_name];
    if (!supportsDevice(device)) fail('This device has no configuration adapter.');
    if (major !== '' && !MAJORS.includes(major)) fail('Use the global Packet Tracer version selection: All versions, 6, 7, 8 or 9.');
    if (context?.format !== 'txt' && context?.format !== 'cfg') fail('Choose txt or cfg output.');
    warn('Commands must match reviewed official documentation. Input validation and documented syntax are not simulator execution tests.');
    if (major === '') warn('All versions is a combined, unverified draft; no release-scoped availability, feature or module claims are used.');

    const profile = MAJORS.includes(major) ? selectedProfile(device, major) : null;
    const evidence = knownPresence(profile) ? profile : null;
    const availability = profile?.availability;
    if (availability?.available === false || availability?.available === 0) fail('This device is unavailable in the selected version family.');
    else if (availability?.available !== true && availability?.available !== 1) warn('Device availability is unknown for this version family; confirm it in Packet Tracer.');
    else if (availability.verification_status !== 'Verified') warn('Device availability evidence is partial for this version family.');
    const config = item?.config;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      fail('The device configuration is missing or invalid.');
      return {errors, warnings, normalized, kind, major};
    }
    if (item.deviceId !== undefined && integer(item.deviceId, 1, Number.MAX_SAFE_INTEGER) !== device?.device_id) fail('The configuration device ID does not match the selected device.');
    if (!printable(config.hostname, 63) || !/^[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(config.hostname)) fail('Hostname must be 1-63 ASCII letters, digits or hyphens, starting with a letter and not ending with a hyphen.');
    normalized.hostname = config.hostname;
    for (const field of ['interfaces', 'vlans', 'routes']) {
      if (!Array.isArray(config[field]) || config[field].length > 256) fail(field + ' must be a list with no more than 256 rows.');
    }
    const interfaces = Array.isArray(config.interfaces) ? config.interfaces.slice(0, 256) : [];
    const vlans = Array.isArray(config.vlans) ? config.vlans.slice(0, 256) : [];
    const routes = Array.isArray(config.routes) ? config.routes.slice(0, 256) : [];
    if ((kind === 'gui' || kind === 'asa') && (interfaces.length || vlans.length || routes.length || config.management?.enabled || config.enableRouting || config.ipv6Routing)) fail(kind === 'gui' ? 'GUI components use a manual settings worksheet, not IOS configuration sections.' : 'ASA devices use the distinct ASA section, not IOS interfaces, VLANs or routes.');
    const management = config.management;
    if (!management || typeof management !== 'object' || Array.isArray(management) || typeof management.enabled !== 'boolean') fail('Management settings must include an enabled checkbox.');
    if (typeof config.enableRouting !== 'boolean') fail('Routing enablement must be a checkbox.');
    if ((interfaces.length || management?.enabled) && config.interfacesConfirmed !== true) fail('Confirm the concrete interface names, module slots and port roles in your installed Packet Tracer release.');
    if (interfaces.length || management?.enabled) warn('Interface names and module port roles are user-confirmed, not discovered or verified by this generator.');
    if (kind === 'l2' && (config.enableRouting || routes.length || interfaces.some(row => row?.mode === 'routed'))) fail('Layer 2 switches cannot use routed physical ports, static routes or ip routing in this builder.');
    if (kind === 'router' && config.enableRouting) warn('Routers already route; an ip routing command is not emitted for this router template.');
    if (kind === 'router' && vlans.length) fail('Router VLAN creation is not supported in this builder; reference VLANs already created on the EtherSwitch module.');
    if (kind === 'l3' && (routes.length || interfaces.some(row => row?.mode === 'routed')) && !config.enableRouting) fail('Enable IP routing before configuring Layer 3 switch routed ports or static routes.');
    if (management?.enabled && kind !== 'l2') fail('The management SVI/default-gateway template is only available for Layer 2 switches.');

    const moduleRows = item?.modules === undefined ? [] : item.modules;
    if (!Array.isArray(moduleRows) || moduleRows.length > 16) fail('Selected modules must be a list with no more than 16 rows.');
    const moduleIds = new Set();
    for (const module of Array.isArray(moduleRows) ? moduleRows.slice(0, 16) : []) {
      const id = integer(module?.moduleId, 1, Number.MAX_SAFE_INTEGER);
      const quantity = integer(module?.quantity, 1, 16);
      if (id === null || quantity === null) { fail('Module IDs and quantities must be positive whole numbers; quantities cannot exceed 16.'); continue; }
      if (moduleIds.has(id)) fail('A module model is selected more than once; combine its quantities.');
      moduleIds.add(id);
      normalized.modules.push({id, quantity});
      const facts = (Array.isArray(evidence?.modules) ? evidence.modules : []).filter(row => scoped(row, major) && row.module_id === id);
      if (facts.some(row => row.verification_status === 'Verified' && (row.compatible === false || row.compatible === 0))) fail('A selected module is verified incompatible in this version family.');
      const verified = facts.find(row => row.verification_status === 'Verified' && (row.compatible === true || row.compatible === 1));
      if (verified && verified.max_quantity !== null && verified.max_quantity !== undefined && quantity > verified.max_quantity) fail('Selected module quantity exceeds its verified compatibility limit.');
      if (!verified) warn('Selected module compatibility and quantity are not verified for this version family; confirm the installed hardware.');
    }
    if (normalized.modules.length) warn('Module selection records hardware prerequisites only; it does not create ports or determine their interface names.');
    if (kind === 'router' && (vlans.length || interfaces.some(row => row?.mode === 'access' || row?.mode === 'trunk'))) {
      // Combined-release rows identify a module model only, never its compatibility with the target release.
      const identities = [...(Array.isArray(profile?.modules) ? profile.modules : []), ...(Array.isArray(device?.modules) ? device.modules : [])];
      if (!BUILTIN_SWITCHING.has(device?.pt_name) && !identities.some(row => moduleIds.has(row.module_id) && ETHERSWITCH_MODULES.has(row.model))) fail('Router VLAN/access/trunk templates require a selected EtherSwitch module and confirmed switching-port roles.');
      warn('Router switching commands belong only on EtherSwitch module ports, not routed Ethernet or serial ports; confirm the selected module role.');
      warn('Router EtherSwitch drafts only reference existing VLANs; create and verify those VLANs separately before applying this draft.');
    }

    // Only the selected profile may supply capability evidence; combined-release claims are not consulted.
    const features = (Array.isArray(evidence?.features) ? evidence.features : Object.values(evidence?.feature_map || {})).filter(row => scoped(row, major));
    function feature(slug, label) {
      const facts = features.filter(row => row.slug === slug);
      if (facts.some(row => row.verification_status === 'Verified' && row.support_mode === 'unsupported')) fail(label + ' is verified unsupported in the selected version family.');
      const verified = facts.find(row => row.verification_status === 'Verified' && ['native', 'configuration_required', 'module_required', 'module_and_configuration'].includes(row.support_mode));
      if (!verified) warn(label + ' catalogue capability evidence is incomplete for this version family; documented command syntax does not confirm installed hardware or feature behavior.');
      if (verified && ['module_required', 'module_and_configuration'].includes(verified.support_mode)) {
        if (!verified.required_module_id || !moduleIds.has(verified.required_module_id)) fail(label + ' requires its documented module to be selected.');
      }
    }

    const vlanIds = new Set();
    for (let index = 0; index < vlans.length; index++) {
      const row = vlans[index], id = vlanNumber(row?.id), name = row?.name ?? '';
      if (id === null) fail('VLAN ' + (index + 1) + ' must use ID 1-1001; reserved and extended VLAN IDs are outside this builder.');
      else if (vlanIds.has(id)) fail('VLAN IDs must be unique.');
      else vlanIds.add(id);
      if (!printable(name, 32) || (name !== '' && !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name))) fail('VLAN names must be up to 32 ASCII letters, digits, dots, underscores or hyphens without spaces.');
      normalized.vlans.push({id, name});
    }
    function referencedVlan(id) {
      if (id !== null && id !== 1 && !vlanIds.has(id)) warn('Referenced VLAN ' + id + ' is not created in this draft; ' + (kind === 'router' ? 'confirm it already exists on the EtherSwitch module.' : 'confirm it already exists or add it.'));
    }
    function addressPair(address, mask, label) {
      const ip = ipv4(address), subnet = subnetMask(mask);
      if (!unicast(ip)) fail(label + ' requires a unicast IPv4 address (not unspecified, loopback, multicast or broadcast).');
      if (!subnet || subnet.prefix === 0) fail(label + ' requires a contiguous nonzero IPv4 subnet mask.');
      if (ip && subnet && subnet.prefix > 0 && subnet.prefix < 31) {
        const network = (ip.number & subnet.number) >>> 0, broadcast = (network | ~subnet.number) >>> 0;
        if (ip.number === network || ip.number === broadcast) fail(label + ' cannot use the subnet network or broadcast address.');
      }
      if (subnet?.prefix >= 31) warn('Confirm /31 or /32 interface addressing is supported for this port and exact Packet Tracer release.');
      return {ip, subnet};
    }
    const interfaceIds = new Set(), assignedAddresses = new Set(), routedSubnets = [];
    const assignedIPv6 = new Set(), subinterfaceTags = new Set(), nativeParents = new Set();
    function rememberIPv6(value) {
      if (!value) return;
      const address = value.split('/')[0];
      if (assignedIPv6.has(address)) fail('IPv6 interface and SVI addresses must be unique after canonicalization.');
      assignedIPv6.add(address);
    }
    for (let index = 0; index < interfaces.length; index++) {
      const row = interfaces[index], label = 'Interface ' + (index + 1), name = interfaceName(row?.name);
      const mode = row?.mode, description = row?.description ?? '';
      if (!name) fail(label + ' requires one concrete supported interface name, not a range.');
      else if (interfaceIds.has(name.text)) fail('Interface names must be unique, including abbreviated aliases.');
      else interfaceIds.add(name.text);
      if (!['routed', 'access', 'trunk'].includes(mode)) fail(label + ' mode must be routed, access or trunk.');
      if (!printable(description, 240)) fail(label + ' description must be printable ASCII text on one line, up to 240 characters.');
      if (row?.shutdown !== undefined && typeof row.shutdown !== 'boolean') fail(label + ' shutdown must be a checkbox.');
      if (name?.type === 'Serial' && (kind !== 'router' || mode !== 'routed')) fail('Serial interfaces only support routed router templates in this builder.');
      if (name?.type === 'Serial') feature('serial_wan', 'Serial WAN interface');
      if (name?.type === 'Loopback' && (kind === 'l2' || mode !== 'routed')) fail('Loopback interfaces require a routed router or Layer 3 switch template.');
      if (name?.unit !== null && name?.unit !== undefined && (kind !== 'router' || mode !== 'routed' || name.type === 'Serial')) fail('802.1Q subinterfaces are only supported on routed Ethernet router ports.');
      const result = {name: name?.text, mode, description, shutdown: row?.shutdown === true};
      if (mode === 'routed') {
        if (kind === 'l3' && name?.type !== 'Loopback') feature('routed_ports', 'Routed physical ports');
        if (row.address || row.mask) {
          const {ip, subnet} = addressPair(row.address, row.mask, label);
          result.address = ip?.text; result.mask = subnet?.text;
          if (ip && assignedAddresses.has(ip.text)) fail('Interface IPv4 addresses must be unique on this device.');
          if (ip) assignedAddresses.add(ip.text);
          if (ip && subnet && subnet.prefix > 0) {
            const first = (ip.number & subnet.number) >>> 0, last = (first | ~subnet.number) >>> 0;
            if (routedSubnets.some(previous => first <= previous.last && last >= previous.first)) fail('Routed interface subnets cannot overlap; this builder does not model VRFs.');
            routedSubnets.push({first, last});
          }
        }
        if (kind === 'router' && normalized.modules.length) warn('Do not apply routed IPv4 commands to EtherSwitch module ports; confirm each entered port role.');
      } else if (mode === 'access' || mode === 'trunk') {
        feature('vlan', 'VLAN');
        if (row.address || row.mask) fail(label + ' switched ports cannot have a routed IPv4 address or mask.');
        if (mode === 'access') {
          result.vlan = vlanNumber(row.vlan);
          if (result.vlan === null) fail(label + ' access VLAN must use ID 1-1001.');
          referencedVlan(result.vlan);
        } else {
          feature('dot1q_trunk', '802.1Q trunking');
          result.allowedVlans = allowedVlans(row.allowedVlans);
          result.nativeVlan = vlanNumber(row.nativeVlan ?? 1);
          if (result.allowedVlans === null) fail(label + ' allowed VLANs must be all, none or nonoverlapping VLAN numbers/ranges within 1-1001.');
          if (result.nativeVlan === null) fail(label + ' native VLAN must use ID 1-1001.');
          referencedVlan(result.nativeVlan);
        }
      }
      normalized.interfaces.push(result);
    }
    if (vlans.length) feature('vlan', 'VLAN');
    normalized.enableRouting = kind === 'l3' && config.enableRouting === true;
    if (normalized.enableRouting) feature('inter_vlan', 'IP routing / inter-VLAN routing');

    if (management?.enabled) {
      feature('vlan', 'VLAN'); feature('svi', 'Management SVI');
      const vlan = vlanNumber(management.vlan), {ip, subnet} = addressPair(management.address, management.mask, 'Management SVI');
      if (vlan === null) fail('Management VLAN must use ID 1-1001.');
      referencedVlan(vlan);
      const gateway = management.gateway ? ipv4(management.gateway) : null;
      if (management.gateway && !unicast(gateway)) fail('Management default gateway requires a unicast IPv4 address.');
      if (gateway && ip && subnet) {
        if (gateway.number === ip.number) fail('Management default gateway cannot be the management address.');
        const network = (ip.number & subnet.number) >>> 0;
        if (((gateway.number & subnet.number) >>> 0) !== network) fail('Management default gateway must be in the management subnet.');
        else if (subnet.prefix < 31 && (gateway.number === network || gateway.number === ((network | ~subnet.number) >>> 0))) fail('Management default gateway cannot be the subnet network or broadcast address.');
      }
      normalized.management = {vlan, address: ip?.text, mask: subnet?.text, gateway: gateway?.text};
    }
    for (let index = 0; index < routes.length; index++) {
      const row = routes[index], network = ipv4(row?.network), mask = subnetMask(row?.mask), nextHop = ipv4(row?.nextHop);
      const label = 'Route ' + (index + 1);
      if (!network || (!unicast(network) && network.number !== 0)) fail(label + ' requires a unicast IPv4 destination network, or 0.0.0.0 for a default route.');
      if (!mask) fail(label + ' requires a contiguous IPv4 subnet mask.');
      if (network && mask) {
        if (((network.number & mask.number) >>> 0) !== network.number) fail(label + ' destination has host bits set for its subnet mask.');
        if (mask.prefix === 0 && network.number !== 0) fail(label + ' /0 destination must be 0.0.0.0.');
        if (network.number === 0 && mask.prefix !== 0) fail(label + ' unspecified destination is only supported for a default route.');
      }
      if (!unicast(nextHop)) fail(label + ' requires a unicast IPv4 next-hop address.');
      if (nextHop && assignedAddresses.has(nextHop.text)) fail(label + ' next hop cannot be one of this device\'s interface addresses.');
      feature('static_routing', 'Static routing');
      if (network?.number === 0 && mask?.prefix === 0) feature('default_route', 'Default route');
      normalized.routes.push({network: network?.text, mask: mask?.text, nextHop: nextHop?.text});
    }
    const list = (value, label, maximum = 256) => {
      if (value === undefined) return [];
      if (!Array.isArray(value) || value.length > maximum) { fail(label + ' must be a list with no more than ' + maximum + ' rows.'); return []; }
      return value;
    };
    const object = (value, label) => {
      if (value === undefined) return {};
      if (!value || typeof value !== 'object' || Array.isArray(value)) { fail(label + ' must be an object.'); return {}; }
      return value;
    };
    const checkbox = (value, label) => { if (value !== undefined && typeof value !== 'boolean') fail(label + ' must be a checkbox.'); return value === true; };
    const word = (value, label, maximum = 32) => { if (!identifier(value, maximum)) fail(label + ' must be a single ASCII identifier.'); return value; };
    const routeNetwork = (network, mask, label) => {
      const ip = ipv4(network), subnet = subnetMask(mask);
      if (!ip || (!unicast(ip) && ip.number !== 0) || !subnet || ((ip.number & subnet.number) >>> 0) !== ip.number || (ip.number === 0 && subnet.prefix !== 0)) fail(label + ' must be a valid IPv4 network with a contiguous mask and no host bits.');
      return {network: ip?.text, mask: subnet?.text, ip, subnet};
    };
    const aclEndpoint = (value, wildcard, label, asaMask = false) => {
      if (value === 'any') { if (wildcard) fail(label + ' any cannot have a mask.'); return 'any'; }
      const ip = ipv4(value);
      if (!unicast(ip)) fail(label + ' must be any or a unicast IPv4 host/network.');
      if (!wildcard) return ip ? 'host ' + ip.text : '';
      const parsed = asaMask ? subnetMask(wildcard) : ipv4(wildcard);
      if (!parsed) fail(label + (asaMask ? ' requires a contiguous subnet mask.' : ' requires an IPv4 wildcard mask.'));
      if (ip && parsed) {
        const maskNumber = asaMask ? parsed.number : (~parsed.number) >>> 0;
        if (((ip.number & maskNumber) >>> 0) !== ip.number) fail(label + ' network has host bits set for its mask.');
      }
      return ip && parsed ? ip.text + ' ' + parsed.text : '';
    };
    const ipv6Value = (value, label) => {
      if (value === undefined || value === '') return '';
      const parsed = ipv6Address(value);
      if (!parsed) fail(label + ' requires a unicast non-link-local IPv6 address/prefix (1-128), using the bundled IP parser; link-local syntax is not templated.');
      return parsed?.text || '';
    };
    const routing = kind === 'router' || kind === 'l3';
    normalized.ipv6Routing = checkbox(config.ipv6Routing, 'IPv6 routing');
    if (normalized.ipv6Routing) { if (!routing) fail('IPv6 routing requires an IOS router or Layer 3 switch.'); feature('ipv6_routing', 'IPv6 routing'); }
    normalized.settings = [];
    const worksheet = describe(device, {major}).worksheetFields;
    for (const setting of list(config.settings, 'Worksheet settings')) {
      const value = typeof setting?.value === 'boolean' || typeof setting?.value === 'number' ? String(setting.value) : setting?.value;
      if (!printable(setting?.label, 100) || !setting.label.trim() || !printable(value, 512)) fail('Worksheet labels and values must be printable single-line ASCII text; labels cannot be empty.');
      const field = worksheet.find(candidate => candidate.label === setting?.label);
      if (value && field?.readOnly) fail('This worksheet field is read-only in Packet Tracer: ' + field.label + '.');
      if (value && field?.type === 'select' && !field.choices.includes(value)) fail('Worksheet selection is outside its documented choices: ' + field.label + '.');
      if (value && field?.type === 'checkbox' && !['true', 'false'].includes(value)) fail('Worksheet checkbox must be true or false: ' + field.label + '.');
      if (value && field?.type === 'number' && integer(value, 0, 1000000) === null) fail('Worksheet numeric values must be nonnegative whole numbers: ' + field.label + '.');
      if (value && field?.type === 'password') warn('The manual worksheet contains plaintext credentials; do not persist worksheet values in saved drafts or session exports.');
      normalized.settings.push({label: setting?.label, value});
    }
    if (kind !== 'gui' && normalized.settings.length) fail('Manual worksheet settings are only available on GUI components.');

    const system = object(config.system, 'System settings'), ssh = object(system.ssh, 'SSH settings');
    normalized.system = {domainName: system.domainName || '', enableSecret: system.enableSecret || '', users: [], ssh: null};
    if (system.domainName && !domain(system.domainName)) fail('Domain name must contain valid ASCII DNS labels.');
    if (system.enableSecret && !secret(system.enableSecret)) fail('Enable secret must be a single safe ASCII token, without spaces or command controls.');
    const userNames = new Set();
    for (const user of list(system.users, 'Local users', 64)) {
      word(user?.name, 'Local username');
      if (userNames.has(user?.name)) fail('Local usernames must be unique.'); userNames.add(user?.name);
      if (!secret(user?.secret)) fail('Local user secret must be a single safe ASCII token.');
      const privilege = integer(user?.privilege ?? 1, 0, 15);
      if (privilege === null) fail('Local user privilege must be 0-15.');
      if (kind === 'asa' && privilege !== 1) fail('ASA local users do not support the IOS privilege option in this template; leave privilege at 1.');
      normalized.system.users.push({name: user?.name, secret: user?.secret, privilege});
    }
    if (system.enableSecret || normalized.system.users.length) warn('Generated files contain plaintext credentials. Do not persist these secrets in saved drafts or session exports; protect downloaded files.');
    if (checkbox(ssh.enabled, 'SSH enablement')) {
      if (kind === 'asa' || kind === 'gui') fail('This SSH template is IOS-only; ASA/GUI management requires separate platform-specific access settings.');
      if (!system.domainName || !normalized.system.users.length) fail('SSH requires a domain name and at least one local user.');
      const version = integer(ssh.version, 2, 2), rsaBits = integer(ssh.rsaBits, 512, 2048), start = integer(ssh.vtyStart, 0, 15), end = integer(ssh.vtyEnd, 0, 15);
      if (version === null || ![512, 768, 1024, 2048].includes(rsaBits) || start === null || end === null || start > end) fail('SSH requires version 2, RSA size 512/768/1024/2048, and an ordered VTY range 0-15.');
      if (rsaBits && rsaBits < 2048) warn('RSA keys smaller than 2048 bits are for simulator compatibility only, not a production security recommendation.');
      normalized.system.ssh = {rsaBits, start, end};
      warn('SSH key generation and VTY support depend on the installed simulated image; verify the commands before use.');
    }
    if (kind === 'gui' && (system.domainName || system.enableSecret || normalized.system.users.length || ssh.enabled)) fail('GUI components use worksheet settings instead of IOS system commands.');

    for (let index = 0; index < interfaces.length; index++) {
      const row = interfaces[index] || {}, port = normalized.interfaces[index], label = 'Interface ' + (index + 1), name = interfaceName(row.name);
      port.ipv6 = ipv6Value(row.ipv6, label + ' IPv6');
      rememberIPv6(port.ipv6);
      if (port.ipv6) { if (!routing || port.mode !== 'routed') fail('IPv6 addressing requires a routed IOS interface.'); if (!normalized.ipv6Routing) fail('Enable IPv6 routing before assigning routed IPv6 addresses.'); feature('ipv6_routing', 'IPv6 addressing'); }
      if (name?.unit !== null && name?.unit !== undefined) {
        port.dot1qVlan = vlanNumber(row.dot1qVlan);
        port.native = checkbox(row.native, 'Subinterface native VLAN');
        if (port.dot1qVlan === null) fail('Router subinterfaces require an 802.1Q VLAN ID 1-1001.');
        const parent = name.text.split('.')[0], key = parent + '/' + port.dot1qVlan;
        if (subinterfaceTags.has(key)) fail('Subinterfaces on the same physical parent cannot reuse an 802.1Q VLAN tag.'); subinterfaceTags.add(key);
        if (port.native && nativeParents.has(parent)) fail('A physical parent can have only one native 802.1Q subinterface.'); if (port.native) nativeParents.add(parent);
        feature('dot1q_trunk', '802.1Q subinterfaces'); feature('inter_vlan', 'Inter-VLAN routing');
        warn('Subinterfaces require the corresponding physical parent interface to exist and be enabled; no parent interface is guessed or created.');
      } else if (row.dot1qVlan) fail('An 802.1Q VLAN tag requires a concrete Ethernet subinterface name.');
      port.encapsulation = row.encapsulation || '';
      if (port.encapsulation && (!['hdlc', 'ppp'].includes(port.encapsulation) || name?.type !== 'Serial')) fail('HDLC/PPP encapsulation only applies to routed serial interfaces.');
      if (port.encapsulation) feature(port.encapsulation, port.encapsulation.toUpperCase() + ' encapsulation');
      if (row.clockRate !== undefined && row.clockRate !== '') {
        port.clockRate = integer(row.clockRate, 1200, 4000000);
        if (port.clockRate === null || name?.type !== 'Serial' || row.dceConfirmed !== true) fail('Serial clock rate requires a whole value 1200-4000000 and confirmation that this is the DCE end.');
        warn('Verify the entered clock rate is supported by this serial controller; not every integer rate is accepted.');
      }
      if (row.helperAddress) { const helper = ipv4(row.helperAddress); if (!routing || port.mode !== 'routed' || !unicast(helper)) fail('DHCP relay requires a routed IOS port and unicast helper address.'); port.helperAddress = helper?.text; feature('dhcp_relay', 'DHCP relay'); }
      port.natRole = row.natRole || '';
      if (port.natRole && (kind !== 'router' || port.mode !== 'routed' || !['inside', 'outside'].includes(port.natRole))) fail('NAT roles are inside/outside on routed IOS router interfaces only.');
      if (port.natRole) feature('nat', 'NAT');
      for (const direction of ['aclIn', 'aclOut']) { port[direction] = row[direction] || ''; if (port[direction]) { if (!routing || port.mode !== 'routed') fail('IOS ACL bindings require a routed interface.'); word(port[direction], 'Interface ACL reference'); } }
      port.portfast = checkbox(row.portfast, 'PortFast'); port.bpduguard = checkbox(row.bpduguard, 'BPDU Guard');
      if ((port.portfast || port.bpduguard) && port.mode !== 'access') fail('PortFast and BPDU Guard require access-mode switched ports in this conservative template.');
      if (port.bpduguard && !port.portfast) fail('BPDU Guard in this template requires PortFast to be enabled.');
      if (port.portfast || port.bpduguard) feature('stp', 'Spanning tree port settings');
      if (row.voiceVlan !== undefined && row.voiceVlan !== '') { port.voiceVlan = vlanNumber(row.voiceVlan); if (port.voiceVlan === null || port.mode !== 'access') fail('Voice VLAN requires an access port and VLAN ID 1-1001.'); feature('voice_vlan', 'Voice VLAN'); referencedVlan(port.voiceVlan); }
      const security = object(row.portSecurity, label + ' port security');
      if (checkbox(security.enabled, 'Port security')) {
        const maximum = integer(security.maximum, 1, 132);
        if (port.mode !== 'access' || maximum === null || !['shutdown', 'restrict', 'protect'].includes(security.violation)) fail('Port security requires an access port, maximum 1-132 and shutdown/restrict/protect violation mode.');
        port.portSecurity = {maximum, violation: security.violation, sticky: checkbox(security.sticky, 'Sticky MAC learning')}; feature('port_security', 'Port security');
      }
      const standby = object(row.hsrp, label + ' HSRP');
      if (checkbox(standby.enabled, 'HSRP')) {
        const group = integer(standby.group, 0, 255), priority = integer(standby.priority, 0, 255), virtual = addressPair(standby.address, port.mask, label + ' HSRP virtual address');
        if (!routing || port.mode !== 'routed' || !port.address || group === null || priority === null) fail('HSRP requires a routed IPv4 interface, group 0-255 and priority 0-255 in this conservative template.');
        const own = ipv4(port.address), subnet = subnetMask(port.mask);
        if (virtual.ip && own && subnet && ((virtual.ip.number & subnet.number) >>> 0) !== ((own.number & subnet.number) >>> 0)) fail('HSRP virtual address must be in the interface subnet.');
        if (virtual.ip && assignedAddresses.has(virtual.ip.text)) fail('HSRP virtual address cannot equal a device interface address.');
        port.hsrp = {group, address: virtual.ip?.text, priority, preempt: checkbox(standby.preempt, 'HSRP preemption')}; feature('hsrp', 'HSRP');
        warn('Packet Tracer models HSRPv2; verify peer configuration and the installed image.');
      }
    }
    normalized.svis = [];
    const sviIds = new Set();
    for (const row of list(config.svis, 'Routed SVIs')) {
      if (!routing || (kind === 'l3' && !config.enableRouting)) fail('Routed SVIs require an IOS router or a Layer 3 switch with IP routing enabled.');
      if (config.interfacesConfirmed !== true) fail('Confirm concrete interfaces and port roles before entering routed SVIs.');
      const vlan = vlanNumber(row?.vlan), description = row?.description || '', pair = row?.address || row?.mask ? addressPair(row?.address, row?.mask, 'Routed SVI') : {};
      if (vlan === null || sviIds.has(vlan)) fail('Routed SVI VLAN IDs must be unique within 1-1001.'); sviIds.add(vlan); referencedVlan(vlan);
      if (!printable(description, 240)) fail('SVI descriptions must be printable single-line ASCII text.');
      if (pair.ip && assignedAddresses.has(pair.ip.text)) fail('Interface IPv4 addresses must be unique on this device.'); if (pair.ip) assignedAddresses.add(pair.ip.text);
      if (pair.ip && pair.subnet) {
        const first = (pair.ip.number & pair.subnet.number) >>> 0, last = (first | ~pair.subnet.number) >>> 0;
        if (routedSubnets.some(previous => first <= previous.last && last >= previous.first)) fail('Routed interface and SVI subnets cannot overlap; this builder does not model VRFs.'); routedSubnets.push({first, last});
      }
      const v6 = ipv6Value(row?.ipv6, 'Routed SVI IPv6'); if (v6 && !normalized.ipv6Routing) fail('Enable IPv6 routing before assigning routed SVI IPv6 addresses.');
      rememberIPv6(v6);
      if (v6) feature('ipv6_routing', 'SVI IPv6 addressing');
      const svi = {vlan, description, address: pair.ip?.text, mask: pair.subnet?.text, ipv6: v6, shutdown: checkbox(row?.shutdown, 'SVI shutdown'), aclIn: row?.aclIn || '', aclOut: row?.aclOut || ''};
      if (row?.helperAddress) { const helper = ipv4(row.helperAddress); if (!unicast(helper)) fail('SVI DHCP relay requires a unicast IPv4 helper address.'); svi.helperAddress = helper?.text; feature('dhcp_relay', 'SVI DHCP relay'); }
      for (const direction of ['aclIn', 'aclOut']) if (svi[direction]) word(svi[direction], 'SVI ACL reference');
      const standby = object(row?.hsrp, 'SVI HSRP');
      if (checkbox(standby.enabled, 'SVI HSRP')) {
        const group = integer(standby.group, 0, 255), priority = integer(standby.priority, 0, 255), virtual = addressPair(standby.address, svi.mask, 'SVI HSRP virtual address');
        if (!svi.address || group === null || priority === null) fail('SVI HSRP requires routed IPv4 addressing, group 0-255 and priority 0-255.');
        if (virtual.ip && pair.ip && pair.subnet && ((virtual.ip.number & pair.subnet.number) >>> 0) !== ((pair.ip.number & pair.subnet.number) >>> 0)) fail('SVI HSRP virtual address must be in the SVI subnet.');
        if (virtual.ip && assignedAddresses.has(virtual.ip.text)) fail('SVI HSRP virtual address cannot equal a device interface address.');
        svi.hsrp = {group, address: virtual.ip?.text, priority, preempt: checkbox(standby.preempt, 'SVI HSRP preemption')}; feature('hsrp', 'SVI HSRP');
        warn('Packet Tracer models HSRPv2; verify peer configuration and the installed image.');
      }
      normalized.svis.push(svi);
      feature('svi', 'Routed SVI'); feature('inter_vlan', 'Inter-VLAN routing');
      if (kind === 'router') {
        const identities = [...(Array.isArray(profile?.modules) ? profile.modules : []), ...(Array.isArray(device?.modules) ? device.modules : [])];
        if (!BUILTIN_SWITCHING.has(device?.pt_name) && !identities.some(module => moduleIds.has(module.module_id) && ETHERSWITCH_MODULES.has(module.model))) fail('Router SVIs require a selected EtherSwitch module or confirmed built-in switching hardware.');
        warn('Router SVIs require confirmed built-in or EtherSwitch switching ports and an existing VLAN; no VLAN database is created.');
      }
    }
    for (const route of normalized.routes) if (assignedAddresses.has(route.nextHop)) fail('Static route next hop cannot be one of this device\'s interface or SVI addresses.');

    normalized.protocols = {};
    const protocols = object(config.protocols, 'Routing protocols');
    for (const protocol of ['ospf', 'eigrp', 'rip', 'bgp']) {
      const source = object(protocols[protocol], protocol.toUpperCase() + ' settings');
      if (!checkbox(source.enabled, protocol.toUpperCase() + ' enablement')) continue;
      if (!routing || (kind === 'l3' && !config.enableRouting)) fail('Dynamic routing requires an IOS router or Layer 3 switch with IP routing enabled.');
      feature(protocol, protocol.toUpperCase());
      const target = {networks: [], neighbors: []};
      if (protocol === 'ospf') { target.processId = integer(source.processId, 1, 65535); if (target.processId === null) fail('OSPF process ID must be 1-65535.'); if (source.routerId) { const id = ipv4(source.routerId); if (!unicast(id)) fail('OSPF router ID must be a unicast IPv4 address.'); target.routerId = id?.text; } }
      if (protocol === 'eigrp' || protocol === 'bgp') { target.asn = integer(source.asn, 1, 65535); if (target.asn === null) fail(protocol.toUpperCase() + ' AS number must be 1-65535 in this template.'); }
      for (const network of list(source.networks, protocol.toUpperCase() + ' networks')) {
        if (protocol === 'bgp') target.networks.push(routeNetwork(network?.network, network?.mask, 'BGP network'));
        else if (protocol === 'rip') { const ip = ipv4(network?.network); if (!unicast(ip)) fail('RIP network must be a unicast IPv4 classful network address.'); else { const prefix = ip.octets[0] < 128 ? 8 : ip.octets[0] < 192 ? 16 : 24; if (ip.number % 2 ** (32 - prefix)) fail('RIP network must use the classful network address, not a subnet or host.'); } target.networks.push({network: ip?.text}); }
        else { const normalizedNetwork = aclEndpoint(network?.network, network?.wildcard, protocol.toUpperCase() + ' network'); if (network?.network === 'any' || !network?.wildcard) fail(protocol.toUpperCase() + ' networks require explicit IPv4 network and wildcard values.'); const area = protocol === 'ospf' ? integer(network?.area, 0, 4294967295) : null; if (protocol === 'ospf' && area === null) fail('OSPF area must be a whole number 0-4294967295.'); target.networks.push({expression: normalizedNetwork, area}); }
      }
      for (const neighbor of list(source.neighbors, 'BGP neighbors')) { if (protocol !== 'bgp') { fail('Neighbors rows are only supported for BGP.'); break; } const ip = ipv4(neighbor?.address), remoteAs = integer(neighbor?.remoteAs, 1, 65535); if (!unicast(ip) || remoteAs === null) fail('BGP neighbors require a unicast IPv4 address and remote AS 1-65535.'); target.neighbors.push({address: ip?.text, remoteAs}); }
      if (!target.networks.length && !target.neighbors.length) warn(protocol.toUpperCase() + ' is enabled without networks or neighbors.');
      normalized.protocols[protocol] = target;
    }

    const switching = object(config.switching, 'Switching settings'); normalized.switching = {stpMode: switching.stpMode || '', priorities: [], channels: []};
    if (normalized.switching.stpMode) { if (!['l2', 'l3'].includes(kind) || !['pvst', 'rapid-pvst'].includes(normalized.switching.stpMode)) fail('Spanning tree mode is pvst/rapid-pvst on IOS switches only.'); feature(normalized.switching.stpMode === 'rapid-pvst' ? 'rstp' : 'stp', 'Spanning tree mode'); }
    const priorities = new Set(), channelGroups = new Set(), channelMembers = new Set();
    for (const row of list(switching.priorities, 'STP priorities')) { const vlan = vlanNumber(row?.vlan), priority = integer(row?.priority, 0, 61440); if (!['l2', 'l3'].includes(kind) || vlan === null || priority === null || priority % 4096 || priorities.has(vlan)) fail('STP priorities require unique VLANs 1-1001 and priority multiples of 4096 within 0-61440 on IOS switches.'); priorities.add(vlan); normalized.switching.priorities.push({vlan, priority}); feature('stp', 'STP priority'); }
    for (const row of list(switching.channels, 'EtherChannels', 6)) {
      const group = integer(row?.group, 1, 6), mode = row?.mode, members = [];
      if (!['l2', 'l3'].includes(kind) || group === null || channelGroups.has(group) || !['on', 'active', 'passive', 'auto', 'desirable'].includes(mode)) fail('EtherChannels require an IOS switch, unique group 1-6 and on/active/passive/auto/desirable mode.'); channelGroups.add(group);
      if (normalized.interfaces.some(port => port.name === 'Port-channel' + group)) fail('A manually configured Port-channel cannot also be generated by an EtherChannel group in this draft.');
      for (const value of list(row?.members, 'EtherChannel members', 8)) { const name = interfaceName(value), port = normalized.interfaces.find(candidate => candidate.name === name?.text); if (!name || !['Ethernet', 'FastEthernet', 'GigabitEthernet'].includes(name.type) || name.unit !== null || !port || port.mode === 'routed' || channelMembers.has(name.text)) fail('EtherChannel members must be distinct configured switched physical interfaces in only one group.'); else { channelMembers.add(name.text); members.push(name.text); } }
      if (members.length < 2) fail('An EtherChannel requires at least two configured switched member ports.');
      const ports = members.map(name => normalized.interfaces.find(port => port.name === name));
      if (ports.some(port => port.portSecurity || port.mode !== ports[0]?.mode || port.vlan !== ports[0]?.vlan || port.nativeVlan !== ports[0]?.nativeVlan || port.allowedVlans !== ports[0]?.allowedVlans)) fail('EtherChannel member modes and VLAN settings must match, and member port security is outside this template.');
      normalized.switching.channels.push({group, mode, members}); feature('etherchannel', 'EtherChannel'); if (['active', 'passive'].includes(mode)) feature('lacp', 'LACP'); if (['auto', 'desirable'].includes(mode)) feature('pagp', 'PAgP');
    }

    normalized.acls = []; const aclNames = new Set(), aclIdentities = new Set();
    for (const row of list(config.acls, 'IOS access lists')) {
      if (!routing) fail('IOS ACL templates require an IOS router or Layer 3 switch.'); word(row?.name, 'ACL name');
      const numericName = typeof row?.name === 'string' && /^\d+$/.test(row.name), number = numericName ? Number(row.name) : null;
      if (numericName && (row.type === 'standard' ? integer(number, 1, 99) === null : row.type === 'extended' ? integer(number, 100, 199) === null : true)) fail('Numeric IOS ACL names must use standard 1-99 or extended 100-199.');
      const identity = numericName ? 'number:' + number : 'name:' + row?.name;
      if (aclIdentities.has(identity)) fail('ACL names must be unique, including numeric aliases with leading zeros.'); aclIdentities.add(identity); aclNames.add(row?.name);
      if (!['standard', 'extended'].includes(row?.type)) fail('ACL type must be standard or extended.');
      const entries = [];
      for (const entry of list(row?.entries, 'ACL entries')) { if (!['permit', 'deny'].includes(entry?.action)) fail('ACL action must be permit or deny.'); const source = aclEndpoint(entry?.source, entry?.sourceWildcard, 'ACL source'); let destination = '', protocol = entry?.protocol || 'ip', port = null; if (row?.type === 'extended') { if (!['ip', 'tcp', 'udp', 'icmp'].includes(protocol)) fail('ACL protocol must be ip/tcp/udp/icmp.'); destination = aclEndpoint(entry?.destination, entry?.destinationWildcard, 'ACL destination'); if (entry?.destinationPort !== undefined && entry.destinationPort !== '') { port = integer(entry.destinationPort, 1, 65535); if (port === null || !['tcp', 'udp'].includes(protocol)) fail('ACL destination ports require TCP/UDP and port 1-65535.'); } } entries.push({action: entry?.action, source, destination, protocol, port}); }
      if (!entries.length) fail('An ACL requires at least one explicit entry.');
      normalized.acls.push({name: row?.name, type: row?.type, entries}); feature(row?.type === 'standard' ? 'acl_standard' : 'acl_extended', 'IPv4 ACL');
      warn('ACLs have an implicit deny. Verify entry ordering and management access before applying bindings.');
    }
    for (const port of [...normalized.interfaces, ...normalized.svis]) for (const direction of ['aclIn', 'aclOut']) if (port[direction] && !aclNames.has(port[direction])) fail('Interface and SVI ACL references must name an ACL defined in this draft.');

    const dhcp = object(config.dhcp, 'DHCP settings'); normalized.dhcp = {pools: [], excluded: []}; const poolNames = new Set();
    for (const row of list(dhcp.pools, 'DHCP pools')) { if (!routing) fail('IOS DHCP pools require an IOS router or Layer 3 switch.'); word(row?.name, 'DHCP pool name'); if (poolNames.has(row?.name)) fail('DHCP pool names must be unique.'); poolNames.add(row?.name); const network = routeNetwork(row?.network, row?.mask, 'DHCP pool network'), gateway = ipv4(row?.gateway), dns = row?.dns ? ipv4(row.dns) : null; if (!network.subnet || network.subnet.prefix < 1 || network.subnet.prefix > 30 || !unicast(gateway)) fail('DHCP pools require a usable /1-/30 IPv4 network and unicast gateway.'); if (network.ip && network.subnet && gateway && (((gateway.number & network.subnet.number) >>> 0) !== network.ip.number || gateway.number === network.ip.number || gateway.number === ((network.ip.number | ~network.subnet.number) >>> 0))) fail('DHCP default gateway must be a usable host in the pool network.'); if (row?.dns && !unicast(dns)) fail('DHCP DNS server must be unicast IPv4.'); if (row?.domain && !domain(row.domain)) fail('DHCP domain must use valid ASCII DNS labels.'); normalized.dhcp.pools.push({name: row?.name, network: network.network, mask: network.mask, gateway: gateway?.text, dns: dns?.text, domain: row?.domain || ''}); feature('dhcp_server', 'DHCP server'); }
    for (const row of list(dhcp.excluded, 'DHCP exclusions')) { const start = ipv4(row?.start), end = row?.end ? ipv4(row.end) : start; if (!routing || !unicast(start) || !unicast(end) || start.number > end.number) fail('DHCP exclusions require an ordered unicast IPv4 host range on an IOS routing device.'); normalized.dhcp.excluded.push({start: start?.text, end: end?.text}); feature('dhcp_server', 'DHCP exclusions'); }

    const nat = object(config.nat, 'NAT settings'); normalized.nat = {pat: [], static: []}; const patKeys = new Set(), natInside = new Set(), natOutside = new Set();
    for (const row of list(nat.pat, 'PAT rules')) { const name = interfaceName(row?.interface), outside = normalized.interfaces.find(port => port.name === name?.text); if (kind !== 'router' || !aclNames.has(row?.acl) || !normalized.acls.some(acl => acl.name === row?.acl && acl.type === 'standard') || outside?.natRole !== 'outside' || !normalized.interfaces.some(port => port.natRole === 'inside')) fail('PAT requires an IOS router, a defined standard ACL and confirmed inside/outside routed interfaces.'); word(row?.acl, 'PAT ACL reference'); const key = row?.acl + '/' + name?.text; if (patKeys.has(key)) fail('Duplicate PAT ACL/interface rules are not allowed.'); patKeys.add(key); normalized.nat.pat.push({acl: row?.acl, interface: name?.text}); feature('nat', 'NAT'); feature('pat', 'PAT'); }
    for (const row of list(nat.static, 'Static NAT rules')) { const inside = ipv4(row?.inside), outside = ipv4(row?.outside); if (kind !== 'router' || !unicast(inside) || !unicast(outside) || inside.number === outside.number || !normalized.interfaces.some(port => port.natRole === 'inside') || !normalized.interfaces.some(port => port.natRole === 'outside')) fail('Static NAT requires different unicast inside/outside addresses and confirmed IOS router NAT port roles.'); if (natInside.has(inside?.text) || natOutside.has(outside?.text)) fail('Static NAT inside and outside addresses must be unique; conflicting translations are not supported.'); natInside.add(inside?.text); natOutside.add(outside?.text); normalized.nat.static.push({inside: inside?.text, outside: outside?.text}); feature('nat', 'Static NAT'); }

    const asa = object(config.asa, 'ASA settings'); normalized.asa = {interfaces: [], routes: [], acls: [], bindings: [], objects: []};
    const nameifs = new Set(), asaNames = new Set(), asaAclNames = new Set(), objectNames = new Set();
    for (const row of list(asa.interfaces, 'ASA interfaces')) {
      if (kind !== 'asa') fail('ASA interface syntax only applies to ASA-family devices.'); if (config.interfacesConfirmed !== true) fail('Confirm concrete ASA interfaces and port roles before generating a draft.');
      const svi = typeof row?.name === 'string' && /^Vlan\d{1,4}$/i.test(row.name) && printable(row.name, 12) ? vlanNumber(row.name.slice(4)) : null, name = svi ? {text: 'Vlan' + svi} : interfaceName(row?.name);
      if (!name || (!svi && !['Ethernet', 'FastEthernet', 'GigabitEthernet'].includes(name.type)) || asaNames.has(name.text) || name.unit !== undefined && name.unit !== null) fail('ASA interface names must be concrete unique Ethernet-family physical ports or ASA5505 VLAN interfaces without subinterfaces.'); if (name) asaNames.add(name.text);
      if (!svi && name && (device?.pt_name === 'ASA5505' ? !/^Ethernet0\/[0-7]$/.test(name.text) : !/^GigabitEthernet1\/[1-8]$/.test(name.text))) fail('This ASA model requires Ethernet0/0-7 on ASA5505 or GigabitEthernet1/1-8 on ASA5506-X/ISA3000; confirm the actual installed port exists.');
      const label = row?.nameif || '', level = row?.securityLevel === undefined || row.securityLevel === '' ? null : integer(row.securityLevel, 0, 100), vlan = row?.vlan === undefined || row.vlan === '' ? null : vlanNumber(row.vlan);
      if (label) { word(label, 'ASA nameif'); if (nameifs.has(label)) fail('ASA nameif labels must be unique.'); nameifs.add(label); }
      if (row?.securityLevel !== undefined && row.securityLevel !== '' && level === null) fail('ASA security level must be 0-100.');
      const pair = row?.address || row?.mask ? addressPair(row?.address, row?.mask, 'ASA interface') : {};
      if (device?.pt_name === 'ASA5505' && !svi && (pair.ip || label || level !== null)) fail('ASA5505 physical ports are switchports; put nameif/security/IP on a VLAN interface.');
      if (vlan !== null && (device?.pt_name !== 'ASA5505' || svi)) fail('ASA access VLAN assignments only apply to ASA5505 physical switchports.');
      if (row?.vlan !== undefined && row.vlan !== '' && vlan === null) fail('ASA access VLAN must use 1-1001.');
      if (device?.pt_name !== 'ASA5505' && svi) fail('This ASA adapter uses routed physical interfaces, not ASA5505 VLAN interfaces.');
      if (svi) { feature('vlan', 'ASA VLAN interface'); feature('svi', 'ASA SVI'); }
      if (vlan !== null) feature('vlan', 'ASA access VLAN');
      if ((pair.ip || level !== null) && !label) fail('ASA routed addresses/security levels require a nameif label.');
      if (pair.ip && assignedAddresses.has(pair.ip.text)) fail('ASA IPv4 interface addresses must be unique.'); if (pair.ip) assignedAddresses.add(pair.ip.text);
      if (pair.ip && pair.subnet) { const first = (pair.ip.number & pair.subnet.number) >>> 0, last = (first | ~pair.subnet.number) >>> 0; if (routedSubnets.some(previous => first <= previous.last && last >= previous.first)) fail('ASA routed interface subnets cannot overlap; this builder does not model VRFs.'); routedSubnets.push({first, last}); }
      normalized.asa.interfaces.push({name: name?.text, nameif: label, securityLevel: level, address: pair.ip?.text, mask: pair.subnet?.text, vlan, shutdown: checkbox(row?.shutdown, 'ASA interface shutdown')});
    }
    if (normalized.asa.interfaces.length) warn('Verify ASA routed/transparent mode and license/VLAN limits in the installed image; these are not changed by this draft.');
    for (const row of list(asa.routes, 'ASA routes')) { if (kind !== 'asa' || !nameifs.has(row?.nameif)) fail('ASA routes require a nameif configured in this draft.'); const network = routeNetwork(row?.network, row?.mask, 'ASA route'), nextHop = ipv4(row?.nextHop); if (!unicast(nextHop) || assignedAddresses.has(nextHop.text)) fail('ASA routes require a unicast next hop distinct from device interfaces.'); normalized.asa.routes.push({nameif: row?.nameif, network: network.network, mask: network.mask, nextHop: nextHop?.text}); feature('static_routing', 'ASA static routing'); if (network.ip?.number === 0) feature('default_route', 'ASA default route'); }
    for (const row of list(asa.acls, 'ASA access lists')) { if (kind !== 'asa') fail('ASA ACL syntax only applies to ASA-family devices.'); word(row?.name, 'ASA ACL name'); asaAclNames.add(row?.name); if (!['permit', 'deny'].includes(row?.action) || !['ip', 'tcp', 'udp', 'icmp'].includes(row?.protocol)) fail('ASA ACL actions/protocols must be permit/deny and ip/tcp/udp/icmp.'); const source = aclEndpoint(row?.source, row?.sourceMask, 'ASA ACL source', true), destination = aclEndpoint(row?.destination, row?.destinationMask, 'ASA ACL destination', true); let port = null; if (row?.destinationPort !== undefined && row.destinationPort !== '') { port = integer(row.destinationPort, 1, 65535); if (port === null || !['tcp', 'udp'].includes(row.protocol)) fail('ASA ACL ports require TCP/UDP port 1-65535.'); } normalized.asa.acls.push({name: row?.name, action: row?.action, protocol: row?.protocol, source, destination, port}); feature('acl_extended', 'ASA ACL'); }
    for (const row of list(asa.bindings, 'ASA ACL bindings')) { if (kind !== 'asa' || !asaAclNames.has(row?.acl) || !nameifs.has(row?.nameif) || !['in', 'out'].includes(row?.direction)) fail('ASA access-group bindings require a defined ACL, defined nameif and in/out direction.'); normalized.asa.bindings.push({acl: row?.acl, direction: row?.direction, nameif: row?.nameif}); }
    for (const row of list(asa.objects, 'ASA NAT objects')) { if (kind !== 'asa') fail('ASA object NAT only applies to ASA-family devices.'); word(row?.name, 'ASA network object name'); if (objectNames.has(row?.name)) fail('ASA network object names must be unique.'); objectNames.add(row?.name); const network = routeNetwork(row?.network, row?.mask, 'ASA NAT object'); if (!network.subnet?.prefix || !nameifs.has(row?.inside) || !nameifs.has(row?.outside) || row?.inside === row?.outside || row?.dynamicInterface !== true) fail('ASA NAT objects require a nondefault network, distinct configured inside/outside nameifs and dynamic-interface PAT enabled.'); normalized.asa.objects.push({name: row?.name, network: network.network, mask: network.mask, inside: row?.inside, outside: row?.outside}); feature('nat', 'ASA object NAT'); feature('pat', 'ASA object PAT'); }
    return {errors, warnings, normalized, kind, major};
  }

  function validate(item, device, context) {
    const {errors, warnings} = inspect(item, device, context);
    return {errors, warnings};
  }

  function generate(item, device, context) {
    const result = inspect(item, device, context), {errors, warnings, normalized: config, kind, major} = result;
    const extension = kind !== 'gui' && context?.format === 'cfg' ? 'cfg' : 'txt';
    const filename = (typeof config.hostname === 'string' ? config.hostname.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 63) : 'device') + '.' + extension;
    if (errors.length) return {ok: false, errors, warnings, text: '', filename, verificationText: ''};
    const target = major === '' ? 'All versions (combined, unverified)' : major + '.x';
    if (kind === 'gui') {
      if (context?.format === 'cfg') warnings.push('This component has no IOS configuration output; a manual TXT worksheet is exported instead of CFG.');
      const lines = ['Packet Tracer Catalogue manual configuration worksheet', 'Component: ' + device.pt_name, 'Global target: ' + target, 'Draft name: ' + config.hostname,
        'UNTESTED. Not executable CLI and not an importable simulator configuration.', 'Apply and verify settings manually in the device Config tab or web interface.'];
      for (const setting of config.settings) if (setting.value !== '') lines.push(setting.label + ': ' + setting.value);
      lines.push('Reference: ' + describe(device, {major}).sources[0]);
      return {ok: true, errors, warnings, text: lines.join('\n') + '\n', filename, verificationText: 'Verify each entered setting in the component GUI and test its connectivity.\n', outputKind: 'worksheet'};
    }
    const commands = [], checks = [], lines = [];
    const emit = (rule_id, text) => { commands.push({rule_id, text: text.trim()}); lines.push(text); };
    const check = (rule_id, text) => { if (!checks.some(row => row.text === text)) checks.push({rule_id, text}); };
    emit('exec.enable', 'enable');
    emit('exec.configure-terminal', 'configure terminal');
    emit('global.hostname', 'hostname ' + config.hostname);
    if (config.system.domainName) emit(kind === 'asa' ? 'asa.domain-name' : 'ios.domain-name', (kind === 'asa' ? 'domain-name ' : 'ip domain-name ') + config.system.domainName);
    if (config.system.enableSecret) emit(kind === 'asa' ? 'asa.enable-password' : 'ios.enable-secret', (kind === 'asa' ? 'enable password ' : 'enable secret 0 ') + config.system.enableSecret);
    for (const user of config.system.users) emit(kind === 'asa' ? 'asa.username' : 'ios.username', kind === 'asa' ? 'username ' + user.name + ' password ' + user.secret : 'username ' + user.name + ' privilege ' + user.privilege + ' secret 0 ' + user.secret);
    if (config.system.ssh) {
      emit('ios.ssh.rsa-general-keys', 'crypto key generate rsa general-keys modulus ' + config.system.ssh.rsaBits);
      emit('ios.ssh.version', 'ip ssh version 2'); emit('ios.ssh.vty', 'line vty ' + config.system.ssh.start + ' ' + config.system.ssh.end);
      emit('ios.ssh.login-local', ' login local'); emit('ios.ssh.transport', ' transport input ssh'); emit('ios.ssh.exit', 'exit');
    }
    if (config.enableRouting) emit('ios.ip-routing', 'ip routing');
    if (config.ipv6Routing) emit('ios.ipv6-routing', 'ipv6 unicast-routing');
    for (const vlan of config.vlans) {
      emit('ios.vlan.create', 'vlan ' + vlan.id);
      if (vlan.name) emit('ios.vlan.name', ' name ' + vlan.name);
      emit('ios.vlan.exit', 'exit');
    }
    function switchedCommands(port, prefix) {
      if (kind === 'l3') emit(prefix + '.switchport', ' switchport');
      if (port.mode === 'access') { emit(prefix + '.access-mode', ' switchport mode access'); emit(prefix + '.access-vlan', ' switchport access vlan ' + port.vlan); }
      else {
        if (device.pt_name === '3560-24PS') emit(prefix + '.trunk-encapsulation', ' switchport trunk encapsulation dot1q');
        emit(prefix + '.trunk-mode', ' switchport mode trunk'); emit(prefix + '.native-vlan', ' switchport trunk native vlan ' + port.nativeVlan); emit(prefix + '.allowed-vlans', ' switchport trunk allowed vlan ' + port.allowedVlans);
      }
    }
    function routedCommands(port, prefix) {
      if (port.address) emit(prefix + '.ipv4', ' ip address ' + port.address + ' ' + port.mask);
      if (port.ipv6) emit(prefix + '.ipv6', ' ipv6 address ' + port.ipv6);
      if (port.helperAddress) emit(prefix + '.helper', ' ip helper-address ' + port.helperAddress);
      if (port.aclIn) emit(prefix + '.acl-in', ' ip access-group ' + port.aclIn + ' in');
      if (port.aclOut) emit(prefix + '.acl-out', ' ip access-group ' + port.aclOut + ' out');
      if (port.hsrp) {
        emit(prefix + '.hsrp-ip', ' standby ' + port.hsrp.group + ' ip ' + port.hsrp.address);
        emit(prefix + '.hsrp-priority', ' standby ' + port.hsrp.group + ' priority ' + port.hsrp.priority);
        if (port.hsrp.preempt) emit(prefix + '.hsrp-preempt', ' standby ' + port.hsrp.group + ' preempt');
      }
    }
    for (const port of config.interfaces) {
      emit('ios.interface.select', 'interface ' + port.name);
      if (port.description) emit('ios.interface.description', ' description ' + port.description);
      if (port.mode === 'routed') {
        if (kind === 'l3' && !/^Loopback/.test(port.name)) emit('ios.interface.no-switchport', ' no switchport');
        if (port.dot1qVlan) emit(port.native ? 'ios.interface.dot1q-native' : 'ios.interface.dot1q', ' encapsulation dot1Q ' + port.dot1qVlan + (port.native ? ' native' : ''));
        if (port.encapsulation) emit('ios.interface.encapsulation-' + port.encapsulation, ' encapsulation ' + port.encapsulation);
        if (port.clockRate) emit('ios.interface.clock-rate', ' clock rate ' + port.clockRate);
        routedCommands(port, 'ios.interface');
        if (port.natRole) emit('ios.interface.nat-' + port.natRole, ' ip nat ' + port.natRole);
      } else switchedCommands(port, 'ios.interface');
      if (port.voiceVlan) emit('ios.interface.voice-vlan', ' switchport voice vlan ' + port.voiceVlan);
      if (port.portfast) emit('ios.interface.portfast', ' spanning-tree portfast');
      if (port.bpduguard) emit('ios.interface.bpduguard', ' spanning-tree bpduguard enable');
      if (port.portSecurity) {
        emit('ios.interface.port-security', ' switchport port-security'); emit('ios.interface.port-security-maximum', ' switchport port-security maximum ' + port.portSecurity.maximum);
        emit('ios.interface.port-security-violation', ' switchport port-security violation ' + port.portSecurity.violation);
        if (port.portSecurity.sticky) emit('ios.interface.port-security-sticky', ' switchport port-security mac-address sticky');
      }
      emit(port.shutdown ? 'ios.interface.shutdown' : 'ios.interface.no-shutdown', port.shutdown ? ' shutdown' : ' no shutdown'); emit('ios.interface.exit', 'exit');
    }
    if (config.management) {
      emit('ios.management.select', 'interface Vlan' + config.management.vlan); emit('ios.management.ipv4', ' ip address ' + config.management.address + ' ' + config.management.mask);
      emit('ios.management.no-shutdown', ' no shutdown'); emit('ios.management.exit', 'exit');
      if (config.management.gateway) emit('ios.management.gateway', 'ip default-gateway ' + config.management.gateway);
    }
    for (const svi of config.svis) {
      emit('ios.svi.select', 'interface Vlan' + svi.vlan); if (svi.description) emit('ios.svi.description', ' description ' + svi.description);
      routedCommands(svi, 'ios.svi'); emit(svi.shutdown ? 'ios.svi.shutdown' : 'ios.svi.no-shutdown', svi.shutdown ? ' shutdown' : ' no shutdown'); emit('ios.svi.exit', 'exit');
    }
    if (config.switching.stpMode) emit('ios.stp.mode', 'spanning-tree mode ' + config.switching.stpMode);
    for (const priority of config.switching.priorities) emit('ios.stp.priority', 'spanning-tree vlan ' + priority.vlan + ' priority ' + priority.priority);
    for (const channel of config.switching.channels) {
      for (const member of channel.members) { emit('ios.channel.member', 'interface ' + member); emit('ios.channel.group', ' channel-group ' + channel.group + ' mode ' + channel.mode); emit('ios.channel.member-exit', 'exit'); }
      emit('ios.channel.select', 'interface Port-channel' + channel.group); switchedCommands(config.interfaces.find(port => port.name === channel.members[0]), 'ios.channel');
      emit('ios.channel.no-shutdown', ' no shutdown'); emit('ios.channel.exit', 'exit');
    }
    for (const route of config.routes) emit('ios.route.static', 'ip route ' + route.network + ' ' + route.mask + ' ' + route.nextHop);
    for (const [protocol, settings] of Object.entries(config.protocols)) {
      const prefix = 'ios.routing.' + protocol;
      emit(prefix + '.select', 'router ' + protocol + (protocol === 'ospf' ? ' ' + settings.processId : protocol === 'rip' ? '' : ' ' + settings.asn));
      if (protocol === 'ospf' && settings.routerId) emit(prefix + '.router-id', ' router-id ' + settings.routerId);
      if (protocol === 'rip') emit(prefix + '.version', ' version 2');
      if (protocol === 'rip' || protocol === 'eigrp') emit(prefix + '.no-auto-summary', ' no auto-summary');
      for (const network of settings.networks) emit(prefix + '.network', ' network ' + (protocol === 'ospf' ? network.expression + ' area ' + network.area : protocol === 'eigrp' ? network.expression : protocol === 'bgp' ? network.network + ' mask ' + network.mask : network.network));
      for (const neighbor of settings.neighbors) emit(prefix + '.neighbor', ' neighbor ' + neighbor.address + ' remote-as ' + neighbor.remoteAs);
      emit(prefix + '.exit', 'exit');
    }
    for (const acl of config.acls) {
      emit('ios.acl.' + acl.type + '.select', 'ip access-list ' + acl.type + ' ' + acl.name);
      for (const entry of acl.entries) emit('ios.acl.' + acl.type + '.' + entry.action, ' ' + entry.action + ' ' + (acl.type === 'standard' ? entry.source : entry.protocol + ' ' + entry.source + ' ' + entry.destination + (entry.port ? ' eq ' + entry.port : '')));
      emit('ios.acl.' + acl.type + '.exit', 'exit');
    }
    for (const excluded of config.dhcp.excluded) emit('ios.dhcp.excluded', 'ip dhcp excluded-address ' + excluded.start + (excluded.start === excluded.end ? '' : ' ' + excluded.end));
    for (const pool of config.dhcp.pools) {
      emit('ios.dhcp.pool', 'ip dhcp pool ' + pool.name); emit('ios.dhcp.network', ' network ' + pool.network + ' ' + pool.mask); emit('ios.dhcp.gateway', ' default-router ' + pool.gateway);
      if (pool.dns) emit('ios.dhcp.dns', ' dns-server ' + pool.dns); if (pool.domain) emit('ios.dhcp.domain', ' domain-name ' + pool.domain); emit('ios.dhcp.exit', 'exit');
    }
    for (const rule of config.nat.pat) emit('ios.nat.pat', 'ip nat inside source list ' + rule.acl + ' interface ' + rule.interface + ' overload');
    for (const rule of config.nat.static) emit('ios.nat.static', 'ip nat inside source static ' + rule.inside + ' ' + rule.outside);
    for (const port of config.asa.interfaces) {
      emit('asa.interface.select', 'interface ' + port.name); if (port.vlan) emit('asa.interface.access-vlan', ' switchport access vlan ' + port.vlan);
      if (port.nameif) emit('asa.interface.nameif', ' nameif ' + port.nameif); if (port.securityLevel !== null) emit('asa.interface.security-level', ' security-level ' + port.securityLevel);
      if (port.address) emit('asa.interface.ipv4', ' ip address ' + port.address + ' ' + port.mask);
      emit(port.shutdown ? 'asa.interface.shutdown' : 'asa.interface.no-shutdown', port.shutdown ? ' shutdown' : ' no shutdown'); emit('asa.interface.exit', 'exit');
    }
    for (const route of config.asa.routes) emit('asa.route.static', 'route ' + route.nameif + ' ' + route.network + ' ' + route.mask + ' ' + route.nextHop);
    for (const acl of config.asa.acls) emit('asa.acl.' + acl.action, 'access-list ' + acl.name + ' extended ' + acl.action + ' ' + acl.protocol + ' ' + acl.source + ' ' + acl.destination + (acl.port ? ' eq ' + acl.port : ''));
    for (const binding of config.asa.bindings) emit('asa.acl.bind-' + binding.direction, 'access-group ' + binding.acl + ' ' + binding.direction + ' interface ' + binding.nameif);
    for (const object of config.asa.objects) {
      emit('asa.object.select', 'object network ' + object.name); emit('asa.object.subnet', ' subnet ' + object.network + ' ' + object.mask);
      emit('asa.object.pat', ' nat (' + object.inside + ',' + object.outside + ') dynamic interface'); emit('asa.object.exit', 'exit');
    }
    emit('exec.end', 'end');
    check('show.running-config', 'show running-config'); check(kind === 'asa' ? 'show.asa.interface-brief' : 'show.ios.interface-brief', kind === 'asa' ? 'show interface ip brief' : 'show ip interface brief');
    for (const port of config.interfaces) check('show.ios.interface', 'show interfaces ' + port.name);
    if (config.vlans.length || config.management || config.interfaces.some(port => port.mode !== 'routed')) check(kind === 'router' ? 'show.ios.vlan-switch' : 'show.ios.vlan', kind === 'router' ? 'show vlan-switch brief' : 'show vlan brief');
    if (config.interfaces.some(port => port.mode === 'trunk')) check('show.ios.trunk', 'show interfaces trunk');
    if (kind !== 'l2' && (config.routes.length || config.enableRouting)) check('show.ios.route', 'show ip route');
    if (config.ipv6Routing) check('show.ios.ipv6-interface', 'show ipv6 interface brief');
    if (config.system.ssh) check('show.ios.ssh', 'show ip ssh');
    if (config.switching.stpMode || config.switching.priorities.length) check('show.ios.stp', 'show spanning-tree');
    if (config.switching.channels.length) check('show.ios.etherchannel', 'show etherchannel summary');
    if (config.acls.length) check('show.ios.acl', 'show access-lists');
    if (config.dhcp.pools.length) check('show.ios.dhcp', 'show ip dhcp binding');
    if (config.nat.pat.length || config.nat.static.length) check('show.ios.nat', 'show ip nat translations');
    if (Object.keys(config.protocols).length) { check('show.ios.protocols', 'show ip protocols'); check('show.ios.route', 'show ip route'); }
    if ([...config.interfaces, ...config.svis].some(port => port.hsrp)) check('show.ios.hsrp', 'show standby brief');
    if (config.asa.routes.length) check('show.asa.route', 'show route');
    if (config.asa.acls.length) check('show.asa.acl', 'show access-list');
    if (config.asa.objects.length) { check('show.asa.nat', 'show nat'); check('show.asa.xlate', 'show xlate'); }
    const status = verificationStatus(device, {major}), reference = documentationReference(device, major);
    const documentationErrors = reference ? undocumentedCommands(reference, commands, checks) : [status.reason];
    if (documentationErrors.length) return {ok: false, errors: [...errors, ...documentationErrors], warnings, text: '', filename, verificationText: '', outputKind: 'cli',
      verification: {...status, status: 'Unknown'}};
    const approved = matchingRecord(device, major, extension, config.modules, commands, checks);
    const prerequisites = [...new Set([...reference.prerequisites, ...(approved?.prerequisites || [])])];
    warnings.push(...prerequisites.map(prerequisite => 'Configuration prerequisite: ' + prerequisite));
    if (!approved) warnings.push('Documentation-backed syntax for Packet Tracer ' + reference.documented_release + '; this generated configuration has not been runtime-tested.');
    const runtime = {...status.runtime, status: approved ? 'Verified' : 'Unknown', observedRelease: approved?.observed_release || null, recordId: approved?.id || null,
      reason: approved ? 'This exact generated configuration matches a recorded simulator execution.' : 'This generated configuration has no matching runtime-tested case. Documentation-backed generation is permitted.'};
    return {ok: true, errors, warnings, text: lines.join('\n') + '\n', filename, verificationText: checks.map(row => row.text).join('\n') + '\n', outputKind: 'cli',
      verification: {...status, status: approved ? 'Runtime-tested' : 'Documentation-backed', runtime, templateRevision: TEMPLATE_REVISION,
        transcriptPath: approved?.evidence.transcript_path || null, prerequisites}};
  }

  return Object.freeze({supportsDevice, describe, createConfig, validate, generate, verificationStatus, templateRevision: TEMPLATE_REVISION});
}));
