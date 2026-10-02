(function () {
  'use strict';

  const STORAGE_KEY = 'ptCatalogue.builder.v1';
  const MAX_ITEMS = 50;
  const MAX_ROWS = 64;
  const MAX_STORAGE = 100000;
  const majors = ['6', '7', '8', '9'];
  const ROW_DEFAULTS = {
    interfaces: {name: '', mode: 'routed', address: '', mask: '', description: '', vlan: '', allowedVlans: '', nativeVlan: '', shutdown: false, ipv6: '', encapsulation: '', clockRate: '', dceConfirmed: false, dot1qVlan: '', native: false, helperAddress: '', natRole: '', aclIn: '', aclOut: '', portfast: false, bpduguard: false, voiceVlan: '', portSecurity: {enabled: false, maximum: 1, violation: 'shutdown', sticky: false}, hsrp: {enabled: false, group: 1, address: '', priority: 100, preempt: false}},
    vlans: {id: '', name: ''}, routes: {network: '', mask: '', nextHop: ''},
    'system.users': {name: '', secret: '', privilege: 1},
    svis: {vlan: '', address: '', mask: '', ipv6: '', description: '', shutdown: false, helperAddress: '', aclIn: '', aclOut: '', hsrp: {enabled: false, group: 1, address: '', priority: 100, preempt: false}},
    'protocols.ospf.networks': {network: '', wildcard: '', area: ''},
    'protocols.eigrp.networks': {network: '', wildcard: ''},
    'protocols.rip.networks': {network: ''},
    'protocols.bgp.neighbors': {address: '', remoteAs: ''},
    'protocols.bgp.networks': {network: '', mask: ''},
    'switching.priorities': {vlan: '', priority: ''},
    'switching.channels': {group: '', mode: 'on', members: []},
    'dhcp.pools': {name: '', network: '', mask: '', gateway: '', dns: '', domain: ''},
    'dhcp.excluded': {start: '', end: ''},
    acls: {name: '', type: 'standard', entries: []},
    'acls.*.entries': {action: 'permit', protocol: 'ip', source: 'any', sourceWildcard: '', destination: 'any', destinationWildcard: '', destinationPort: ''},
    'nat.pat': {acl: '', interface: ''}, 'nat.static': {inside: '', outside: ''},
    'asa.interfaces': {name: '', nameif: '', securityLevel: '', address: '', mask: '', vlan: '', shutdown: false},
    'asa.routes': {nameif: '', network: '', mask: '', nextHop: ''},
    'asa.acls': {name: '', action: 'permit', protocol: 'ip', source: 'any', sourceMask: '', destination: 'any', destinationMask: '', destinationPort: ''},
    'asa.bindings': {acl: '', direction: 'in', nameif: ''},
    'asa.objects': {name: '', network: '', mask: '', inside: '', outside: '', dynamicInterface: false},
    settings: {label: '', value: ''}
  };
  let db, engine, mount, settings, elements;
  let initialized = false;
  let state = {nextId: 1, instances: [], parts: [], selectedId: null};
  let output = null;
  let revision = 0;
  let storageWarning = '';
  let selectionMessage = '';
  let selectionKind = '';
  const invalidParts = new Set();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
  const string = (value, maximum = 160) => typeof value === 'string' ? value.slice(0, maximum) : '';
  const icon = name => `<img class="button-icon" src="assets/icons/${name}.svg" alt="" aria-hidden="true">`;
  const button = (action, label, image, attributes = '') => `<button type="button" data-action="${action}" ${attributes}>${image ? icon(image) : ''}${esc(label)}</button>`;
  const iconButton = (action, label, image, attributes = '') => `<button type="button" class="icon-button" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}" ${attributes}>${icon(image)}</button>`;
  const device = id => db.devices.find(item => item.device_id === Number(id));
  const moduleById = id => db.modules.find(item => item.module_id === Number(id));
  const selected = () => state.instances.find(item => item.id === state.selectedId);
  const major = () => { const value = String(settings.getVersion()); return majors.includes(value) ? value : ''; };
  const nextId = prefix => prefix + '-' + state.nextId++;

  function uniqueHostname(base) {
    const names = new Set(state.instances.map(instance => instance.config.hostname));
    if (!names.has(base)) return base;
    for (let number = 2; number <= MAX_ITEMS + 1; number++) {
      const suffix = '-' + number;
      const candidate = base.slice(0, 63 - suffix.length) + suffix;
      if (!names.has(candidate)) return candidate;
    }
    return base;
  }

  function cleanConfig(source, model, index) {
    const defaults = engine.createConfig(model, index);
    const config = cleanNode(source, defaults, '', true);
    config.interfacesConfirmed = false;
    return config;
  }

  const schemaPath = path => path.replace(/@r-\d+/g, '*');
  const secretPath = path => /(^|\.)(enableSecret|secret)$/.test(path) || /^settings\.@r-\d+\.value$/.test(path);

  // Empty lists need explicit row schemas; only known fields survive persistence.
  function cleanNode(source, defaults, path, freshIds) {
    if (Array.isArray(defaults)) {
      const values = Array.isArray(source) ? source.slice(0, MAX_ROWS) : defaults;
      const row = ROW_DEFAULTS[schemaPath(path)];
      if (!row) return values.filter(value => typeof value === 'string').map(value => string(value, 80));
      return values.filter(value => value && typeof value === 'object' && !Array.isArray(value)).map(value => {
        const id = !freshIds && /^r-\d+$/.test(value._id) ? value._id : nextId('r');
        return {...cleanNode(value, row, path + '.@' + id, freshIds), _id: id};
      });
    }
    if (defaults && typeof defaults === 'object') {
      const object = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
      return Object.fromEntries(Object.keys(defaults).map(key => [key, cleanNode(object[key], defaults[key], path ? path + '.' + key : key, freshIds)]));
    }
    if (secretPath(path)) return '';
    if (typeof defaults === 'boolean') return source === undefined ? defaults : source === true;
    if (typeof defaults === 'number') return typeof source === 'number' && Number.isFinite(source) ? source : typeof source === 'string' ? string(source, 32) : defaults;
    if (typeof source === 'number' && Number.isFinite(source)) return String(source);
    return source === undefined ? defaults : string(source, path === 'hostname' ? 63 : path.endsWith('allowedVlans') ? 200 : 160);
  }

  function description(model) {
    if (engine.describe) return engine.describe(model, {major: major()});
    const category = model.category.slug;
    return {platform: category === 'switch_l2' ? 'ios-l2' : category === 'switch_l3' ? 'ios-l3' : 'ios-router', cli: engine.supportsDevice(model), sections: [], coverage: []};
  }

  const exactRelease = (release, version) => typeof release === 'string' && /^\d+\.\d+(?:\.\d+){0,2}$/.test(release) && release.split('.')[0] === version;
  const evidenceId = value => typeof value === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}$/.test(value);
  const officialSources = sources => Array.isArray(sources) && sources.length > 0 && new Set(sources).size === sources.length && sources.every(url => typeof url === 'string' && /^https:\/\/tutorials\.ptnetacad\.net\/help\/default\/[A-Za-z0-9_./-]+\.html?$/.test(url) && url.split('/').slice(3).every(part => part !== '' && part !== '.' && part !== '..'));
  function sameSources(left, right) {
    if (!officialSources(left) || !officialSources(right) || left.length !== right.length) return false;
    const sorted = [...right].sort();
    return [...left].sort().every((url, index) => url === sorted[index]);
  }

  function commandVerification(model) {
    const version = major();
    if (!version) return {status: 'Unknown', reason: 'Choose a global version with official command documentation. All versions permits editing and BOM export, not executable CLI.'};
    try {
      const evidence = engine.verificationStatus?.(model, {major: version});
      if (evidence?.status === 'Documentation-backed' && evidence.model === model.pt_name && evidence.majorVersion === version && exactRelease(evidence.documentedRelease, version) && evidenceId(evidence.documentationRecordId) && officialSources(evidence.documentationSources)) return evidence;
      return {status: 'Unknown', reason: evidence?.reason || 'No matching official command documentation exists for this model and selected version.'};
    } catch (error) {
      return {status: 'Unknown', reason: 'Command documentation is unavailable. CLI generation is blocked.'};
    }
  }

  function matchingOutputEvidence(result, current) {
    if (!result || current?.status !== 'Documentation-backed' || !['Documentation-backed', 'Runtime-tested'].includes(result.status) || result.model !== current.model || result.majorVersion !== current.majorVersion || result.documentedRelease !== current.documentedRelease || result.documentationRecordId !== current.documentationRecordId || !sameSources(result.documentationSources, current.documentationSources)) return false;
    const runtime = result.runtime;
    if (result.status === 'Documentation-backed') return runtime?.status === 'Unknown' && runtime.observedRelease === null && runtime.recordId === null;
    return runtime?.status === 'Verified' && exactRelease(runtime.observedRelease, major()) && evidenceId(runtime.recordId) && current.runtime?.status === 'Verified' && current.runtime.observedRelease === runtime.observedRelease && Array.isArray(current.runtime.recordIds) && current.runtime.recordIds.includes(runtime.recordId);
  }

  function seedWorksheet(instance) {
    const info = description(device(instance.deviceId));
    if (info.platform !== 'gui-plan') return;
    const labels = new Set(instance.config.settings.map(row => row.label));
    (info.worksheetFields || []).forEach(definition => {
      if (!labels.has(definition.label) && instance.config.settings.length < MAX_ROWS) instance.config.settings.push({_id: nextId('r'), label: definition.label, value: ''});
    });
  }

  const SECTION_LABELS = {system: 'System and SSH', svis: 'Routed SVIs', protocols: 'Routing protocols', switching: 'Switching', dhcp: 'DHCP', acls: 'Access control lists', nat: 'NAT and PAT', asa: 'ASA configuration', settings: 'Manual configuration worksheet'};
  const FIELD_LABELS = {domainName: 'Domain name', enableSecret: 'Enable secret (session only)', users: 'Local users', secret: 'Secret (session only)', privilege: 'Privilege level', ssh: 'SSH', version: 'SSH version', rsaBits: 'RSA key bits', vtyStart: 'First VTY line', vtyEnd: 'Last VTY line', ipv6: 'IPv6 address / prefix', ipv6Routing: 'Enable IPv6 routing', encapsulation: 'Serial encapsulation', clockRate: 'Clock rate', dceConfirmed: 'DCE end confirmed in Packet Tracer', dot1qVlan: 'Subinterface VLAN', native: 'Native subinterface VLAN', helperAddress: 'DHCP relay address', natRole: 'NAT role', aclIn: 'Inbound ACL', aclOut: 'Outbound ACL', portfast: 'PortFast', bpduguard: 'BPDU guard', voiceVlan: 'Voice VLAN', portSecurity: 'Port security', maximum: 'Maximum MAC addresses', violation: 'Violation action', sticky: 'Sticky MAC learning', hsrp: 'HSRP', group: 'Group', priority: 'Priority', preempt: 'Preempt', processId: 'Process ID', routerId: 'Router ID', asn: 'AS number', remoteAs: 'Remote AS', wildcard: 'Wildcard mask', area: 'Area', neighbors: 'Neighbors', networks: 'Networks', stpMode: 'STP mode', priorities: 'STP priorities', channels: 'EtherChannels', members: 'Member interface names', pools: 'Pools', excluded: 'Excluded addresses', dns: 'DNS servers', domain: 'Domain name', entries: 'Rules', sourceWildcard: 'Source wildcard', destinationWildcard: 'Destination wildcard', destinationPort: 'Destination port', pat: 'PAT rules', inside: 'Inside address / interface', outside: 'Outside address / interface', nameif: 'Interface security name', securityLevel: 'Security level', sourceMask: 'Source subnet mask', destinationMask: 'Destination subnet mask', bindings: 'ACL interface bindings', objects: 'Network objects and NAT', dynamicInterface: 'Dynamic interface PAT', nextHop: 'Next-hop address', mask: 'Subnet mask', address: 'IP address', network: 'Network address', interface: 'Actual interface name', value: 'Value (session only)', vlan: 'VLAN ID'};
  const CHOICES = {
    'system.ssh.version': [['2', '2']],
    'interfaces.*.encapsulation': [['', 'Default'], ['hdlc', 'HDLC'], ['ppp', 'PPP']],
    'interfaces.*.natRole': [['', 'None'], ['inside', 'Inside'], ['outside', 'Outside']],
    'interfaces.*.portSecurity.violation': [['shutdown', 'Shutdown'], ['restrict', 'Restrict'], ['protect', 'Protect']],
    'switching.stpMode': [['', 'Unchanged'], ['pvst', 'PVST'], ['rapid-pvst', 'Rapid PVST']],
    'switching.channels.*.mode': [['on', 'On'], ['active', 'LACP active'], ['passive', 'LACP passive'], ['auto', 'PAgP auto'], ['desirable', 'PAgP desirable']],
    'acls.*.type': [['standard', 'Standard'], ['extended', 'Extended']],
    'asa.bindings.*.direction': [['in', 'Inbound'], ['out', 'Outbound']]
  };
  const NUMERIC_FIELDS = new Set(['privilege', 'rsaBits', 'vtyStart', 'vtyEnd', 'clockRate', 'dot1qVlan', 'voiceVlan', 'maximum', 'group', 'priority', 'processId', 'asn', 'remoteAs', 'securityLevel', 'vlan', 'destinationPort']);
  const labelFor = key => key === 'dns' ? 'DNS server' : FIELD_LABELS[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, character => character.toUpperCase());

  function nodeAt(path) {
    let node = selected()?.config;
    for (const key of path.split('.')) {
      if (key.startsWith('@')) node = Array.isArray(node) ? node.find(row => row._id === key.slice(1)) : null;
      else node = node && Object.prototype.hasOwnProperty.call(node, key) ? node[key] : null;
      if (node === null || node === undefined) return null;
    }
    return node;
  }

  function configControl(path, value, label = labelFor(path.split('.').at(-1))) {
    const key = path.split('.').at(-1), schema = schemaPath(path);
    if ((key === 'enableSecret' || key === 'secret') && description(device(selected().deviceId)).platform === 'asa') label = key === 'enableSecret' ? 'Enable password (session only)' : 'Password (session only)';
    const choices = CHOICES[schema] || (key === 'action' ? [['permit', 'Permit'], ['deny', 'Deny']] : key === 'protocol' ? [['ip', 'IP'], ['tcp', 'TCP'], ['udp', 'UDP'], ['icmp', 'ICMP']] : null);
    const attributes = `data-config-path="${esc(path)}"`;
    const worksheetRow = path.startsWith('settings.') ? nodeAt(path.slice(0, path.lastIndexOf('.'))) : null;
    const worksheetField = worksheetRow ? description(device(selected().deviceId)).worksheetFields?.find(field => field.label === worksheetRow.label) : null;
    if (worksheetField && key === 'label') return `<div class="field"><span>Setting</span><output>${esc(value)}</output></div>`;
    if (worksheetField && key === 'value') {
      const name = worksheetField.label + (worksheetField.readOnly ? ' (read-only)' : ' (session only)');
      if (worksheetField.type === 'checkbox') return `<label class="check-line"><input type="checkbox" ${attributes} data-value-type="worksheet-checkbox"${value === 'true' ? ' checked' : ''}${worksheetField.readOnly ? ' disabled' : ''}> ${esc(name)}</label>`;
      if (worksheetField.choices) return `<label class="field"><span>${esc(name)}</span><select ${attributes}${worksheetField.readOnly ? ' disabled' : ''}><option value="">Unspecified</option>${worksheetField.choices.map(choice => `<option value="${esc(choice)}"${String(value) === choice ? ' selected' : ''}>${esc(choice)}</option>`).join('')}</select></label>`;
      return `<label class="field"><span>${esc(name)}</span><input type="${worksheetField.type === 'password' ? 'password' : worksheetField.type === 'number' ? 'number' : 'text'}" ${attributes} value="${esc(value)}" maxlength="160"${worksheetField.type === 'number' ? ' step="1"' : ''}${worksheetField.type === 'password' ? ' autocomplete="new-password"' : ''}${worksheetField.readOnly ? ' readonly' : ''}></label>`;
    }
    if (typeof value === 'boolean') return `<label class="check-line"><input type="checkbox" ${attributes}${value ? ' checked' : ''}> ${esc(label)}</label>`;
    if (choices) return `<label class="field"><span>${esc(label)}</span><select ${attributes}>${choices.map(([name, text]) => `<option value="${name}"${String(value) === name ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
    const list = Array.isArray(value);
    const secret = /(^|\.)(enableSecret|secret)$/.test(path) || key === 'value' && /password|secret|passphrase|security key/i.test(worksheetRow?.label || '');
    const type = secret ? 'password' : typeof value === 'number' || NUMERIC_FIELDS.has(key) ? 'number' : 'text';
    return `<label class="field"><span>${esc(label)}</span><input type="${type}" ${attributes}${list ? ' data-value-type="list"' : ''} value="${esc(list ? value.join(', ') : value)}"${type === 'number' ? ' step="1"' : ' maxlength="160"'}${secret ? ' autocomplete="new-password"' : ''}></label>`;
  }

  function configNode(value, path) {
    if (Array.isArray(value)) {
      const factory = ROW_DEFAULTS[schemaPath(path)];
      if (!factory) return configControl(path, value);
      const rows = value.map((row, index) => `<fieldset class="builder-config-row" data-config-row="${esc(path + '.@' + row._id)}"><legend>${esc(labelFor(path.split('.').at(-1)))} ${index + 1}</legend>${configNode(row, path + '.@' + row._id)}${iconButton('remove-config-row', 'Remove ' + labelFor(path.split('.').at(-1)) + ' ' + (index + 1), 'trash', `data-config-list="${esc(path)}" data-row-id="${row._id}"`)}</fieldset>`).join('');
      const presets = path === 'settings' ? (description(device(selected().deviceId)).worksheetFields || []) : [];
      const picker = presets.length ? `<div class="builder-toolbar"><label class="field"><span>Known setting</span><select id="builderSettingPicker"><option value="">Select setting</option>${presets.map(field => `<option value="${esc(field.label)}">${esc(field.label)}</option>`).join('')}</select></label>${button('add-setting', 'Add setting', 'plus')}</div>` : '';
      return `<div class="builder-config-list" data-config-list="${esc(path)}">${rows}${picker}${button('add-config-row', path === 'settings' ? 'Add custom setting' : 'Add ' + labelFor(path.split('.').at(-1)), 'plus', `data-config-list="${esc(path)}"`)}</div>`;
    }
    if (value && typeof value === 'object') {
      const fields = [], groups = [];
      Object.entries(value).filter(([key]) => key !== '_id').forEach(([key, item]) => {
        if (key === 'privilege' && path.startsWith('system.users.') && description(device(selected().deviceId)).platform === 'asa') return;
        const childPath = path ? path + '.' + key : key;
        if (item && typeof item === 'object') groups.push(`<fieldset class="builder-config-group"><legend>${esc(labelFor(key))}</legend>${configNode(item, childPath)}</fieldset>`);
        else fields.push(configControl(childPath, item));
      });
      return `<div class="builder-fields">${fields.join('')}</div>${groups.join('')}`;
    }
    return configControl(path, value);
  }

  function extendedSections(instance, info) {
    return (info.sections || []).filter(key => SECTION_LABELS[key] && Object.prototype.hasOwnProperty.call(instance.config, key)).map(key => {
      const title = key === 'system' && info.platform === 'asa' ? 'System and users' : SECTION_LABELS[key];
      const value = key === 'system' && info.platform === 'asa' ? Object.fromEntries(Object.entries(instance.config.system).filter(([name]) => name !== 'ssh')) : instance.config[key];
      return `<details class="builder-config-section"><summary>${esc(title)}</summary><fieldset id="builderConfig-${key}"><legend class="sr-only">${esc(title)}</legend>${configNode(value, key)}</fieldset></details>`;
    }).join('');
  }

  function coverageMarkup(info) {
    const sources = (info.sources || []).filter(url => /^https?:\/\//i.test(url)).map((url, index) => `<a href="${esc(url)}" target="_blank" rel="noopener">Command reference ${index + 1}</a>`).join(' · ');
    return `<details class="builder-coverage"><summary>Configuration coverage (${(info.coverage || []).length})</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>Feature</th><th>Builder coverage</th><th>Evidence</th><th>Scope</th></tr></thead><tbody>${(info.coverage || []).map(row => `<tr><td>${esc(row.name)}</td><td>${esc(row.kind)}</td><td>${esc(row.status)}</td><td>${esc(row.reason)}</td></tr>`).join('')}</tbody></table></div>${sources ? '<p>' + sources + '</p>' : ''}</details>`;
  }

  function renderConfigSection(path) {
    if (path.startsWith('interfaces.')) { renderRows('interfaces'); return; }
    const key = path.split('.')[0], container = mount.querySelector('#builderConfig-' + key);
    if (container) {
      const value = key === 'system' && description(device(selected().deviceId)).platform === 'asa' ? Object.fromEntries(Object.entries(selected().config.system).filter(([name]) => name !== 'ssh')) : selected().config[key];
      container.innerHTML = configNode(value, key);
    }
  }

  function handleConfigField(target) {
    const path = target.dataset.configPath, split = path.lastIndexOf('.');
    const parent = split === -1 ? selected()?.config : nodeAt(path.slice(0, split));
    const key = split === -1 ? path : path.slice(split + 1);
    if (!parent || !Object.prototype.hasOwnProperty.call(parent, key) || key === '_id') return;
    parent[key] = target.dataset.valueType === 'worksheet-checkbox' ? target.checked ? 'true' : 'false' : target.type === 'checkbox' ? target.checked : target.dataset.valueType === 'list' ? target.value.split(',').map(value => value.trim()).filter(Boolean).slice(0, MAX_ROWS) : target.value;
    if (path.startsWith('settings.') && key === 'label') {
      const valueControl = mount.querySelector(`[data-config-path="${esc(path.slice(0, split) + '.value')}"]`);
      if (valueControl) valueControl.setAttribute('type', /password|secret|passphrase|security key/i.test(parent.label) ? 'password' : 'text');
    }
    if (path.startsWith('asa.interfaces.') && key === 'name') resetConfirmation();
    if (path.startsWith('svis.') && key === 'vlan') resetConfirmation();
    changed();
  }

  function restore() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return '';
      if (raw.length > MAX_STORAGE) throw new Error('Saved selection exceeds its size limit.');
      const saved = JSON.parse(raw);
      if (saved.schema !== 1 || !Array.isArray(saved.instances) || !Array.isArray(saved.parts)) throw new Error('Saved selection uses an unsupported format.');
      const instances = saved.instances.slice(0, MAX_ITEMS).filter(item => item && device(item.deviceId));
      const oldToNew = new Map();
      state.instances = instances.map((item, index) => {
        const id = nextId('i');
        if (typeof item.id === 'string' && !oldToNew.has(item.id)) oldToNew.set(item.id, id);
        const instance = {id, deviceId: Number(item.deviceId), config: cleanConfig(item.config, device(item.deviceId), index + 1)};
        seedWorksheet(instance);
        return instance;
      });
      state.parts = saved.parts.slice(0, MAX_ITEMS).filter(part => part && moduleById(part.moduleId) && Number.isInteger(part.quantity) && part.quantity >= 1 && part.quantity <= 99).map(part => ({id: nextId('p'), moduleId: Number(part.moduleId), quantity: part.quantity, instanceId: oldToNew.get(part.instanceId) || null}));
      state.selectedId = oldToNew.get(saved.selectedId) || state.instances[0]?.id || null;
      return instances.length !== saved.instances.length || state.parts.length !== saved.parts.length ? 'Saved selection contained invalid catalogue entries; those entries were not restored.' : '';
    } catch (error) {
      state = {nextId: 1, instances: [], parts: [], selectedId: null};
      return 'Selection storage is unavailable or invalid. This session can still be used.';
    }
  }

  function save() {
    const instances = state.instances.map(instance => ({id: instance.id, deviceId: instance.deviceId, config: cleanNode(instance.config, engine.createConfig(device(instance.deviceId)), '', false)}));
    const payload = JSON.stringify({schema: 1, instances, parts: state.parts, selectedId: state.selectedId});
    try {
      if (payload.length > MAX_STORAGE) throw new Error('Selection is too large to save.');
      window.localStorage.setItem(STORAGE_KEY, payload);
      storageWarning = '';
    } catch (error) { storageWarning = 'Selection could not be saved locally. Changes remain in this session.'; }
    renderStatus();
  }

  function status(message, kind = '') {
    selectionMessage = message;
    selectionKind = kind;
    renderStatus();
  }

  function renderStatus() {
    elements.selectionStatus.textContent = [selectionMessage, storageWarning].filter(Boolean).join(' ');
    const kind = storageWarning ? 'warning' : selectionKind;
    elements.selectionStatus.className = 'builder-status' + (kind ? ' ' + kind : '');
  }

  function notifyCount() {
    const count = state.instances.length + state.parts.reduce((total, part) => total + part.quantity, 0);
    elements.count.textContent = state.instances.length + ' devices · ' + state.parts.reduce((total, part) => total + part.quantity, 0) + ' parts';
    elements.bom.disabled = !count;
    elements.clear.disabled = !count;
    if (settings.onCountChange) settings.onCountChange(count);
  }

  function invalidate() {
    revision++;
    output = null;
    elements.preview.value = '';
    elements.verification.value = '';
    elements.copy.disabled = true;
    elements.download.disabled = true;
    const instance = selected(), model = instance && device(instance.deviceId);
    const verification = model && description(model).cli ? commandVerification(model) : null;
    elements.errors.textContent = verification?.status === 'Unknown' ? 'CLI generation blocked: ' + verification.reason : '';
    elements.warnings.textContent = '';
    elements.outputStatus.textContent = verification?.status === 'Unknown' ? 'Generation blocked' : instance ? 'Not generated' : '';
  }

  function availabilityLabel(model) {
    const version = major();
    if (!version) return '';
    const available = model.version_profiles?.[version]?.availability?.available;
    return available === false ? ` (not available in ${version}.x)` : available !== true ? ` (availability not verified for ${version}.x)` : '';
  }

  function deviceAvailable(model) {
    return !major() || model.version_profiles?.[major()]?.availability?.available !== false;
  }

  function moduleEvidence(part) {
    const version = major();
    if (!version) return {status: 'Unknown', label: 'combined / unverified'};
    const facts = db.devices.filter(model => model.version_profiles?.[version]?.availability?.available === true).flatMap(model => model.version_profiles[version].modules || []).filter(row => row.module_id === part.module_id && row.compatible !== false && row.compatible !== 0 && scopedRow(row, version));
    if (facts.some(row => row.verification_status === 'Verified')) return {status: 'Verified', label: 'verified compatibility evidence'};
    if (facts.length) return {status: 'Partial', label: 'partial compatibility evidence'};
    return {status: 'Unknown', label: `not verified for ${version}.x`};
  }

  function scopedRow(row, version) {
    if (row.major_version !== null && row.major_version !== undefined) return String(row.major_version) === version;
    const recordedMajor = typeof row.version === 'string' ? row.version.match(/^(\d+)/)?.[1] : null;
    return !recordedMajor || recordedMajor === version;
  }

  function renderPickers() {
    const deviceId = elements.devicePicker.value;
    const moduleId = elements.modulePicker.value;
    elements.devicePicker.innerHTML = '<option value="">Select device</option>' + db.devices.filter(deviceAvailable).map(model => `<option value="${model.device_id}">${esc(model.display_name + availabilityLabel(model))}</option>`).join('');
    const known = [], unknown = [];
    db.modules.forEach(part => {
      const evidence = moduleEvidence(part);
      const option = `<option value="${part.module_id}">${esc(part.model + ' (' + evidence.label + ')')}</option>`;
      (evidence.status === 'Unknown' ? unknown : known).push(option);
    });
    elements.modulePicker.innerHTML = '<option value="">Select part</option>' + (known.length ? '<optgroup label="Scoped compatibility evidence">' + known.join('') + '</optgroup>' : '') + (unknown.length ? '<optgroup label="Not verified">' + unknown.join('') + '</optgroup>' : '');
    elements.devicePicker.value = device(deviceId) && deviceAvailable(device(deviceId)) ? deviceId : '';
    elements.modulePicker.value = moduleById(moduleId) ? moduleId : '';
    renderAttachmentPicker();
  }

  function attachmentOptions(value) {
    return '<option value="">Loose part</option>' + state.instances.map(instance => `<option value="${instance.id}"${instance.id === value ? ' selected' : ''}>${esc(instance.config.hostname || device(instance.deviceId).display_name)} · ${esc(device(instance.deviceId).pt_name)}</option>`).join('');
  }

  function renderAttachmentPicker() {
    const previous = elements.attachPicker.value;
    elements.attachPicker.innerHTML = attachmentOptions(previous);
    elements.attachPicker.value = state.instances.some(item => item.id === previous) ? previous : '';
  }

  function renderCart() {
    elements.devices.innerHTML = state.instances.length ? state.instances.map(instance => {
      const model = device(instance.deviceId);
      const name = instance.config.hostname || model.display_name;
      return `<li class="builder-device-item"><button type="button" data-action="select" data-instance-id="${instance.id}" aria-pressed="${instance.id === state.selectedId}"><strong>${esc(name)}</strong><span>${esc(model.display_name + availabilityLabel(model))}</span></button><div class="builder-row-actions">${iconButton('duplicate', 'Duplicate ' + name, 'copy', `data-instance-id="${instance.id}"`)}${iconButton('remove-device', 'Remove ' + name, 'trash', `data-instance-id="${instance.id}"`)}</div></li>`;
    }).join('') : '<li class="muted">No devices selected.</li>';
    renderAttachmentPicker();
    notifyCount();
  }

  function partAssessment(part, quantity = part.quantity, instanceId = part.instanceId, ignoredId = part.id) {
    const errors = [], warnings = [];
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return {errors: ['Part quantity must be an integer from 1 to 99.'], warnings};
    if (!instanceId) {
      const evidence = moduleEvidence(moduleById(part.moduleId));
      if (evidence.status !== 'Verified') warnings.push(moduleById(part.moduleId).model + ': ' + evidence.label + '.');
      return {errors, warnings};
    }
    const instance = state.instances.find(item => item.id === instanceId);
    if (!instance) return {errors: ['The attached device no longer exists.'], warnings};
    const version = major(), model = device(instance.deviceId), name = moduleById(part.moduleId).model;
    const profile = version ? model.version_profiles?.[version] : null;
    const compatible = profile?.availability?.available === true ? profile.modules?.find(item => item.module_id === part.moduleId && scopedRow(item, version)) : null;
    if (!version) warnings.push(`${name}: All versions combines evidence; installed-module compatibility is unverified.`);
    else if (!profile || profile.availability?.available !== true || !compatible) warnings.push(`${name}: compatibility is not verified for this device in the selected version. No cross-version compatibility was used.`);
    if (compatible) {
      if (compatible.compatible === false || compatible.compatible === 0) errors.push(`${name}: recorded as incompatible with this device in ${version}.x.`);
      if (compatible.verification_status !== 'Verified') warnings.push(`${name}: ${compatible.verification_status || 'Unknown'} compatibility evidence; confirm the installed module and slot.`);
      const maximum = compatible.max_quantity;
      const others = state.parts.filter(item => item.id !== ignoredId && item.instanceId === instanceId && item.moduleId === part.moduleId).reduce((total, item) => total + item.quantity, 0);
      if (Number.isInteger(maximum) && maximum >= 0 && quantity + others > maximum) errors.push(`${name}: recorded maximum is ${maximum} for this device in ${version}.x.`);
    }
    return {errors, warnings};
  }

  function renderParts() {
    invalidParts.clear();
    elements.parts.innerHTML = state.parts.length ? state.parts.map(part => {
      const assessment = partAssessment(part);
      return `<li class="builder-part-item"><strong>${esc(moduleById(part.moduleId).model)}</strong><div class="builder-fields"><label class="field"><span>Quantity</span><input type="number" min="1" max="99" step="1" value="${part.quantity}" data-part-field="quantity" data-part-id="${part.id}" aria-label="${esc(moduleById(part.moduleId).model)} quantity"></label><label class="field"><span>Attach to</span><select data-part-field="instanceId" data-part-id="${part.id}" aria-label="${esc(moduleById(part.moduleId).model)} attached device">${attachmentOptions(part.instanceId)}</select></label>${iconButton('remove-part', 'Remove ' + moduleById(part.moduleId).model, 'trash', `data-part-id="${part.id}"`)}</div><div class="builder-part-evidence muted" data-part-evidence="${part.id}">${esc([...assessment.errors, ...assessment.warnings].join(' '))}</div></li>`;
    }).join('') : '<li class="muted">No parts selected.</li>';
  }

  function field(label, name, value, options = {}) {
    const attributes = `data-field="${name}"${options.kind ? ` data-row-kind="${options.kind}" data-row-id="${options.rowId}"` : ''}`;
    if (options.type === 'checkbox') return `<label class="check-line"><input type="checkbox" ${attributes}${value ? ' checked' : ''}> ${esc(label)}</label>`;
    if (options.choices) return `<label class="field"><span>${esc(label)}</span><select ${attributes}>${options.choices.map(([key, text]) => `<option value="${esc(key)}"${String(value) === key ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
    return `<label class="field"><span>${esc(label)}</span><input type="${options.type || 'text'}" ${attributes} value="${esc(value)}"${options.max ? ` maxlength="${options.max}"` : ''}${options.inputmode ? ` inputmode="${options.inputmode}"` : ''}${options.placeholder ? ` placeholder="${esc(options.placeholder)}"` : ''}${options.min !== undefined ? ` min="${options.min}"` : ''}${options.maxValue !== undefined ? ` max="${options.maxValue}"` : ''}${options.step !== undefined ? ` step="${options.step}"` : ''}></label>`;
  }

  function capabilities(instance = selected()) {
    if (!instance) return {};
    const info = description(device(instance.deviceId));
    const switchModule = state.parts.some(part => part.instanceId === instance.id && ['HWIC-4ESW', 'NM-ESW-161', 'NIM-ES2-4'].includes(moduleById(part.moduleId).model) && part.quantity >= 1);
    const l2 = info.platform === 'ios-l2', multilayer = info.platform === 'ios-l3', router = info.platform === 'ios-router';
    return {l2, multilayer, router, vlans: info.vlanCreation ?? (l2 || multilayer), switched: l2 || multilayer || info.builtInSwitching || switchModule, routed: router || multilayer};
  }

  function rowMarkup(kind, row) {
    const options = {kind, rowId: row._id};
    const input = (label, key, extra = {}) => field(label, key, row[key], {...options, ...extra});
    const remove = iconButton('remove-row', 'Remove ' + (kind === 'interfaces' ? 'interface' : kind === 'vlans' ? 'VLAN' : 'route'), 'trash', `data-row-kind="${kind}" data-row-id="${row._id}"`);
    const vlanInput = {type: 'number', min: 1, maxValue: 1001, step: 1, inputmode: 'numeric'};
    if (kind === 'vlans') return `<div class="builder-row" data-row-id="${row._id}">${input('VLAN ID', 'id', vlanInput)}${input('VLAN name', 'name', {max: 32})}${remove}</div>`;
    if (kind === 'routes') return `<div class="builder-row" data-row-id="${row._id}">${input('Network', 'network', {max: 45})}${input('Subnet mask', 'mask', {max: 45})}${input('Next-hop address', 'nextHop', {max: 80})}${remove}</div>`;
    const permissions = capabilities();
    const choices = [...(permissions.routed ? [['routed', 'Routed']] : []), ...(permissions.switched ? [['access', 'Access'], ['trunk', 'Trunk']] : [])];
    if (!choices.some(([key]) => key === row.mode)) choices.push([row.mode, row.mode + ' (unavailable)']);
    const existing = permissions.vlans ? '' : ' (existing)';
    const servicesByName = {ipv6: ['ipv6'], serial: ['encapsulation', 'clockRate', 'dceConfirmed'], subinterface: ['dot1qVlan', 'native'], helperAddress: ['helperAddress'], natRole: ['natRole'], acl: ['aclIn', 'aclOut'], hsrp: ['hsrp'], switchport: ['portfast', 'bpduguard', 'voiceVlan', 'portSecurity']};
    const allowed = new Set((description(device(selected().deviceId)).interfaceServices || []).filter(name => name !== 'switchport' || permissions.switched).flatMap(name => servicesByName[name] || []));
    const extras = Object.fromEntries(Object.entries(row).filter(([key, value]) => !['_id', 'name', 'mode', 'address', 'mask', 'description', 'vlan', 'allowedVlans', 'nativeVlan', 'shutdown'].includes(key) && (allowed.has(key) || JSON.stringify(value) !== JSON.stringify(ROW_DEFAULTS.interfaces[key]))));
    const accessKeys = ['portfast', 'bpduguard', 'voiceVlan', 'portSecurity'];
    const accessServices = Object.fromEntries(Object.entries(extras).filter(([key]) => accessKeys.includes(key)));
    const routedServices = Object.fromEntries(Object.entries(extras).filter(([key]) => !accessKeys.includes(key)));
    const services = Object.keys(extras).length ? `<details class="builder-interface-services"${row.mode === 'trunk' || row.mode === 'access' && !Object.keys(accessServices).length || row.mode === 'routed' && !Object.keys(routedServices).length ? ' hidden' : ''}><summary>Interface services</summary><div data-service-modes="routed"${row.mode !== 'routed' ? ' hidden' : ''}>${configNode(routedServices, 'interfaces.@' + row._id)}</div><div data-service-modes="access"${row.mode !== 'access' ? ' hidden' : ''}>${configNode(accessServices, 'interfaces.@' + row._id)}</div></details>` : '';
    return `<div class="builder-interface-row" data-row-id="${row._id}"><div class="builder-row">${input('Actual interface name', 'name', {max: 80})}${input('Mode', 'mode', {choices})}${input('Description', 'description', {max: 160})}${input('Shutdown', 'shutdown', {type: 'checkbox'})}${remove}</div><div class="builder-fields" data-modes="routed"${row.mode !== 'routed' ? ' hidden' : ''}>${input('IPv4 address', 'address', {max: 45})}${input('Subnet mask', 'mask', {max: 45})}</div><div class="builder-fields" data-modes="access"${row.mode !== 'access' ? ' hidden' : ''}>${input('Access VLAN' + existing, 'vlan', vlanInput)}</div><div class="builder-fields" data-modes="trunk"${row.mode !== 'trunk' ? ' hidden' : ''}>${input('Allowed VLANs' + existing, 'allowedVlans', {max: 200, placeholder: '10,20-30'})}${input('Native VLAN' + existing, 'nativeVlan', vlanInput)}</div>${services}</div>`;
  }

  function renderRows(kind) {
    const instance = selected(), container = mount.querySelector('#builderRows-' + kind);
    if (container) container.innerHTML = instance.config[kind].map(row => rowMarkup(kind, row)).join('');
  }

  function renderContext() {
    const instance = selected();
    const context = mount.querySelector('#builderContext');
    if (!context || !instance) return;
    const model = device(instance.deviceId), version = major();
    const available = version ? model.version_profiles?.[version]?.availability : null;
    const messages = [];
    if (!version) messages.push('All versions: combined inventory context.');
    else if (available?.available === false) messages.push(`This device is not available in ${version}.x. It remains in the selection list.`);
    else if (available?.available !== true) messages.push(`Device availability is not verified for ${version}.x.`);
    else messages.push(`Packet Tracer ${version}.x inventory availability: ${available.verification_status || 'Unknown'}.`);
    if (available?.observed_release) messages.push(`Inventory observed release: ${available.observed_release}.`);
    if (!engine.supportsDevice(model)) messages.push('Configuration generation is unavailable for this device. It remains in the selection list.');
    const info = description(model), permissions = capabilities(instance);
    const verification = info.cli ? commandVerification(model) : null;
    if (verification) messages.push(verification.status === 'Documentation-backed' ? `Command syntax: Documentation-backed for Packet Tracer ${verification.documentedRelease}. Runtime testing is separate.` : 'Command syntax: Unknown. ' + verification.reason);
    if (permissions.router && !permissions.switched && (instance.config.vlans.length || instance.config.interfaces.some(row => row.mode !== 'routed'))) messages.push('An EtherSwitch module is required for the retained VLAN/switchport configuration. Remove those rows or attach a suitable module.');
    if (permissions.router && !permissions.vlans && instance.config.vlans.length) messages.push('Router drafts reference existing VLANs; remove VLAN creation rows.');
    if (info.platform === 'gui-plan') messages.push('Manual worksheet only; not executable Cisco CLI. Worksheet values are session-only.');
    context.textContent = messages.join(' ');
    elements.generate.disabled = !engine.supportsDevice(model) || !deviceAvailable(model) || info.cli && verification.status !== 'Documentation-backed';
    elements.generate.innerHTML = icon(info.cli ? 'terminal' : 'download') + (info.cli ? 'Generate selected device' : 'Generate worksheet');
    const cfg = elements.format.querySelector('option[value="cfg"]');
    if (cfg) cfg.disabled = !info.cli;
    if (!info.cli) elements.format.value = 'txt';
    const txt = elements.format.querySelector('option[value="txt"]');
    if (txt) txt.textContent = info.cli ? '.txt · CLI script' : '.txt · Manual worksheet';
    elements.preview.closest('label').querySelector('span').textContent = info.cli ? 'Configuration preview' : 'Manual configuration worksheet preview';
    const verificationLabel = info.cli ? 'Verification commands' : 'Verification checklist';
    elements.verification.closest('label').querySelector('span').textContent = verificationLabel;
    elements.verification.closest('details').querySelector('summary').textContent = verificationLabel;
    const coverage = mount.querySelector('#builderCoverage');
    if (coverage) coverage.innerHTML = coverageMarkup(info);
  }

  function renderEditor() {
    const instance = selected();
    if (!instance) { elements.editor.innerHTML = '<p class="muted">No device selected.</p>'; elements.generate.disabled = true; return; }
    const model = device(instance.deviceId), supported = engine.supportsDevice(model), info = description(model);
    const management = instance.config.management;
    const permissions = capabilities(instance);
    const section = (kind, label, disabled = false) => `<details open><summary>${label}</summary><fieldset><legend class="sr-only">${label}</legend><div id="builderRows-${kind}"></div>${button('add-row', 'Add ' + (kind === 'vlans' ? 'VLAN' : kind === 'interfaces' ? 'interface' : 'route'), 'plus', `data-row-kind="${kind}"${disabled ? ' disabled' : ''}`)}</fieldset></details>`;
    const sections = supported ? [
      info.cli ? `<div class="builder-fields">${permissions.multilayer ? field('Enable IP routing', 'enableRouting', instance.config.enableRouting, {type: 'checkbox'}) : ''}${permissions.routed ? configControl('ipv6Routing', instance.config.ipv6Routing) : ''}${field('Interfaces, module slots and port roles confirmed in Packet Tracer', 'interfacesConfirmed', instance.config.interfacesConfirmed, {type: 'checkbox'})}</div>` : '',
      info.sections.includes('vlans') && (permissions.vlans || instance.config.vlans.length) ? section('vlans', 'VLANs', !permissions.vlans) : '',
      info.sections.includes('interfaces') ? section('interfaces', 'Interfaces') : '',
      permissions.l2 ? `<details><summary>L2 management SVI</summary><fieldset><legend class="sr-only">L2 management SVI</legend>${field('Enable management SVI', 'management.enabled', management.enabled, {type: 'checkbox'})}<div class="builder-fields" id="builderManagementFields"${management.enabled ? '' : ' hidden'}>${field('Management VLAN', 'management.vlan', management.vlan, {max: 4, inputmode: 'numeric'})}${field('IPv4 address', 'management.address', management.address, {max: 45})}${field('Subnet mask', 'management.mask', management.mask, {max: 45})}${field('Default gateway', 'management.gateway', management.gateway, {max: 45})}</div></fieldset></details>` : '',
      info.sections.includes('routes') ? section('routes', 'Static routes') : '',
      extendedSections(instance, info)
    ].join('') : '';
    elements.editor.innerHTML = `<form id="builderForm"><div class="builder-fields">${field('Hostname', 'hostname', instance.config.hostname, {max: 63})}<div class="field"><span>Device model</span><output>${esc(model.display_name)}</output></div></div><p id="builderContext" class="builder-status warning" role="status"></p>${sections}</form><div id="builderCoverage">${coverageMarkup(info)}</div>`;
    if (supported) ['vlans', 'interfaces', 'routes'].forEach(renderRows);
    renderContext();
  }

  function changed({cart = false, parts = false} = {}) {
    invalidate();
    renderContext();
    if (cart) renderCart();
    if (parts) renderParts();
    save();
  }

  function resetConfirmation(instance = selected()) {
    if (!instance) return;
    instance.config.interfacesConfirmed = false;
    if (instance.id === state.selectedId) {
      const confirmation = mount.querySelector('[data-field="interfacesConfirmed"]');
      if (confirmation) confirmation.checked = false;
    }
  }

  function addDevice(id) {
    if (!initialized) return null;
    const model = device(id);
    if (!model) { status('Device was not found.', 'warning'); return null; }
    if (!deviceAvailable(model)) { status(`This device is not available in Packet Tracer ${major()}.x.`, 'warning'); return null; }
    if (state.instances.length >= MAX_ITEMS) { status(`Selection limit is ${MAX_ITEMS} device instances.`, 'warning'); return null; }
    const instance = {id: nextId('i'), deviceId: model.device_id, config: cleanConfig(engine.createConfig(model, state.instances.length + 1), model, state.instances.length + 1)};
    seedWorksheet(instance);
    instance.config.hostname = uniqueHostname(instance.config.hostname);
    state.instances.push(instance);
    state.selectedId = instance.id;
    changed({cart: true, parts: true});
    renderEditor();
    status(model.display_name + ' added to the selection.');
    return instance.id;
  }

  function insertPart(moduleId, instanceId, initialMessage = '') {
    const model = moduleById(moduleId);
    if (!model) { status('Part was not found.', 'warning'); return null; }
    const existing = state.parts.find(part => part.moduleId === model.module_id && part.instanceId === instanceId);
    if (!existing && state.parts.length >= MAX_ITEMS) { status(`Selection limit is ${MAX_ITEMS} part entries.`, 'warning'); return null; }
    const part = existing || {id: nextId('p'), moduleId: model.module_id, quantity: 0, instanceId};
    const assessment = partAssessment(part, part.quantity + 1);
    if (assessment.errors.length) { status(assessment.errors.join(' '), 'warning'); return null; }
    if (!existing) state.parts.push(part);
    part.quantity++;
    if (instanceId) resetConfirmation(state.instances.find(item => item.id === instanceId));
    invalidParts.delete(part.id);
    changed({cart: true, parts: true});
    renderEditor();
    status([model.model + ' added.', initialMessage, ...assessment.warnings].filter(Boolean).join(' '), assessment.warnings.length || initialMessage ? 'warning' : '');
    return part.id;
  }

  function addModule(id, deviceId) {
    if (!initialized) return null;
    let instanceId = null, message = '';
    if (deviceId !== undefined && deviceId !== null) {
      const active = selected();
      const instance = active?.deviceId === Number(deviceId) ? active : state.instances.find(item => item.deviceId === Number(deviceId));
      instanceId = instance?.id || null;
      if (!instance) message = 'No matching device instance is selected; the module was added as a loose part.';
    }
    return insertPart(id, instanceId, message);
  }

  function handleField(target) {
    const instance = selected();
    if (!instance) return;
    const name = target.dataset.field, value = target.type === 'checkbox' ? target.checked : target.value;
    const kind = target.dataset.rowKind;
    if (kind) {
      const row = instance.config[kind]?.find(item => item._id === target.dataset.rowId);
      if (!row || !Object.prototype.hasOwnProperty.call(row, name) || name === '_id') return;
      row[name] = value;
      if (kind === 'interfaces' && (name === 'name' || name === 'mode')) resetConfirmation(instance);
      if (name === 'mode') {
        const container = target.closest('.builder-interface-row');
        const inactive = value === 'routed' ? ['vlan', 'allowedVlans', 'nativeVlan'] : value === 'access' ? ['address', 'mask', 'allowedVlans', 'nativeVlan'] : ['address', 'mask', 'vlan'];
        const serviceKeys = value === 'routed' ? ['portfast', 'bpduguard', 'voiceVlan', 'portSecurity'] : ['ipv6', 'encapsulation', 'clockRate', 'dceConfirmed', 'dot1qVlan', 'native', 'helperAddress', 'natRole', 'aclIn', 'aclOut', 'hsrp', ...(value === 'trunk' ? ['portfast', 'bpduguard', 'voiceVlan', 'portSecurity'] : [])];
        const cleared = inactive.some(key => row[key] !== '') || serviceKeys.some(key => JSON.stringify(row[key]) !== JSON.stringify(ROW_DEFAULTS.interfaces[key]));
        inactive.forEach(key => { row[key] = ''; const input = container?.querySelector(`[data-field="${key}"]`); if (input) input.value = ''; });
        serviceKeys.forEach(key => { row[key] = JSON.parse(JSON.stringify(ROW_DEFAULTS.interfaces[key])); });
        container?.querySelectorAll('[data-config-path]').forEach(input => { const current = nodeAt(input.dataset.configPath); if (input.type === 'checkbox') input.checked = current; else input.value = current; });
        container?.querySelectorAll('[data-modes]').forEach(section => { section.hidden = section.dataset.modes !== value; });
        container?.querySelectorAll('[data-service-modes]').forEach(section => { section.hidden = section.dataset.serviceModes !== value; });
        const services = container?.querySelector('.builder-interface-services');
        if (services) services.hidden = !services.querySelector(`[data-service-modes="${value}"]`)?.querySelector('[data-config-path]');
        if (cleared) status('Mode changed; fields not used by this mode were cleared.');
      }
    } else if (name.startsWith('management.')) {
      const key = name.slice(11);
      if (!Object.prototype.hasOwnProperty.call(instance.config.management, key)) return;
      instance.config.management[key] = value;
      if (key === 'enabled') { mount.querySelector('#builderManagementFields').hidden = !value; resetConfirmation(instance); }
      if (key === 'vlan') resetConfirmation(instance);
    } else if (['hostname', 'enableRouting', 'interfacesConfirmed'].includes(name)) instance.config[name] = value;
    else return;
    changed({cart: name === 'hostname'});
    if (name === 'hostname') {
      elements.parts.querySelectorAll('select[data-part-field="instanceId"] option').forEach(option => {
        const attached = state.instances.find(item => item.id === option.value);
        if (attached) option.textContent = (attached.config.hostname || device(attached.deviceId).display_name) + ' · ' + device(attached.deviceId).pt_name;
      });
    }
  }

  function handlePart(target) {
    const part = state.parts.find(item => item.id === target.dataset.partId);
    if (!part) return;
    const previousCapabilities = JSON.stringify(capabilities());
    const quantity = target.dataset.partField === 'quantity' ? Number(target.value) : part.quantity;
    const instanceId = target.dataset.partField === 'instanceId' ? target.value || null : part.instanceId;
    const assessment = partAssessment(part, quantity, instanceId);
    invalidate();
    const message = mount.querySelector(`[data-part-evidence="${part.id}"]`);
    if (message) message.textContent = [...assessment.errors, ...assessment.warnings].join(' ');
    if (assessment.errors.length) {
      invalidParts.add(part.id);
      target.setAttribute('aria-invalid', 'true');
      target.setCustomValidity?.(assessment.errors.join(' '));
      status(assessment.errors.join(' '), 'warning');
      return;
    }
    invalidParts.delete(part.id);
    target.removeAttribute('aria-invalid');
    target.setCustomValidity?.('');
    const previousInstanceId = part.instanceId;
    const previousQuantity = part.quantity;
    part.quantity = quantity;
    part.instanceId = instanceId;
    if (previousInstanceId !== instanceId) {
      resetConfirmation(state.instances.find(item => item.id === previousInstanceId));
      resetConfirmation(state.instances.find(item => item.id === instanceId));
    }
    if (quantity !== previousQuantity && instanceId) resetConfirmation(state.instances.find(item => item.id === instanceId));
    if (JSON.stringify(capabilities()) !== previousCapabilities) renderEditor();
    notifyCount();
    save();
    status(assessment.warnings.join(' '), assessment.warnings.length ? 'warning' : '');
  }

  function addRow(kind) {
    const instance = selected();
    if (!instance || !['vlans', 'interfaces', 'routes'].includes(kind)) return;
    if (kind === 'vlans' && !capabilities(instance).vlans) return;
    if (instance.config[kind].length >= MAX_ROWS) { status(`Each section allows at most ${MAX_ROWS} rows.`, 'warning'); return; }
    const row = JSON.parse(JSON.stringify(ROW_DEFAULTS[kind]));
    if (kind === 'interfaces') row.mode = capabilities().l2 ? 'access' : 'routed';
    row._id = nextId('r');
    instance.config[kind].push(row);
    if (kind === 'interfaces') resetConfirmation(instance);
    changed();
    renderRows(kind);
    mount.querySelector(`[data-row-id="${row._id}"] input`)?.focus();
  }

  function generate() {
    invalidate();
    const instance = selected();
    if (!instance) return;
    const model = device(instance.deviceId), info = description(model);
    const verification = info.cli ? commandVerification(model) : null;
    if (verification?.status !== 'Documentation-backed' && info.cli) {
      elements.errors.textContent = 'CLI generation blocked: ' + verification.reason;
      elements.outputStatus.textContent = 'Generation blocked';
      return;
    }
    const parts = state.parts.filter(part => part.instanceId === instance.id);
    const assessments = parts.map(part => partAssessment(part));
    const errors = assessments.flatMap(item => item.errors);
    if (invalidParts.size) errors.push('Correct invalid part quantities or attachments before generation.');
    if (!deviceAvailable(device(instance.deviceId))) errors.push(`This device is not available in Packet Tracer ${major()}.x.`);
    if (errors.length) { elements.errors.textContent = errors.join('\n'); return; }
    const moduleQuantities = new Map();
    parts.forEach(part => moduleQuantities.set(part.moduleId, (moduleQuantities.get(part.moduleId) || 0) + part.quantity));
    const item = {id: instance.id, deviceId: instance.deviceId, config: instance.config, modules: Array.from(moduleQuantities, ([moduleId, quantity]) => ({moduleId, quantity}))};
    let result;
    try { result = engine.generate(item, device(instance.deviceId), {major: major(), format: elements.format.value}); }
    catch (error) { elements.errors.textContent = 'Configuration generation failed. No output was retained.'; return; }
    elements.errors.textContent = (result.errors || []).join('\n');
    elements.warnings.textContent = [...(result.warnings || []), ...assessments.flatMap(item => item.warnings), 'Credentials and worksheet values are session-only. Generated output may contain plaintext credentials.'].join('\n');
    if (!result.ok || !result.text) { elements.outputStatus.textContent = 'Generation blocked'; return; }
    if (info.cli && (result.outputKind !== 'cli' || !matchingOutputEvidence(result.verification, verification))) {
      elements.errors.textContent = 'CLI generation blocked: the engine did not return matching command documentation or runtime evidence.';
      elements.outputStatus.textContent = 'Generation blocked';
      return;
    }
    if (!info.cli && result.outputKind !== 'worksheet') {
      elements.errors.textContent = 'Worksheet generation blocked: the engine did not return a manual worksheet.';
      elements.outputStatus.textContent = 'Generation blocked';
      return;
    }
    const label = !info.cli ? 'Manual configuration worksheet' : result.verification.status === 'Runtime-tested' ? 'Runtime-tested · Packet Tracer ' + result.verification.runtime.observedRelease : 'Documentation-backed · Packet Tracer ' + verification.documentedRelease + ' · Runtime-tested: No';
    output = {text: result.text, filename: result.filename, format: info.cli ? elements.format.value : 'txt', label, instanceId: instance.id, major: major(), verification: result.verification || null};
    elements.preview.value = result.text;
    elements.verification.value = result.verificationText || '';
    elements.copy.disabled = false;
    elements.download.disabled = false;
    elements.outputStatus.textContent = output.label;
  }

  function outputReady() {
    if (!output) return false;
    const instance = selected(), model = instance && device(instance.deviceId);
    const verification = model && description(model).cli ? commandVerification(model) : null;
    if (!instance || output.instanceId !== instance.id || output.major !== major() || !deviceAvailable(model) || verification && !matchingOutputEvidence(output.verification, verification)) {
      invalidate(); renderContext();
      return false;
    }
    return true;
  }

  async function copy() {
    if (!outputReady()) return;
    const text = output.text, currentRevision = revision;
    try {
      if (window.navigator?.clipboard?.writeText) await window.navigator.clipboard.writeText(text);
      else throw new Error('Clipboard unavailable');
      if (revision === currentRevision) elements.outputStatus.textContent = output.label + ' · copied';
    } catch (error) {
      if (revision !== currentRevision) return;
      const previous = document.activeElement;
      elements.preview.focus();
      elements.preview.select();
      let copied = false;
      try { copied = document.execCommand?.('copy') === true; } catch (ignored) {}
      if (copied) { previous?.focus(); elements.outputStatus.textContent = output.label + ' · copied'; }
      else elements.outputStatus.textContent = 'Copy unavailable. Preview selected for manual copying.';
    }
  }

  function downloadText(text, filename, type) {
    let url;
    try {
      url = window.URL.createObjectURL(new window.Blob([text], {type}));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) { status('Download is unavailable in this browser.', 'warning'); }
    finally { if (url) window.setTimeout(() => window.URL.revokeObjectURL(url), 0); }
  }

  function download() {
    if (!outputReady()) return;
    const basename = String(output.filename || selected().config.hostname || 'configuration').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.(txt|cfg)$/i, '').slice(0, 100) || 'configuration';
    downloadText(output.text, basename + '.' + output.format, 'text/plain;charset=utf-8');
  }

  function exportBom() {
    const cell = value => { let text = String(value ?? ''); if (/^\s*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const rows = [['Type', 'Model', 'Hostname / attached device', 'Quantity', 'PT version family']];
    state.instances.forEach(instance => rows.push(['Device', device(instance.deviceId).pt_name, instance.config.hostname, 1, major() ? major() + '.x' : 'All versions']));
    state.parts.forEach(part => rows.push(['Part', moduleById(part.moduleId).model, state.instances.find(item => item.id === part.instanceId)?.config.hostname || '', part.quantity, major() ? major() + '.x' : 'All versions']));
    downloadText(rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n', 'packet-tracer-selection.csv', 'text/csv;charset=utf-8');
  }

  function handleAction(target) {
    const action = target.dataset.action;
    if (action === 'add-setting') {
      const name = mount.querySelector('#builderSettingPicker')?.value;
      if (!selected() || !description(device(selected().deviceId)).worksheetFields?.some(field => field.label === name)) return;
      if (selected().config.settings.some(row => row.label === name)) { status('That setting is already in the worksheet.'); return; }
      if (selected().config.settings.length >= MAX_ROWS) { status(`Each section allows at most ${MAX_ROWS} rows.`, 'warning'); return; }
      selected().config.settings.push({_id: nextId('r'), label: name, value: ''});
      const id = selected().config.settings.at(-1)._id;
      changed(); renderConfigSection('settings');
      const row = mount.querySelector(`[data-config-row="settings.@${id}"]`);
      (row?.querySelector('input') || row?.querySelector('select') || mount.querySelector('#builderSettingPicker'))?.focus();
      return;
    }
    if (action === 'add-config-row' || action === 'remove-config-row') {
      const path = target.dataset.configList, list = nodeAt(path), factory = ROW_DEFAULTS[schemaPath(path || '')];
      if (!Array.isArray(list) || !factory) return;
      let addedId = null;
      if (action === 'add-config-row') {
        if (list.length >= MAX_ROWS) { status(`Each section allows at most ${MAX_ROWS} rows.`, 'warning'); return; }
        addedId = nextId('r');
        list.push({...JSON.parse(JSON.stringify(factory)), _id: addedId});
      } else {
        const index = list.findIndex(row => row._id === target.dataset.rowId);
        if (index < 0) return;
        list.splice(index, 1);
      }
      if (path === 'asa.interfaces' || path === 'svis') resetConfirmation();
      changed(); renderConfigSection(path);
      const row = addedId ? mount.querySelector(`[data-config-row="${path}.@${addedId}"]`) : null;
      (row?.querySelector('input') || row?.querySelector('select') || mount.querySelector(`[data-action="add-config-row"][data-config-list="${path}"]`))?.focus();
      return;
    }
    if (action === 'add-device') { addDevice(elements.devicePicker.value); return; }
    if (action === 'add-part') { insertPart(elements.modulePicker.value, elements.attachPicker.value || null); return; }
    if (action === 'generate') { generate(); return; }
    if (action === 'copy') { void copy(); return; }
    if (action === 'download') { download(); return; }
    if (action === 'bom') { exportBom(); return; }
    if (action === 'add-row') { addRow(target.dataset.rowKind); return; }
    if (action === 'clear') {
      if (!window.confirm?.('Clear all selected devices, parts and configurations?')) return;
      state.instances = []; state.parts = []; state.selectedId = null; invalidParts.clear();
      changed({cart: true, parts: true}); renderEditor(); status('Selection cleared.'); return;
    }
    if (action === 'remove-part') {
      const removed = state.parts.find(part => part.id === target.dataset.partId);
      if (removed?.instanceId) resetConfirmation(state.instances.find(item => item.id === removed.instanceId));
      state.parts = state.parts.filter(part => part.id !== target.dataset.partId); invalidParts.delete(target.dataset.partId);
      changed({cart: true, parts: true}); renderEditor(); status('Part removed.'); return;
    }
    const instance = state.instances.find(item => item.id === target.dataset.instanceId);
    if (action === 'select' && instance) { state.selectedId = instance.id; changed({cart: true}); renderEditor(); return; }
    if (action === 'duplicate' && instance) {
      if (state.instances.length >= MAX_ITEMS || state.parts.length + state.parts.filter(part => part.instanceId === instance.id).length > MAX_ITEMS) { status('Selection limit reached.', 'warning'); return; }
      if (!deviceAvailable(device(instance.deviceId))) { status('This device is unavailable in the selected version; the existing instance was retained.', 'warning'); return; }
      const duplicate = {id: nextId('i'), deviceId: instance.deviceId, config: cleanConfig(instance.config, device(instance.deviceId), state.instances.length + 1)};
      duplicate.config.hostname = uniqueHostname(instance.config.hostname.slice(0, 58) + '-copy');
      state.instances.push(duplicate);
      state.parts.filter(part => part.instanceId === instance.id).forEach(part => state.parts.push({...part, id: nextId('p'), instanceId: duplicate.id}));
      state.selectedId = duplicate.id; changed({cart: true, parts: true}); renderEditor(); status('Device instance duplicated. Credentials and worksheet values were not copied.'); return;
    }
    if (action === 'remove-device' && instance) {
      state.instances = state.instances.filter(item => item.id !== instance.id);
      state.parts.forEach(part => { if (part.instanceId === instance.id) part.instanceId = null; });
      if (state.selectedId === instance.id) state.selectedId = state.instances[0]?.id || null;
      changed({cart: true, parts: true}); renderEditor(); status('Device removed. Its attached modules remain as loose parts.'); return;
    }
    if (action === 'remove-row' && selected()) {
      const kind = target.dataset.rowKind;
      if (!['vlans', 'interfaces', 'routes'].includes(kind)) return;
      selected().config[kind] = selected().config[kind].filter(row => row._id !== target.dataset.rowId);
      changed(); renderRows(kind); mount.querySelector(`[data-action="add-row"][data-row-kind="${kind}"]`)?.focus();
    }
  }

  function init(options) {
    if (initialized) return;
    settings = options || {};
    db = settings.db;
    engine = window.PTConfigBuilder;
    mount = document.querySelector('#builderWorkspace');
    if (!mount || !db || !engine) return;
    if (typeof settings.getVersion !== 'function') settings.getVersion = () => '';
mount.innerHTML = `<div class="builder-layout"><section class="builder-selection" aria-labelledby="builderSelectionTitle"><div class="section-heading"><h3 id="builderSelectionTitle">Selection</h3><span id="builderSelectionCount" class="count" role="status"></span></div><div class="builder-toolbar"><label class="field"><span>Device</span><select id="builderDevicePicker"></select></label>${button('add-device', 'Add device', 'plus')}</div><div class="builder-toolbar"><label class="field"><span>Part</span><select id="builderModulePicker"></select></label><label class="field"><span>Attach to</span><select id="builderAttachPicker"></select></label>${button('add-part', 'Add part', 'package')}</div><ul id="builderDevices" class="builder-device-list"></ul><h4>Parts</h4><ul id="builderParts" class="builder-part-list"></ul><div class="builder-toolbar">${button('bom', 'Export BOM', 'download', 'id="builderBom"')}${button('clear', 'Clear selection', 'trash', 'id="builderClear"')}</div><p id="builderSelectionStatus" class="builder-status" role="status" aria-live="polite"></p></section><section class="builder-editor" aria-labelledby="builderEditorTitle"><h3 id="builderEditorTitle">Device configuration</h3><div id="builderEditor"></div></section></div><section class="builder-output" aria-labelledby="builderOutputTitle"><div class="section-heading"><h3 id="builderOutputTitle">Configuration output</h3><span id="builderOutputStatus" class="builder-status" role="status"></span></div><div class="builder-toolbar"><label class="field"><span>Format</span><select id="builderFormat"><option value="txt">.txt · CLI script</option><option value="cfg">.cfg · CLI script</option></select></label>${button('generate', 'Generate selected device', 'terminal', 'id="builderGenerate"')}${button('copy', 'Copy', 'copy', 'id="builderCopy" disabled')}${button('download', 'Download', 'download', 'id="builderDownload" disabled')}</div><div id="builderErrors" class="builder-status error" role="alert"></div><div id="builderWarnings" class="builder-status warning" role="status"></div><label class="field builder-preview-field"><span>Configuration preview</span><textarea id="builderPreview" readonly spellcheck="false" rows="14"></textarea></label><details><summary>Verification commands</summary><label class="field builder-preview-field"><span>Verification commands</span><textarea id="builderVerification" readonly spellcheck="false" rows="6"></textarea></label></details></section>`;
    const get = id => mount.querySelector('#' + id);
    elements = {devicePicker: get('builderDevicePicker'), modulePicker: get('builderModulePicker'), attachPicker: get('builderAttachPicker'), devices: get('builderDevices'), parts: get('builderParts'), count: get('builderSelectionCount'), selectionStatus: get('builderSelectionStatus'), editor: get('builderEditor'), format: get('builderFormat'), generate: get('builderGenerate'), copy: get('builderCopy'), download: get('builderDownload'), bom: get('builderBom'), clear: get('builderClear'), preview: get('builderPreview'), verification: get('builderVerification'), errors: get('builderErrors'), warnings: get('builderWarnings'), outputStatus: get('builderOutputStatus')};
    elements.preview.setAttribute('wrap', 'off');
    elements.verification.setAttribute('wrap', 'off');
    initialized = true;
    const warning = restore();
    renderPickers(); renderCart(); renderParts(); renderEditor(); invalidate();
    if (warning) status(warning, 'warning');
    mount.addEventListener('click', event => { const target = event.target.closest('[data-action]'); if (target && mount.contains(target) && !target.disabled) handleAction(target); });
    mount.addEventListener('input', event => { if (event.target.dataset.configPath) handleConfigField(event.target); else if (event.target.dataset.field) handleField(event.target); else if (event.target.dataset.partField) handlePart(event.target); });
    mount.addEventListener('change', event => {
      if (event.target === elements.format) { const wasValid = !!output; invalidate(); if (wasValid) generate(); }
      else if (event.target.dataset.configPath) handleConfigField(event.target);
      else if (event.target.dataset.field) handleField(event.target);
      else if (event.target.dataset.partField) handlePart(event.target);
    });
    mount.addEventListener('submit', event => { event.preventDefault(); });
  }

  function versionChanged() {
    if (!initialized) return;
    state.instances.forEach(instance => resetConfirmation(instance));
    invalidate(); renderPickers(); renderCart(); renderParts(); renderContext();
    save();
    status('Version changed. Configurations were preserved; generated output was cleared.');
  }

  window.PTBuilderUI = {init, addDevice(id) { return !!addDevice(id); }, addModule(id, deviceId) { return !!addModule(id, deviceId); }, versionChanged, open() { if (!initialized) return; settings.onOpenBuilder?.(); elements.devicePicker.focus(); }};
}());
