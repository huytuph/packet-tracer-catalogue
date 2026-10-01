(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PTConfigBuilder = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MODELS = {
    '1841': 'router', '2811': 'router', '1941': 'router', '2901': 'router',
    '2911': 'router', 'ISR4321': 'router', 'ISR4331': 'router',
    '2950-24': 'l2', '2950T-24': 'l2', '2960-24TT': 'l2',
    '3560-24PS': 'l3', '3650-24PS': 'l3'
  };
  const MAJORS = ['6', '7', '8', '9'];
  const ETHERSWITCH_MODULES = new Set(['HWIC-4ESW', 'NM-ESW-161', 'NIM-ES2-4']);
  const INTERFACE_TYPES = {e: 'Ethernet', eth: 'Ethernet', ethernet: 'Ethernet',
    f: 'FastEthernet', fa: 'FastEthernet', fastethernet: 'FastEthernet',
    g: 'GigabitEthernet', gi: 'GigabitEthernet', gigabitethernet: 'GigabitEthernet',
    s: 'Serial', se: 'Serial', serial: 'Serial'};

  function supportsDevice(device) {
    return !!device && Object.prototype.hasOwnProperty.call(MODELS, device.pt_name);
  }

  function createConfig(device, index = 1) {
    const number = Number.isInteger(index) && index > 0 && index <= 9999 ? index : 1;
    return {hostname: (MODELS[device?.pt_name] === 'router' ? 'R' : 'SW') + number,
      interfaces: [], vlans: [], management: {enabled: false, vlan: 1, address: '', mask: '', gateway: ''},
      routes: [], enableRouting: false, interfacesConfirmed: false};
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
    const match = /^(Ethernet|Eth|E|FastEthernet|Fa|F|GigabitEthernet|Gi|G|Serial|Se|S)(\d{1,3}\/\d{1,3}(?:\/\d{1,3})?)$/i.exec(value);
    if (!match) return null;
    const slots = match[2].split('/').map(Number);
    if (slots.some(slot => slot > 255)) return null;
    const type = INTERFACE_TYPES[match[1].toLowerCase()];
    return {text: type + slots.join('/'), type};
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
    return row && (row.major_version === undefined || row.major_version === null || String(row.major_version) === major);
  }

  function inspect(item, device, context) {
    const errors = [], warnings = [], normalized = {interfaces: [], vlans: [], routes: [], modules: []};
    const warn = message => { if (!warnings.includes(message)) warnings.push(message); };
    const fail = message => { if (!errors.includes(message)) errors.push(message); };
    const major = typeof context?.major === 'string' ? context.major : '';
    const release = context?.release;
    const kind = MODELS[device?.pt_name];
    if (!supportsDevice(device)) fail('This device is outside the classic IOS generator allowlist.');
    if (!MAJORS.includes(major)) fail('Select a Packet Tracer major version: 6, 7, 8 or 9.');
    if (!printable(release, 13) || !/^[6-9]\.\d{1,3}(?:\.\d{1,4})?$/.test(release)) {
      fail('Enter an exact numeric Packet Tracer release, such as 9.0.1.');
    } else if (release.split('.')[0] !== major) fail('The exact release must match the selected major version.');
    if (context?.format !== 'txt' && context?.format !== 'cfg') fail('Choose txt or cfg output.');
    warn('Untested template: commands have not been runtime-verified on the exact selected release.');

    const profile = selectedProfile(device, major);
    const availability = profile?.availability;
    if (availability?.available === false || availability?.available === 0) fail('This device is unavailable in the selected version family.');
    else if (availability?.available !== true && availability?.available !== 1) warn('Device availability is unknown for this version family; confirm it in Packet Tracer.');
    else if (availability.verification_status !== 'Verified') warn('Device availability evidence is partial for this version family.');
    const config = item?.config;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      fail('The device configuration is missing or invalid.');
      return {errors, warnings, normalized, kind, major, release};
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
      const facts = (Array.isArray(profile?.modules) ? profile.modules : []).filter(row => scoped(row, major) && row.module_id === id);
      if (facts.some(row => row.verification_status === 'Verified' && (row.compatible === false || row.compatible === 0))) fail('A selected module is verified incompatible in this version family.');
      const verified = facts.find(row => row.verification_status === 'Verified' && (row.compatible === true || row.compatible === 1));
      if (verified && verified.max_quantity !== null && verified.max_quantity !== undefined && quantity > verified.max_quantity) fail('Selected module quantity exceeds its verified compatibility limit.');
      if (!verified) warn('Selected module compatibility and quantity are not verified for this version family; confirm the installed hardware.');
    }
    if (normalized.modules.length) warn('Module selection records hardware prerequisites only; it does not create ports or determine their interface names.');
    if (kind === 'router' && (vlans.length || interfaces.some(row => row?.mode === 'access' || row?.mode === 'trunk'))) {
      // Combined-release rows identify a module model only, never its compatibility with the target release.
      const identities = [...(Array.isArray(profile?.modules) ? profile.modules : []), ...(Array.isArray(device?.modules) ? device.modules : [])];
      if (!identities.some(row => moduleIds.has(row.module_id) && ETHERSWITCH_MODULES.has(row.model))) fail('Router VLAN/access/trunk templates require a selected EtherSwitch module and confirmed switching-port roles.');
      warn('Router switching commands belong only on EtherSwitch module ports, not routed Ethernet or serial ports; confirm the selected module role.');
      warn('Router EtherSwitch drafts only reference existing VLANs; create and verify those VLANs separately before applying this draft.');
    }

    // Only the selected profile may supply capability evidence; combined-release claims are not consulted.
    const features = (Array.isArray(profile?.features) ? profile.features : Object.values(profile?.feature_map || {})).filter(row => scoped(row, major));
    function feature(slug, label) {
      const facts = features.filter(row => row.slug === slug);
      if (facts.some(row => row.verification_status === 'Verified' && row.support_mode === 'unsupported')) fail(label + ' is verified unsupported in the selected version family.');
      const verified = facts.find(row => row.verification_status === 'Verified' && ['native', 'configuration_required', 'module_required', 'module_and_configuration'].includes(row.support_mode));
      if (!verified) warn(label + ' command support is not verified for this version family.');
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
    for (let index = 0; index < interfaces.length; index++) {
      const row = interfaces[index], label = 'Interface ' + (index + 1), name = interfaceName(row?.name);
      const mode = row?.mode, description = row?.description ?? '';
      if (!name) fail(label + ' requires one concrete Ethernet/FastEthernet/GigabitEthernet/Serial name, not a range or subinterface.');
      else if (interfaceIds.has(name.text)) fail('Interface names must be unique, including abbreviated aliases.');
      else interfaceIds.add(name.text);
      if (!['routed', 'access', 'trunk'].includes(mode)) fail(label + ' mode must be routed, access or trunk.');
      if (!printable(description, 240)) fail(label + ' description must be printable ASCII text on one line, up to 240 characters.');
      if (row?.shutdown !== undefined && typeof row.shutdown !== 'boolean') fail(label + ' shutdown must be a checkbox.');
      if (name?.type === 'Serial' && (kind !== 'router' || mode !== 'routed')) fail('Serial interfaces only support routed router templates in this builder.');
      const result = {name: name?.text, mode, description, shutdown: row?.shutdown === true};
      if (mode === 'routed') {
        feature('routed_ports', 'Routed physical ports');
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
    return {errors, warnings, normalized, kind, major, release};
  }

  function validate(item, device, context) {
    const {errors, warnings} = inspect(item, device, context);
    return {errors, warnings};
  }

  function generate(item, device, context) {
    const result = inspect(item, device, context), {errors, warnings, normalized: config, kind, major, release} = result;
    const extension = context?.format === 'cfg' ? 'cfg' : 'txt';
    const filename = (typeof config.hostname === 'string' ? config.hostname.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 63) : 'device') + '.' + extension;
    if (errors.length) return {ok: false, errors, warnings, text: '', filename, verificationText: ''};
    const lines = ['! Packet Tracer Catalogue configuration draft', '! Target: Packet Tracer ' + release + ' (' + major + '.x), ' + device.pt_name,
      '! Untested on this exact release. Confirm all interfaces, modules and command support.'];
    if (config.modules.length) lines.push('! Selected module IDs/quantities: ' + config.modules.map(module => module.id + ' x ' + module.quantity).join(', '));
    if (extension === 'txt') lines.push('enable', 'configure terminal');
    lines.push('hostname ' + config.hostname);
    if (config.enableRouting) lines.push('ip routing');
    for (const vlan of config.vlans) {
      lines.push('vlan ' + vlan.id);
      if (vlan.name) lines.push(' name ' + vlan.name);
      lines.push('exit');
    }
    for (const port of config.interfaces) {
      lines.push('interface ' + port.name);
      if (port.description) lines.push(' description ' + port.description);
      if (kind === 'l3' && port.mode !== 'routed') lines.push(' switchport');
      if (port.mode === 'routed') {
        if (kind === 'l3') lines.push(' no switchport');
        if (port.address) lines.push(' ip address ' + port.address + ' ' + port.mask);
      } else if (port.mode === 'access') lines.push(' switchport mode access', ' switchport access vlan ' + port.vlan);
      else {
        if (device.pt_name === '3560-24PS') lines.push(' switchport trunk encapsulation dot1q');
        lines.push(' switchport mode trunk', ' switchport trunk native vlan ' + port.nativeVlan, ' switchport trunk allowed vlan ' + port.allowedVlans);
      }
      lines.push(port.shutdown ? ' shutdown' : ' no shutdown', 'exit');
    }
    if (config.management) {
      lines.push('interface Vlan' + config.management.vlan, ' ip address ' + config.management.address + ' ' + config.management.mask, ' no shutdown', 'exit');
      if (config.management.gateway) lines.push('ip default-gateway ' + config.management.gateway);
    }
    for (const route of config.routes) lines.push('ip route ' + route.network + ' ' + route.mask + ' ' + route.nextHop);
    if (extension === 'txt') lines.push('end');
    const checks = ['show running-config', 'show ip interface brief'];
    for (const port of config.interfaces) checks.push('show interfaces ' + port.name);
    if (config.vlans.length || config.management || config.interfaces.some(port => port.mode !== 'routed')) checks.push(kind === 'router' ? 'show vlan-switch brief' : 'show vlan brief');
    if (config.interfaces.some(port => port.mode === 'trunk')) checks.push('show interfaces trunk');
    if (kind !== 'l2' && (config.routes.length || config.enableRouting)) checks.push('show ip route');
    return {ok: true, errors, warnings, text: lines.join('\n') + '\n', filename, verificationText: checks.join('\n') + '\n'};
  }

  return Object.freeze({supportsDevice, createConfig, validate, generate});
}));
