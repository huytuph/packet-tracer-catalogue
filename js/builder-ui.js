(function () {
  'use strict';

  const STORAGE_KEY = 'ptCatalogue.builder.v1';
  const MAX_ITEMS = 50;
  const MAX_ROWS = 64;
  const MAX_STORAGE = 100000;
  const majors = ['6', '7', '8', '9'];
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
    const value = source && typeof source === 'object' ? source : {};
    const management = value.management && typeof value.management === 'object' ? value.management : {};
    const rows = (name, clean) => Array.isArray(value[name]) ? value[name].slice(0, MAX_ROWS).filter(row => row && typeof row === 'object').map(clean) : [];
    return {
      hostname: typeof value.hostname === 'string' ? string(value.hostname, 63) : defaults.hostname,
      enableRouting: value.enableRouting === true,
      interfacesConfirmed: false,
      interfaces: rows('interfaces', row => ({_id: nextId('r'), name: string(row.name, 80), mode: ['routed', 'access', 'trunk'].includes(row.mode) ? row.mode : 'routed', address: string(row.address, 45), mask: string(row.mask, 45), description: string(row.description, 160), vlan: string(String(row.vlan ?? ''), 20), allowedVlans: string(row.allowedVlans, 200), nativeVlan: string(String(row.nativeVlan ?? ''), 20), shutdown: row.shutdown === true})),
      vlans: rows('vlans', row => ({_id: nextId('r'), id: string(String(row.id ?? ''), 20), name: string(row.name, 32)})),
      management: {enabled: management.enabled === true, vlan: string(String(management.vlan ?? ''), 20), address: string(management.address, 45), mask: string(management.mask, 45), gateway: string(management.gateway, 45)},
      routes: rows('routes', row => ({_id: nextId('r'), network: string(row.network, 45), mask: string(row.mask, 45), nextHop: string(row.nextHop, 80)}))
    };
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
        return {id, deviceId: Number(item.deviceId), release: string(item.release, 24), config: cleanConfig(item.config, device(item.deviceId), index + 1)};
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
    const payload = JSON.stringify({schema: 1, instances: state.instances, parts: state.parts, selectedId: state.selectedId});
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
    elements.errors.textContent = '';
    elements.warnings.textContent = '';
    elements.outputStatus.textContent = selected() ? 'Not generated' : '';
  }

  function availabilityLabel(model) {
    const version = major();
    if (!version) return '';
    const available = model.version_profiles?.[version]?.availability?.available;
    return available === false ? ` (not available in ${version}.x)` : available !== true ? ` (availability not verified for ${version}.x)` : '';
  }

  function renderPickers() {
    elements.version.value = major();
    const deviceId = elements.devicePicker.value;
    const moduleId = elements.modulePicker.value;
    elements.devicePicker.innerHTML = '<option value="">Select device</option>' + db.devices.map(model => `<option value="${model.device_id}">${esc(model.display_name + availabilityLabel(model))}</option>`).join('');
    elements.modulePicker.innerHTML = '<option value="">Select part</option>' + db.modules.map(part => `<option value="${part.module_id}">${esc(part.model)}</option>`).join('');
    elements.devicePicker.value = device(deviceId) ? deviceId : '';
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
    if (!instanceId) return {errors, warnings};
    const instance = state.instances.find(item => item.id === instanceId);
    if (!instance) return {errors: ['The attached device no longer exists.'], warnings};
    const version = major(), model = device(instance.deviceId), name = moduleById(part.moduleId).model;
    const profile = version ? model.version_profiles?.[version] : null;
    const compatible = profile?.modules?.find(item => item.module_id === part.moduleId);
    if (!profile || profile.availability?.available !== true || !compatible) warnings.push(`${name}: compatibility is not verified for this device in the selected version. No cross-version compatibility was used.`);
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
    const category = device(instance.deviceId).category.slug;
    const switchModule = state.parts.some(part => part.instanceId === instance.id && ['HWIC-4ESW', 'NM-ESW-161', 'NIM-ES2-4'].includes(moduleById(part.moduleId).model) && part.quantity >= 1);
    return {l2: category === 'switch_l2', multilayer: category === 'switch_l3', vlans: category === 'switch_l2' || category === 'switch_l3', switched: category === 'switch_l2' || category === 'switch_l3' || switchModule, routed: category !== 'switch_l2'};
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
    return `<div class="builder-interface-row" data-row-id="${row._id}"><div class="builder-row">${input('Actual interface name', 'name', {max: 80})}${input('Mode', 'mode', {choices})}${input('Description', 'description', {max: 160})}${input('Shutdown', 'shutdown', {type: 'checkbox'})}${remove}</div><div class="builder-fields" data-modes="routed"${row.mode !== 'routed' ? ' hidden' : ''}>${input('IPv4 address', 'address', {max: 45})}${input('Subnet mask', 'mask', {max: 45})}</div><div class="builder-fields" data-modes="access"${row.mode !== 'access' ? ' hidden' : ''}>${input('Access VLAN' + existing, 'vlan', vlanInput)}</div><div class="builder-fields" data-modes="trunk"${row.mode !== 'trunk' ? ' hidden' : ''}>${input('Allowed VLANs' + existing, 'allowedVlans', {max: 200, placeholder: '10,20-30'})}${input('Native VLAN' + existing, 'nativeVlan', vlanInput)}</div></div>`;
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
    const releaseInput = mount.querySelector('[data-field="release"]');
    if (releaseInput) releaseInput.setAttribute('placeholder', ({'6': '6.3', '7': '7.3.1', '8': '8.2.2', '9': '9.0.1'})[version] || 'Exact release');
    const available = version ? model.version_profiles?.[version]?.availability : null;
    const messages = [];
    if (!version) messages.push('Choose a Packet Tracer version before generation.');
    else if (available?.available === false) messages.push(`This device is not available in ${version}.x. It remains in the selection list.`);
    else if (available?.available !== true) messages.push(`Device availability is not verified for ${version}.x.`);
    if (available?.observed_release) messages.push(`Availability evidence: ${available.observed_release}; command compatibility is not verified.`);
    if (!engine.supportsDevice(model)) messages.push('Configuration generation is unavailable for this device. It remains in the selection list.');
    if (!capabilities(instance).switched && (instance.config.vlans.length || instance.config.interfaces.some(row => row.mode !== 'routed'))) messages.push('An EtherSwitch module is required for the retained VLAN/switchport configuration. Remove those rows or attach a suitable module.');
    if (!capabilities(instance).vlans && instance.config.vlans.length) messages.push('Router drafts reference existing VLANs; remove VLAN creation rows.');
    context.textContent = messages.join(' ');
    elements.generate.disabled = !engine.supportsDevice(model);
  }

  function renderEditor() {
    const instance = selected();
    if (!instance) { elements.editor.innerHTML = '<p class="muted">No device selected.</p>'; elements.generate.disabled = true; return; }
    const model = device(instance.deviceId), supported = engine.supportsDevice(model);
    const management = instance.config.management;
    const permissions = capabilities(instance);
    const section = (kind, label, disabled = false) => `<details open><summary>${label}</summary><fieldset><legend class="sr-only">${label}</legend><div id="builderRows-${kind}"></div>${button('add-row', 'Add ' + (kind === 'vlans' ? 'VLAN' : kind === 'interfaces' ? 'interface' : 'route'), 'plus', `data-row-kind="${kind}"${disabled ? ' disabled' : ''}`)}</fieldset></details>`;
    const sections = supported ? [
      `<div class="builder-fields">${permissions.multilayer ? field('Enable IP routing', 'enableRouting', instance.config.enableRouting, {type: 'checkbox'}) : ''}${field('Interfaces, module slots and port roles confirmed in Packet Tracer', 'interfacesConfirmed', instance.config.interfacesConfirmed, {type: 'checkbox'})}</div>`,
      permissions.vlans || instance.config.vlans.length ? section('vlans', 'VLANs', !permissions.vlans) : '',
      section('interfaces', 'Interfaces'),
      permissions.l2 ? `<details><summary>L2 management SVI</summary><fieldset><legend class="sr-only">L2 management SVI</legend>${field('Enable management SVI', 'management.enabled', management.enabled, {type: 'checkbox'})}<div class="builder-fields" id="builderManagementFields"${management.enabled ? '' : ' hidden'}>${field('Management VLAN', 'management.vlan', management.vlan, {max: 4, inputmode: 'numeric'})}${field('IPv4 address', 'management.address', management.address, {max: 45})}${field('Subnet mask', 'management.mask', management.mask, {max: 45})}${field('Default gateway', 'management.gateway', management.gateway, {max: 45})}</div></fieldset></details>` : '',
      permissions.routed ? section('routes', 'Static routes') : ''
    ].join('') : '';
    elements.editor.innerHTML = `<form id="builderForm"><div class="builder-fields">${field('Hostname', 'hostname', instance.config.hostname, {max: 63})}${field('Exact Packet Tracer release', 'release', instance.release, {max: 24, placeholder: '9.0.1'})}<div class="field"><span>Device model</span><output>${esc(model.display_name)}</output></div></div><p id="builderContext" class="builder-status warning" role="status"></p>${sections}</form>`;
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
    if (state.instances.length >= MAX_ITEMS) { status(`Selection limit is ${MAX_ITEMS} device instances.`, 'warning'); return null; }
    const instance = {id: nextId('i'), deviceId: model.device_id, release: '', config: cleanConfig(engine.createConfig(model, state.instances.length + 1), model, state.instances.length + 1)};
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
        const cleared = inactive.some(key => row[key] !== '');
        inactive.forEach(key => { row[key] = ''; const input = container?.querySelector(`[data-field="${key}"]`); if (input) input.value = ''; });
        container?.querySelectorAll('[data-modes]').forEach(section => { section.hidden = section.dataset.modes !== value; });
        if (cleared) status('Mode changed; fields not used by this mode were cleared.');
      }
    } else if (name === 'release') {
      instance.release = value;
      resetConfirmation(instance);
    }
    else if (name.startsWith('management.')) {
      const key = name.slice(11);
      if (!Object.prototype.hasOwnProperty.call(instance.config.management, key)) return;
      instance.config.management[key] = value;
      if (key === 'enabled') { mount.querySelector('#builderManagementFields').hidden = !value; resetConfirmation(instance); }
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
    const row = kind === 'vlans' ? {id: '', name: ''} : kind === 'routes' ? {network: '', mask: '', nextHop: ''} : {name: '', mode: capabilities().l2 ? 'access' : 'routed', address: '', mask: '', description: '', vlan: '', allowedVlans: '', nativeVlan: '', shutdown: false};
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
    const parts = state.parts.filter(part => part.instanceId === instance.id);
    const assessments = parts.map(part => partAssessment(part));
    const errors = assessments.flatMap(item => item.errors);
    if (invalidParts.size) errors.push('Correct invalid part quantities or attachments before generation.');
    if (!major()) errors.push('Choose a Packet Tracer version before generation.');
    if (errors.length) { elements.errors.textContent = errors.join('\n'); return; }
    const moduleQuantities = new Map();
    parts.forEach(part => moduleQuantities.set(part.moduleId, (moduleQuantities.get(part.moduleId) || 0) + part.quantity));
    const item = {id: instance.id, deviceId: instance.deviceId, config: instance.config, modules: Array.from(moduleQuantities, ([moduleId, quantity]) => ({moduleId, quantity}))};
    let result;
    try { result = engine.generate(item, device(instance.deviceId), {major: major(), release: instance.release.trim(), format: elements.format.value}); }
    catch (error) { elements.errors.textContent = 'Configuration generation failed. No output was retained.'; return; }
    elements.errors.textContent = (result.errors || []).join('\n');
    elements.warnings.textContent = [...(result.warnings || []), ...assessments.flatMap(item => item.warnings)].join('\n');
    if (!result.ok || !result.text) { elements.outputStatus.textContent = 'Generation blocked'; return; }
    output = {text: result.text, filename: result.filename, format: elements.format.value};
    elements.preview.value = result.text;
    elements.verification.value = result.verificationText || '';
    elements.copy.disabled = false;
    elements.download.disabled = false;
    elements.outputStatus.textContent = 'Untested configuration';
  }

  async function copy() {
    if (!output) return;
    const text = output.text, currentRevision = revision;
    try {
      if (window.navigator?.clipboard?.writeText) await window.navigator.clipboard.writeText(text);
      else throw new Error('Clipboard unavailable');
      if (revision === currentRevision) elements.outputStatus.textContent = 'Untested configuration · copied';
    } catch (error) {
      if (revision !== currentRevision) return;
      const previous = document.activeElement;
      elements.preview.focus();
      elements.preview.select();
      let copied = false;
      try { copied = document.execCommand?.('copy') === true; } catch (ignored) {}
      if (copied) { previous?.focus(); elements.outputStatus.textContent = 'Untested configuration · copied'; }
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
    if (!output) return;
    const basename = String(output.filename || selected().config.hostname || 'configuration').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.(txt|cfg)$/i, '').slice(0, 100) || 'configuration';
    downloadText(output.text, basename + '.' + output.format, 'text/plain;charset=utf-8');
  }

  function exportBom() {
    const cell = value => { let text = String(value ?? ''); if (/^\s*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const rows = [['Type', 'Model', 'Hostname / attached device', 'Quantity', 'PT version family', 'Exact release']];
    state.instances.forEach(instance => rows.push(['Device', device(instance.deviceId).pt_name, instance.config.hostname, 1, major() ? major() + '.x' : '', instance.release]));
    state.parts.forEach(part => rows.push(['Part', moduleById(part.moduleId).model, state.instances.find(item => item.id === part.instanceId)?.config.hostname || '', part.quantity, major() ? major() + '.x' : '', '']));
    downloadText(rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n', 'packet-tracer-selection.csv', 'text/csv;charset=utf-8');
  }

  function handleAction(target) {
    const action = target.dataset.action;
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
      const duplicate = {id: nextId('i'), deviceId: instance.deviceId, release: instance.release, config: cleanConfig(instance.config, device(instance.deviceId), state.instances.length + 1)};
      duplicate.config.hostname = uniqueHostname(instance.config.hostname.slice(0, 58) + '-copy');
      state.instances.push(duplicate);
      state.parts.filter(part => part.instanceId === instance.id).forEach(part => state.parts.push({...part, id: nextId('p'), instanceId: duplicate.id}));
      state.selectedId = duplicate.id; changed({cart: true, parts: true}); renderEditor(); status('Device instance duplicated.'); return;
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
    mount.innerHTML = `<div class="builder-layout"><section class="builder-selection" aria-labelledby="builderSelectionTitle"><div class="section-heading"><h3 id="builderSelectionTitle">Selection</h3><span id="builderSelectionCount" class="count" role="status"></span></div><div class="builder-toolbar"><label class="field"><span>Device</span><select id="builderDevicePicker"></select></label>${button('add-device', 'Add device', 'plus')}</div><div class="builder-toolbar"><label class="field"><span>Part</span><select id="builderModulePicker"></select></label><label class="field"><span>Attach to</span><select id="builderAttachPicker"></select></label>${button('add-part', 'Add part', 'package')}</div><ul id="builderDevices" class="builder-device-list"></ul><h4>Parts</h4><ul id="builderParts" class="builder-part-list"></ul><div class="builder-toolbar">${button('bom', 'Export BOM', 'download', 'id="builderBom"')}${button('clear', 'Clear selection', 'trash', 'id="builderClear"')}</div><p id="builderSelectionStatus" class="builder-status" role="status" aria-live="polite"></p></section><section class="builder-editor" aria-labelledby="builderEditorTitle"><h3 id="builderEditorTitle">Device configuration</h3><div id="builderEditor"></div></section></div><section class="builder-output" aria-labelledby="builderOutputTitle"><div class="section-heading"><h3 id="builderOutputTitle">Configuration output</h3><span id="builderOutputStatus" class="builder-status" role="status"></span></div><div class="builder-toolbar"><label class="field"><span>Format</span><select id="builderFormat"><option value="txt">.txt · CLI script</option><option value="cfg">.cfg · Configuration only</option></select></label>${button('generate', 'Generate selected device', 'terminal', 'id="builderGenerate"')}${button('copy', 'Copy', 'copy', 'id="builderCopy" disabled')}${button('download', 'Download', 'download', 'id="builderDownload" disabled')}</div><div id="builderErrors" class="builder-status error" role="alert"></div><div id="builderWarnings" class="builder-status warning" role="status"></div><label class="field builder-preview-field"><span>Untested configuration preview</span><textarea id="builderPreview" readonly spellcheck="false" rows="14"></textarea></label><details><summary>Verification commands</summary><label class="field builder-preview-field"><span>Verification commands</span><textarea id="builderVerification" readonly spellcheck="false" rows="6"></textarea></label></details></section>`;
    const versionField = document.createElement('label');
    versionField.className = 'field';
    versionField.innerHTML = '<span>Packet Tracer version</span><select id="builderVersion"><option value="">Select version</option><option value="9">9.x</option><option value="8">8.x</option><option value="7">7.x</option><option value="6">6.x</option></select>';
    const selectionPanel = mount.querySelector('.builder-selection');
    selectionPanel.insertBefore(versionField, selectionPanel.querySelector('.builder-toolbar'));
    const get = id => mount.querySelector('#' + id);
    elements = {version: get('builderVersion'), devicePicker: get('builderDevicePicker'), modulePicker: get('builderModulePicker'), attachPicker: get('builderAttachPicker'), devices: get('builderDevices'), parts: get('builderParts'), count: get('builderSelectionCount'), selectionStatus: get('builderSelectionStatus'), editor: get('builderEditor'), format: get('builderFormat'), generate: get('builderGenerate'), copy: get('builderCopy'), download: get('builderDownload'), bom: get('builderBom'), clear: get('builderClear'), preview: get('builderPreview'), verification: get('builderVerification'), errors: get('builderErrors'), warnings: get('builderWarnings'), outputStatus: get('builderOutputStatus')};
    elements.preview.setAttribute('wrap', 'off');
    elements.verification.setAttribute('wrap', 'off');
    initialized = true;
    const warning = restore();
    renderPickers(); renderCart(); renderParts(); renderEditor(); invalidate();
    if (warning) status(warning, 'warning');
    mount.addEventListener('click', event => { const target = event.target.closest('[data-action]'); if (target && mount.contains(target) && !target.disabled) handleAction(target); });
    mount.addEventListener('input', event => { if (event.target.dataset.field) handleField(event.target); else if (event.target.dataset.partField) handlePart(event.target); });
    mount.addEventListener('change', event => {
      if (event.target === elements.version) {
        if (settings.onVersionChange) settings.onVersionChange(elements.version.value);
        else { elements.version.value = major(); status('Use the global Packet Tracer version selector.', 'warning'); }
      }
      else if (event.target === elements.format) { const wasValid = !!output; invalidate(); if (wasValid) generate(); }
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
