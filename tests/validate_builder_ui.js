'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(root, 'js/builder-ui.js'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'js/config-builder.js'), 'utf8');
const ipSource = fs.readFileSync(path.join(root, 'assets/vendor/ipaddr.js'), 'utf8');
const evidenceSource = fs.readFileSync(path.join(root, 'data/command-verification.js'), 'utf8');
const documentationSource = fs.readFileSync(path.join(root, 'data/command-documentation.js'), 'utf8');
const dataWindow = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'data/catalogue-data.js'), 'utf8'), {window: dataWindow});
const catalogue = JSON.parse(JSON.stringify(dataWindow.PT_CATALOGUE));
const storageKey = 'ptCatalogue.builder.v1';
const checks = [];
const check = (name, run) => checks.push({name, run});
const decode = value => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'"}[entity]));

function assertCliScript(text) {
  assert.match(text, /^enable\nconfigure terminal\n/);
  assert.match(text, /\nend\n$/);
  const lines = text.trim().split('\n');
  for (const command of ['enable', 'configure terminal', 'end']) assert.equal(lines.filter(line => line.trim() === command).length, 1);
  assert(!/^!|^show /m.test(text));
}

// A deliberately small DOM covers generated controls and delegated events, not layout.
class Element {
  constructor(document, tag, attributes = {}) {
    this.document = document;
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.dataset = {};
    this.children = [];
    this.parentElement = null;
    this.listeners = {};
    this._text = '';
    this._html = '';
    this._value = null;
    this.disabled = false;
    this.checked = false;
    this.hidden = false;
    for (const [name, value] of Object.entries(attributes)) this.setAttribute(name, value);
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    if (name === 'id') this.document.ids.set(String(value), this);
    if (name === 'value') this._value = String(value);
    if (name === 'type') this.type = String(value);
    if (name === 'disabled') this.disabled = true;
    if (name === 'checked') this.checked = true;
    if (name === 'hidden') this.hidden = true;
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'disabled') this.disabled = false;
  }
  get id() { return this.attributes.id || ''; }
  get className() { return this.attributes.class || ''; }
  set className(value) { this.attributes.class = value; }
  get value() {
    if (this.tagName === 'SELECT') {
      const options = this.querySelectorAll('option');
      if (this._value !== null && options.some(option => option.value === this._value)) return this._value;
      const option = options.find(item => item.getAttribute('selected') !== null) || options[0];
      return option?.value || '';
    }
    return this._value ?? '';
  }
  set value(value) { this._value = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.clear(); this._text = String(value); }
  get innerHTML() { return this._html; }
  set innerHTML(value) { this.clear(); this._html = String(value); this.document.parse(this, String(value)); }
  clear() {
    this.children.forEach(child => this.document.forget(child));
    this.children = [];
    this._text = '';
    this._html = '';
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  insertBefore(child, before) {
    const index = this.children.indexOf(before);
    assert(index >= 0, 'insertBefore target is not a child');
    child.parentElement = this; this.children.splice(index, 0, child); return child;
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.document.forget(this);
  }
  contains(node) { for (let item = node; item; item = item.parentElement) if (item === this) return true; return false; }
  matches(selector) {
    const outsideAttributes = selector.replace(/\[[^\]]*\]/g, '');
    const tag = outsideAttributes.match(/^[a-zA-Z][\w-]*/)?.[0];
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    const id = outsideAttributes.match(/#([\w-]+)/)?.[1];
    if (id && this.id !== id) return false;
    for (const match of outsideAttributes.matchAll(/\.([\w-]+)/g)) if (!this.className.split(/\s+/).includes(match[1])) return false;
    for (const match of selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
      const value = this.getAttribute(match[1]);
      if (value === null || match[2] !== undefined && value !== match[2]) return false;
    }
    return true;
  }
  querySelectorAll(selector) {
    const selectors = selector.trim().match(/(?:\[[^\]]*\]|[^\s\[])+/g) || [];
    const result = [];
    const visit = item => {
      for (const child of item.children) {
        if (child.matches(selectors[selectors.length - 1])) {
          let ancestor = child.parentElement, index = selectors.length - 2;
          while (index >= 0 && ancestor) { if (ancestor.matches(selectors[index])) index--; ancestor = ancestor.parentElement; }
          if (index < 0) result.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let item = this; item; item = item.parentElement) if (item.matches(selector)) return item; return null; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  focus() { this.document.activeElement = this; }
  select() { this.selectionRequested = true; }
  setCustomValidity(value) { this.validationMessage = value; }
  click() { if (this.tagName === 'A') this.document.downloads.push({href: this.href, filename: this.download}); }
}

class Document {
  constructor() {
    this.ids = new Map();
    this.downloads = [];
    this.body = new Element(this, 'body');
    this.body.appendChild(new Element(this, 'div', {id: 'builderWorkspace'}));
    this.activeElement = this.body;
  }
  forget(element) {
    element.children.forEach(child => this.forget(child));
    if (element.id && this.ids.get(element.id) === element) this.ids.delete(element.id);
    element.parentElement = null;
  }
  createElement(tag) { return new Element(this, tag); }
  querySelector(selector) { return this.body.querySelector(selector); }
  parse(parent, source) {
    const stack = [parent];
    const voidTags = new Set(['input', 'img', 'br', 'hr']);
    let previous = 0;
    for (const match of source.matchAll(/<\/?[a-zA-Z][^<>]*>/g)) {
      stack[stack.length - 1]._text += decode(source.slice(previous, match.index));
      previous = match.index + match[0].length;
      const token = match[0];
      const tag = token.match(/^<\/?([\w-]+)/)[1].toLowerCase();
      if (token.startsWith('</')) {
        assert.equal(stack[stack.length - 1].tagName, tag.toUpperCase(), 'Unbalanced generated DOM');
        stack.pop();
        continue;
      }
      const attributes = {};
      const body = token.slice(tag.length + 1, -1);
      for (const attribute of body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attributes[attribute[1]] = decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
      const child = new Element(this, tag, attributes);
      stack[stack.length - 1].appendChild(child);
      if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(child);
    }
    stack[stack.length - 1]._text += decode(source.slice(previous));
    assert.equal(stack.length, 1, 'Generated DOM has unclosed elements');
  }
}

function boot(options = {}) {
  const document = new Document();
  const storage = options.storage || new Map();
  const clipboard = [];
  const blobs = new Map(), revoked = [];
  let version = options.major ?? '9', opens = 0, confirmCalls = 0;
  const window = {
    localStorage: {getItem(key) { if (options.denyStorage) throw new Error('Denied'); return storage.get(key) || null; }, setItem(key, value) { if (options.denyStorage) throw new Error('Denied'); storage.set(key, value); }},
    navigator: options.clipboard === false ? {} : {clipboard: {async writeText(value) { if (options.clipboardReject) throw new Error('Denied'); clipboard.push(value); }}},
    confirm() { confirmCalls++; return options.confirm !== false; },
    Blob: class { constructor(parts, config) { this.text = parts.join(''); this.type = config.type; } },
    URL: {createObjectURL(blob) { const url = 'blob:test/' + blobs.size; blobs.set(url, blob); return url; }, revokeObjectURL(url) { revoked.push(url); }},
    setTimeout(callback) { callback(); }
  };
  document.execCommand = () => options.execCopy === true;
  const context = {window, document};
  vm.runInNewContext(ipSource, context, {filename: 'ipaddr.js'});
  window.ipaddr = context.ipaddr;
  vm.runInNewContext(evidenceSource, context, {filename: 'command-verification.js'});
  vm.runInNewContext(documentationSource, context, {filename: 'command-documentation.js'});
  if (options.manifest) window.PT_COMMAND_VERIFICATION = options.manifest;
  if (Object.prototype.hasOwnProperty.call(options, 'documentation')) window.PT_COMMAND_DOCUMENTATION = options.documentation;
  vm.runInNewContext(engineSource, context, {filename: 'config-builder.js'});
  if (options.engineOverride) window.PTConfigBuilder = options.engineOverride(window.PTConfigBuilder);
  vm.runInNewContext(uiSource, context, {filename: 'builder-ui.js'});
  const db = options.db || JSON.parse(JSON.stringify(catalogue));
  const counts = [];
  const api = window.PTBuilderUI;
  const settings = {db, getVersion: () => version, onOpenBuilder() { opens++; }, onCountChange(count) { counts.push(count); }};
  api.init(settings);
  const mount = document.querySelector('#builderWorkspace');
  const get = id => { const element = document.querySelector('#' + id); assert(element, 'Missing element #' + id); return element; };
  const emit = (name, target) => { const event = {target, preventDefault() { this.defaultPrevented = true; }}; (mount.listeners[name] || []).forEach(listener => listener(event)); return event; };
  const find = selector => { const element = mount.querySelector(selector); assert(element, 'Missing generated control ' + selector); return element; };
  const action = (name, attributes = {}) => { const selector = '[data-action="' + name + '"]' + Object.entries(attributes).map(([key, value]) => `[data-${key}="${value}"]`).join(''); const element = find(selector); emit('click', element); return element; };
  const field = (name, value, kind, index = 0) => {
    const selector = `[data-field="${name}"]` + (kind ? `[data-row-kind="${kind}"]` : '');
    const target = mount.querySelectorAll(selector)[index];
    assert(target, 'Missing field ' + selector);
    if (target.type === 'checkbox') target.checked = value; else target.value = value;
    emit(target.tagName === 'SELECT' ? 'change' : 'input', target);
    return target;
  };
  const stored = () => JSON.parse(storage.get(storageKey));
  const config = (path, value) => {
    const target = find(`[data-config-path="${path}"]`);
    if (target.type === 'checkbox') target.checked = value; else target.value = value;
    emit(target.tagName === 'SELECT' ? 'change' : 'input', target);
    return target;
  };
  return {api, db, window, document, mount, storage, clipboard, blobs, revoked, counts, settings, get, find, emit, action, field, config, stored, setVersion(value) { version = value; api.versionChanged(); }, getVersion: () => version, opens: () => opens, confirmCalls: () => confirmCalls};
}

const deviceId = name => catalogue.devices.find(device => device.pt_name === name).device_id;
const moduleId = name => catalogue.modules.find(module => module.model === name).module_id;
function basicRouter(ui) {
  assert.equal(ui.api.addDevice(deviceId('2911')), true);
  ui.action('add-row', {'row-kind': 'interfaces'});
  ui.field('name', 'GigabitEthernet0/0', 'interfaces');
  ui.field('address', '192.168.10.1', 'interfaces');
  ui.field('mask', '255.255.255.0', 'interfaces');
  ui.field('interfacesConfirmed', true);
}

// Isolated UI-test data only. Capturing emissions never authorizes production output.
function syntheticRuntimeManifest(hostname = 'R1') {
  const marker = 'const approved = matchingRecord(device, major, extension, config.modules, commands, checks);';
  assert.equal(engineSource.split(marker).length, 2, 'The runtime-fixture capture marker changed');
  const context = {window: {}};
  vm.runInNewContext(ipSource, context); context.window.ipaddr = context.ipaddr;
  vm.runInNewContext(evidenceSource, context); vm.runInNewContext(documentationSource, context);
  vm.runInNewContext(engineSource.replace(marker, 'globalThis.__uiEmissions = {commands, checks}; ' + marker), context);
  const engine = context.window.PTConfigBuilder, model = catalogue.devices.find(row => row.pt_name === '2911');
  const config = engine.createConfig(model, 1);
  config.hostname = hostname; config.interfacesConfirmed = true;
  config.interfaces.push({name: 'GigabitEthernet0/0', mode: 'routed', address: '192.168.10.1', mask: '255.255.255.0', shutdown: false});
  engine.generate({config, modules: []}, model, {major: '9', format: 'txt'});
  assert(context.__uiEmissions, 'Basic router documentation must reach emission capture');
  return {schema_version: 1, records: [{
    id: 'ui-synthetic-runtime-only', model: model.pt_name, major_version: 9, observed_release: '9.0.1', template_revision: engine.templateRevision,
    format: 'txt', modules: [], prerequisites: ['Synthetic UI fixture only, not simulator evidence.'],
    commands: context.__uiEmissions.commands.map(row => ({...row, result: 'accepted'})), checks: context.__uiEmissions.checks.map(row => ({...row, result: 'accepted'})),
    evidence: {method: 'packet-tracer-runtime', transcript_path: 'evidence/runtime/synthetic-ui-only.txt', transcript_sha256: '0'.repeat(64), checked_date: '2026-10-02', error_count: 0, running_config_assertions: ['Synthetic UI fixture, not runtime evidence.'], diagnostic_assertions: ['Synthetic UI fixture, not runtime evidence.']}
  }]};
}

check('initialization is one-time, accessible, local, and has no guessed ports or IPs', () => {
  const ui = boot({major: ''});
  const firstMount = ui.get('builderDevicePicker');
  ui.api.init(ui.settings);
  assert.equal(ui.get('builderDevicePicker'), firstMount);
  assert.equal(ui.mount.querySelector('#builderVersion'), null);
  assert.equal(ui.get('builderGenerate').disabled, true);
  assert.equal(ui.get('builderCopy').disabled, true);
  assert.equal(ui.get('builderPreview').getAttribute('readonly'), '');
  assert.equal(ui.get('builderPreview').getAttribute('wrap'), 'off');
  assert.equal(ui.get('builderVerification').getAttribute('wrap'), 'off');
  assert.equal(ui.get('builderErrors').getAttribute('role'), 'alert');
  ui.api.addDevice(deviceId('2911'));
  assert.equal(ui.mount.querySelector('[data-field="release"]'), null);
  assert(!Object.prototype.hasOwnProperty.call(ui.stored().instances[0], 'release'));
  assert.equal(ui.stored().instances[0].config.interfaces.length, 0);
  assert.equal(ui.stored().instances[0].config.routes.length, 0);
  assert.equal(ui.stored().instances[0].config.management.address, '');
  assert.match(ui.get('builderContext').textContent, /All versions: combined inventory/);
  assert.equal(ui.mount.querySelector('[data-field="enableRouting"]'), null);
  assert.equal(ui.mount.querySelector('[data-field="management.enabled"]'), null);
  for (const image of ui.mount.querySelectorAll('img')) assert(fs.existsSync(path.join(root, image.getAttribute('src'))), 'Missing local icon');
  for (const input of ui.mount.querySelectorAll('input')) assert(input.closest('label'), 'Unlabelled input');
  for (const control of ui.mount.querySelectorAll('select')) assert(control.closest('label'), 'Unlabelled select');
  for (const control of ui.mount.querySelectorAll('textarea')) assert(control.closest('label'), 'Unlabelled textarea');
});

check('catalogue additions distinguish instances, do not navigate or silently create module hosts', () => {
  const ui = boot();
  assert.equal(ui.api.addDevice(999999), false);
  assert.equal(ui.api.addModule(999999), false);
  assert.equal(ui.api.addModule(moduleId('HWIC-2T'), deviceId('1841')), true);
  assert.equal(ui.stored().instances.length, 0);
  assert.equal(ui.stored().parts[0].instanceId, null);
  assert.match(ui.get('builderSelectionStatus').textContent, /No matching device instance/);
  ui.api.addDevice(deviceId('1841')); ui.api.addDevice(deviceId('1841'));
  const instances = ui.stored().instances;
  assert.equal(instances.length, 2);
  assert.notEqual(instances[0].id, instances[1].id);
  assert.equal(ui.api.addModule(moduleId('HWIC-4ESW'), deviceId('1841')), true);
  assert.equal(ui.stored().parts[1].instanceId, instances[1].id);
  assert.equal(ui.opens(), 0);
  ui.api.open(); assert.equal(ui.opens(), 1);
  assert.equal(ui.document.activeElement, ui.get('builderDevicePicker'));
  assert.equal(ui.counts.at(-1), 4);
});

check('picker additions and builder context follow the single global version', () => {
  const ui = boot({major: ''});
  ui.get('builderDevicePicker').value = String(deviceId('2911'));
  ui.action('add-device');
  assert.equal(ui.stored().instances.length, 1);
  ui.setVersion('8'); assert.equal(ui.getVersion(), '8');
  assert.match(ui.get('builderContext').textContent, /Packet Tracer 8\.x/);
  ui.setVersion('7'); assert.match(ui.get('builderContext').textContent, /Packet Tracer 7\.x/);
  assert.equal(ui.mount.querySelector('#builderVersion'), null);
  ui.get('builderModulePicker').value = String(moduleId('HWIC-2T'));
  ui.action('add-part'); assert.equal(ui.stored().parts.length, 1);
  assert.equal(ui.stored().parts[0].instanceId, null);
  ui.get('builderAttachPicker').value = ui.stored().instances[0].id;
  ui.action('add-part'); assert.equal(ui.stored().parts.length, 2);
  assert.equal(ui.stored().parts[1].instanceId, ui.stored().instances[0].id);
});

check('hostname and row edits retain focused nodes and text is escaped', () => {
  const ui = boot(); basicRouter(ui);
  const name = ui.find('[data-field="hostname"]'); name.focus();
  ui.field('hostname', '<img src=x onerror=alert(1)>');
  assert.equal(ui.find('[data-field="hostname"]'), name);
  assert.equal(ui.document.activeElement, name);
  assert.match(ui.get('builderDevices').innerHTML, /&lt;img/);
  assert(!ui.get('builderDevices').innerHTML.includes('<img src=x'));
  assert.equal(ui.get('builderPreview').value, '');
  const address = ui.find('[data-field="address"][data-row-kind="interfaces"]'); address.focus();
  ui.field('address', '192.168.10.2', 'interfaces');
  assert.equal(ui.find('[data-field="address"][data-row-kind="interfaces"]'), address);
  assert.equal(ui.document.activeElement, address);
  ui.action('generate'); assert.match(ui.get('builderErrors').textContent, /hostname/i);
  assert.equal(ui.get('builderCopy').disabled, true);
});

check('device category and EtherSwitch attachment govern available form sections and mode visibility', () => {
  const ui = boot(); ui.api.addDevice(deviceId('2960-24TT'));
  assert.equal(ui.mount.querySelector('[data-field="enableRouting"]'), null);
  assert(ui.mount.querySelector('[data-field="management.enabled"]'));
  assert.equal(ui.mount.querySelector('#builderRows-routes'), null);
  ui.action('add-row', {'row-kind': 'interfaces'});
  const mode = ui.find('[data-field="mode"][data-row-kind="interfaces"]');
  assert.equal(mode.value, 'access');
  assert.deepEqual(mode.querySelectorAll('option').map(option => option.value), ['access', 'trunk']);
  const container = mode.closest('.builder-interface-row');
  assert.equal(container.querySelector('[data-modes="access"]').hidden, false);
  ui.field('mode', 'trunk', 'interfaces');
  assert.equal(ui.find('[data-field="mode"][data-row-kind="interfaces"]'), mode);
  assert.equal(container.querySelector('[data-modes="access"]').hidden, true);
  assert.equal(container.querySelector('[data-modes="trunk"]').hidden, false);
  ui.field('management.enabled', true);
  assert.equal(ui.get('builderManagementFields').hidden, false);
  ui.api.addDevice(deviceId('3650-24PS'));
  assert(ui.mount.querySelector('[data-field="enableRouting"]'));
  assert.equal(ui.mount.querySelector('[data-field="management.enabled"]'), null);
  ui.api.addDevice(deviceId('1841'));
  assert.equal(ui.mount.querySelector('#builderRows-vlans'), null);
  ui.action('add-row', {'row-kind': 'interfaces'});
  assert.deepEqual(ui.find('[data-field="mode"]').querySelectorAll('option').map(option => option.value), ['routed']);
  ui.api.addModule(moduleId('HWIC-4ESW'), deviceId('1841'));
  assert.equal(ui.mount.querySelector('#builderRows-vlans'), null);
  assert.deepEqual(ui.find('[data-field="mode"]').querySelectorAll('option').map(option => option.value), ['routed', 'access', 'trunk']);
  assert.equal(ui.mount.querySelector('[data-field="management.enabled"]'), null);
});

check('mode conversions clear inactive fields without replacing focused controls', () => {
  const ui = boot(); ui.api.addDevice(deviceId('3650-24PS'));
  ui.action('add-row', {'row-kind': 'interfaces'});
  ui.field('address', '192.168.1.1', 'interfaces'); ui.field('mask', '255.255.255.0', 'interfaces');
  const mode = ui.find('[data-field="mode"]'); mode.focus();
  ui.field('mode', 'access', 'interfaces');
  assert.equal(ui.document.activeElement, mode); assert.equal(ui.find('[data-field="mode"]'), mode);
  assert.equal(ui.find('[data-field="address"][data-row-kind="interfaces"]').value, '');
  assert.equal(ui.stored().instances[0].config.interfaces[0].mask, '');
  assert.match(ui.get('builderSelectionStatus').textContent, /fields not used/);
  ui.field('vlan', '10', 'interfaces'); ui.field('mode', 'trunk', 'interfaces');
  assert.equal(ui.stored().instances[0].config.interfaces[0].vlan, '');
  ui.field('allowedVlans', '10,20', 'interfaces'); ui.field('nativeVlan', '10', 'interfaces');
  ui.field('mode', 'routed', 'interfaces');
  const row = ui.stored().instances[0].config.interfaces[0];
  assert.equal(row.allowedVlans, ''); assert.equal(row.nativeVlan, '');
  assert.equal(mode.closest('.builder-interface-row').querySelector('[data-modes="routed"]').hidden, false);
});

check('router drafts retain removable invalid rows after EtherSwitch removal or restoration', () => {
  const ui = boot(); ui.api.addDevice(deviceId('1841')); ui.api.addModule(moduleId('HWIC-4ESW'), deviceId('1841'));
  ui.action('add-row', {'row-kind': 'interfaces'}); ui.field('name', 'FastEthernet0/0/0', 'interfaces'); ui.field('mode', 'access', 'interfaces'); ui.field('vlan', '10', 'interfaces');
  const part = ui.stored().parts[0]; ui.action('remove-part', {'part-id': part.id});
  assert.match(ui.get('builderContext').textContent, /EtherSwitch module is required/);
  assert.match(ui.find('[data-field="mode"]').textContent, /unavailable/);
  const row = ui.stored().instances[0].config.interfaces[0];
  ui.action('remove-row', {'row-kind': 'interfaces', 'row-id': row._id});
  assert(!/EtherSwitch module is required/.test(ui.get('builderContext').textContent));
  const saved = ui.stored(); saved.instances[0].config.vlans = [{id: '10', name: 'Legacy'}];
  ui.storage.set(storageKey, JSON.stringify(saved));
  const restored = boot({storage: ui.storage});
  assert(restored.mount.querySelector('#builderRows-vlans'));
  assert.equal(restored.find('[data-action="add-row"][data-row-kind="vlans"]').disabled, true);
  assert.match(restored.get('builderContext').textContent, /remove VLAN creation rows/);
  restored.field('hostname', 'Restored');
  const restoredRows = restored.stored().instances[0].config.vlans;
  restored.action('remove-row', {'row-kind': 'vlans', 'row-id': restoredRows[0]._id});
  assert.equal(restored.stored().instances[0].config.vlans.length, 0);
});

check('all editable fields and row removal reach the generator contract', () => {
  const ui = boot(); basicRouter(ui);
  ui.field('description', 'LAN interface', 'interfaces'); ui.field('shutdown', true, 'interfaces');
  ui.action('add-row', {'row-kind': 'routes'});
  ui.field('network', '0.0.0.0', 'routes'); ui.field('mask', '0.0.0.0', 'routes'); ui.field('nextHop', '192.168.10.254', 'routes');
  const config = ui.stored().instances[0].config;
  assert.equal(config.interfaces[0].description, 'LAN interface'); assert.equal(config.interfaces[0].shutdown, true);
  assert.equal(config.routes[0].nextHop, '192.168.10.254');
  ui.action('generate'); assert.match(ui.get('builderPreview').value, /ip route 0\.0\.0\.0 0\.0\.0\.0 192\.168\.10\.254/);
  ui.action('remove-row', {'row-kind': 'routes', 'row-id': config.routes[0]._id});
  assert.equal(ui.stored().instances[0].config.routes.length, 0);
  assert.equal(ui.get('builderPreview').value, '');
  ui.api.addDevice(deviceId('2960-24TT'));
  ui.action('add-row', {'row-kind': 'vlans'}); ui.field('id', '10', 'vlans'); ui.field('name', 'Students', 'vlans');
  ui.action('add-row', {'row-kind': 'interfaces'}); ui.field('name', 'FastEthernet0/1', 'interfaces'); ui.field('vlan', '10', 'interfaces');
  ui.field('mode', 'trunk', 'interfaces'); ui.field('allowedVlans', '10,20', 'interfaces'); ui.field('nativeVlan', '10', 'interfaces');
  ui.field('management.enabled', true); ui.field('management.vlan', '10'); ui.field('management.address', '192.168.10.2'); ui.field('management.mask', '255.255.255.0'); ui.field('management.gateway', '192.168.10.1');
  ui.field('interfacesConfirmed', true); ui.action('generate');
  assert.equal(ui.get('builderErrors').textContent, '');
  assert.match(ui.get('builderPreview').value, /vlan 10/); assert.match(ui.get('builderPreview').value, /switchport trunk allowed vlan 10,20/);
  assert.match(ui.get('builderPreview').value, /ip default-gateway 192\.168\.10\.1/);
  ui.api.addDevice(deviceId('3560-24PS')); ui.field('enableRouting', true);
  assert.equal(ui.stored().instances.at(-1).config.enableRouting, true);
});

check('documentation-backed output permits valid parameter changes and every edit invalidates copy/export', () => {
  const ui = boot(); basicRouter(ui); ui.action('generate');
  assert.equal(ui.get('builderErrors').textContent, '');
  assertCliScript(ui.get('builderPreview').value);
  assert.match(ui.get('builderWarnings').textContent, /plaintext credentials/i);
  assert.match(ui.get('builderOutputStatus').textContent, /Documentation-backed.*Runtime-tested: No/);
  assert.match(ui.get('builderContext').textContent, /Command syntax: Documentation-backed/);
  assert.equal(ui.get('builderCopy').disabled, false);
  assert.match(ui.get('builderVerification').value, /show/);
  ui.field('description', 'Changed', 'interfaces');
  assert.equal(ui.get('builderPreview').value, ''); assert.equal(ui.get('builderVerification').value, '');
  assert.equal(ui.get('builderCopy').disabled, true); assert.equal(ui.get('builderDownload').disabled, true);
  ui.field('hostname', 'New-Router'); ui.field('address', '192.168.12.1', 'interfaces');
  ui.action('generate'); const format = ui.get('builderFormat'); format.value = 'cfg'; ui.emit('change', format);
  assertCliScript(ui.get('builderPreview').value);
  assert.match(ui.get('builderPreview').value, /hostname New-Router/); assert.match(ui.get('builderPreview').value, /192\.168\.12\.1/);
  assert.equal(ui.get('builderDownload').disabled, false);
  ui.field('mask', '255.0.255.0', 'interfaces'); ui.action('generate');
  assert(ui.get('builderErrors').textContent); assert.equal(ui.get('builderPreview').value, '');
  format.value = 'txt'; ui.emit('change', format); assert.equal(ui.get('builderPreview').value, '');
});

check('global version changes preserve configurations and invalidate outputs and all confirmations', () => {
  const ui = boot(); basicRouter(ui); ui.action('generate');
  const hostname = ui.find('[data-field="hostname"]');
  ui.setVersion('8');
  assert.equal(ui.find('[data-field="hostname"]'), hostname);
  assert.equal(ui.mount.querySelector('#builderVersion'), null);
  assert.equal(ui.stored().instances[0].config.interfaces[0].address, '192.168.10.1');
  assert(!Object.prototype.hasOwnProperty.call(ui.stored().instances[0], 'release'));
  assert.equal(ui.find('[data-field="interfacesConfirmed"]').checked, false);
  assert.equal(ui.get('builderPreview').value, '');
  assert.equal(ui.get('builderGenerate').disabled, true); ui.action('generate');
  assert.match(ui.get('builderErrors').textContent, /documentation|command/i);
  ui.field('interfacesConfirmed', true); ui.action('generate');
  assert.equal(ui.get('builderPreview').value, '');
  ui.setVersion('9'); ui.field('interfacesConfirmed', true); ui.action('generate');
  assert.equal(ui.get('builderErrors').textContent, '');
  ui.setVersion(''); assert.equal(ui.find('[data-field="interfacesConfirmed"]').checked, false);
  ui.field('interfacesConfirmed', true); ui.action('generate');
  assert.match(ui.get('builderErrors').textContent, /All versions.*not executable CLI/i);
  assert.equal(ui.get('builderGenerate').disabled, true);
  assert.equal(ui.get('builderPreview').value, '');
  assert.equal(ui.get('builderBom').disabled, false);
});

check('distinct ASA adapters and unknown availability never imply certified results', () => {
  const ui = boot(); ui.api.addDevice(deviceId('ASA5506-X'));
  assert.equal(ui.get('builderGenerate').disabled, false);
  assert(ui.mount.querySelector('#builderConfig-asa'));
  assert.equal(ui.mount.querySelector('#builderRows-interfaces'), null);
  assert.equal(ui.mount.querySelector('[data-config-path="system.ssh.enabled"]'), null);
  assert.equal(ui.stored().instances.length, 1);
  const unknown = boot({major: '6'}); unknown.api.addDevice(deviceId('ISR4321'));
  assert.match(unknown.get('builderContext').textContent, /availability is not verified/);
  unknown.action('generate');
  assert.match(unknown.get('builderContext').textContent + unknown.get('builderErrors').textContent, /availability|unknown|unverified|not verified/i);
  assert(!/certified/i.test(unknown.get('builderOutputStatus').textContent));
});

check('quantities enforce integer bounds and only selected-major compatibility maxima', () => {
  const db = JSON.parse(JSON.stringify(catalogue));
  const model = db.devices.find(item => item.pt_name === '1841');
  model.version_profiles['9'].modules = [{module_id: moduleId('HWIC-2T'), model: 'HWIC-2T', max_quantity: 2, verification_status: 'Verified', compatible: true}];
  model.version_profiles['8'].modules = [];
  const ui = boot({db}); ui.api.addDevice(model.device_id);
  assert.equal(ui.api.addModule(moduleId('HWIC-2T'), model.device_id), true);
  assert.equal(ui.api.addModule(moduleId('HWIC-2T'), model.device_id), true);
  assert.equal(ui.api.addModule(moduleId('HWIC-2T'), model.device_id), false);
  assert.equal(ui.stored().parts[0].quantity, 2);
  const part = ui.stored().parts[0];
  const quantity = ui.find(`[data-part-field="quantity"][data-part-id="${part.id}"]`);
  ui.field('interfacesConfirmed', true);
  quantity.value = '1'; ui.emit('input', quantity);
  assert.equal(ui.find('[data-field="interfacesConfirmed"]').checked, false);
  quantity.value = '2'; ui.emit('input', quantity);
  for (const value of ['', '0', '1.5', '100', '-1']) {
    quantity.value = value; ui.emit('input', quantity);
    assert.equal(quantity.getAttribute('aria-invalid'), 'true');
    assert.equal(ui.stored().parts[0].quantity, 2);
  }
  ui.action('generate'); assert.match(ui.get('builderErrors').textContent, /Correct invalid part/);
  ui.setVersion('8');
  const rebuilt = ui.find(`[data-part-field="quantity"][data-part-id="${part.id}"]`);
  assert.equal(rebuilt.value, '2');
  assert.match(ui.get('builderParts').textContent, /No cross-version compatibility was used/);
  rebuilt.value = '3'; ui.emit('input', rebuilt);
  assert.equal(rebuilt.getAttribute('aria-invalid'), null);
  assert.equal(ui.stored().parts[0].quantity, 3);
  ui.action('generate');
  assert(!/Correct invalid part/.test(ui.get('builderErrors').textContent));
  ui.setVersion('9'); ui.action('generate'); assert.match(ui.get('builderErrors').textContent, /recorded maximum is 2/);
});

check('part attachment errors stay visible, correcting them is possible, and aggregate limits apply', () => {
  const db = JSON.parse(JSON.stringify(catalogue));
  const model = db.devices.find(item => item.pt_name === '1841');
  model.version_profiles['9'].modules = [{module_id: moduleId('HWIC-2T'), max_quantity: 1, verification_status: 'Partial', compatible: true}];
  const ui = boot({db}); ui.api.addDevice(model.device_id); ui.api.addModule(moduleId('HWIC-2T'));
  const part = ui.stored().parts[0], instanceId = ui.stored().instances[0].id;
  const attach = ui.find(`[data-part-field="instanceId"][data-part-id="${part.id}"]`);
  attach.value = instanceId; ui.emit('change', attach);
  assert.equal(ui.stored().parts[0].instanceId, instanceId);
  assert.match(ui.get('builderSelectionStatus').textContent, /Partial/);
  ui.api.addModule(moduleId('HWIC-2T'));
  const loose = ui.stored().parts.find(item => item.instanceId === null);
  const secondAttach = ui.find(`[data-part-field="instanceId"][data-part-id="${loose.id}"]`);
  secondAttach.value = instanceId; ui.emit('change', secondAttach);
  assert.equal(secondAttach.getAttribute('aria-invalid'), 'true');
  assert.equal(ui.stored().parts.find(item => item.id === loose.id).instanceId, null);
  secondAttach.value = ''; ui.emit('change', secondAttach);
  assert.equal(secondAttach.getAttribute('aria-invalid'), null);
  ui.action('remove-device', {'instance-id': instanceId});
  assert(ui.stored().parts.every(item => item.instanceId === null));
});

check('same-model part rows aggregate for generation without changing the cart', () => {
  let received;
  const ui = boot({engineOverride: engine => ({...engine, generate(item, model, context) { received = JSON.parse(JSON.stringify(item)); return engine.generate(item, model, context); }})}); ui.api.addDevice(deviceId('1841'));
  ui.api.addModule(moduleId('HWIC-2T'), deviceId('1841'));
  ui.api.addModule(moduleId('HWIC-2T'));
  const loose = ui.stored().parts.find(part => part.instanceId === null);
  const attachment = ui.find(`[data-part-field="instanceId"][data-part-id="${loose.id}"]`);
  attachment.value = ui.stored().instances[0].id; ui.emit('change', attachment);
  ui.action('generate');
  assert.equal(ui.get('builderErrors').textContent, '');
  assert.deepEqual(received.modules, [{moduleId: moduleId('HWIC-2T'), quantity: 2}]);
  assert.equal(ui.stored().parts.length, 2);
  assert(ui.stored().parts.every(part => part.quantity === 1));
});

check('repeated duplicates and new devices have unique bounded default hostnames', () => {
  const ui = boot(); ui.api.addDevice(deviceId('2911'));
  const id = ui.stored().instances[0].id;
  ui.action('duplicate', {'instance-id': id}); ui.action('duplicate', {'instance-id': id});
  let names = ui.stored().instances.map(instance => instance.config.hostname);
  assert.equal(new Set(names).size, 3); assert(names.includes('R1-copy-2'));
  ui.field('hostname', 'A'.repeat(63));
  const longId = ui.stored().instances.at(-1).id;
  ui.action('duplicate', {'instance-id': longId}); ui.action('duplicate', {'instance-id': longId});
  names = ui.stored().instances.map(instance => instance.config.hostname);
  assert.equal(new Set(names).size, names.length); assert(names.every(name => name.length <= 63));
});

check('duplicate, remove and confirmed clear preserve distinct instance configurations', () => {
  const ui = boot(); basicRouter(ui);
  const original = ui.stored().instances[0];
  ui.api.addModule(moduleId('HWIC-2T'), original.deviceId);
  ui.action('duplicate', {'instance-id': original.id});
  const duplicate = ui.stored().instances[1];
  assert.equal(duplicate.config.hostname, original.config.hostname + '-copy');
  assert.equal(duplicate.config.interfaces[0].address, original.config.interfaces[0].address);
  assert.notEqual(duplicate.config.interfaces[0]._id, original.config.interfaces[0]._id);
  assert.equal(ui.stored().parts.filter(part => part.instanceId === duplicate.id).length, 1);
  ui.field('hostname', 'Branch2');
  assert.equal(ui.stored().instances[0].config.hostname, original.config.hostname);
  ui.action('select', {'instance-id': original.id}); assert.equal(ui.find('[data-field="hostname"]').value, original.config.hostname);
  ui.action('remove-device', {'instance-id': original.id}); assert.equal(ui.stored().instances.length, 1);
  assert(ui.stored().parts.some(part => part.instanceId === null));
  ui.action('clear'); assert.equal(ui.confirmCalls(), 1); assert.equal(ui.stored().instances.length, 0); assert.equal(ui.stored().parts.length, 0);
  assert.equal(ui.counts.at(-1), 0);
  const cancelled = boot({confirm: false}); cancelled.api.addDevice(deviceId('2911')); cancelled.action('clear'); assert.equal(cancelled.stored().instances.length, 1);
});

check('versioned persistence restores only whitelisted fields, not output or confirmations', () => {
  const ui = boot(); basicRouter(ui); ui.api.addModule(moduleId('HWIC-2T'), deviceId('2911')); ui.action('generate');
  const saved = ui.stored(); saved.instances[0].config.password = 'must-not-survive'; saved.instances[0].config.management.secret = 'must-not-survive'; saved.instances[0].release = '9.0.1';
  ui.storage.set(storageKey, JSON.stringify(saved));
  const restored = boot({storage: ui.storage});
  assert.equal(restored.mount.querySelector('[data-field="release"]'), null);
  assert.equal(restored.find('[data-field="interfacesConfirmed"]').checked, false);
  assert.equal(restored.get('builderPreview').value, '');
  assert.equal(restored.get('builderCopy').disabled, true);
  restored.field('hostname', 'Restored');
  assert(!restored.storage.get(storageKey).includes('must-not-survive'));
  assert(!Object.prototype.hasOwnProperty.call(restored.stored().instances[0], 'release'));
  assert.equal(restored.stored().parts[0].instanceId, restored.stored().instances[0].id);
  for (const raw of ['{', JSON.stringify({schema: 9, instances: [], parts: []}), 'x'.repeat(100001)]) {
    const invalid = boot({storage: new Map([[storageKey, raw]])});
    assert.match(invalid.get('builderSelectionStatus').textContent, /unavailable or invalid/);
    assert.equal(invalid.api.addDevice(deviceId('2911')), true);
  }
  const denied = boot({denyStorage: true}); assert.equal(denied.api.addDevice(deviceId('2911')), true);
  assert.equal(denied.get('builderDevicePicker').disabled, false);
  assert.match(denied.get('builderSelectionStatus').textContent, /added.*could not be saved locally/);
  assert.equal(denied.api.addModule(moduleId('HWIC-2T')), true);
  assert.match(denied.get('builderSelectionStatus').textContent, /added.*could not be saved locally/);
  denied.window.localStorage.setItem = (key, value) => denied.storage.set(key, value);
  denied.field('hostname', 'StorageRecovered');
  assert(!/could not be saved locally/.test(denied.get('builderSelectionStatus').textContent));
});

check('clipboard API, fallback and clear failure state operate without stale previews', async () => {
  const ui = boot(); basicRouter(ui); ui.action('generate'); const text = ui.get('builderPreview').value;
  assertCliScript(text);
  ui.action('copy'); await new Promise(resolve => setImmediate(resolve)); assert.equal(ui.clipboard[0], text); assert.match(ui.get('builderOutputStatus').textContent, /copied/);
  ui.field('hostname', 'NewName'); ui.action('copy'); await Promise.resolve(); assert.equal(ui.clipboard.length, 1);
  const fallback = boot({clipboard: false, execCopy: true}); basicRouter(fallback); fallback.action('generate');
  const opener = fallback.get('builderCopy'); opener.focus(); fallback.action('copy'); await Promise.resolve();
  assert(fallback.get('builderPreview').selectionRequested); assert.equal(fallback.document.activeElement, opener); assert.match(fallback.get('builderOutputStatus').textContent, /copied/);
  const rejected = boot({clipboardReject: true}); basicRouter(rejected); rejected.action('generate'); rejected.action('copy'); await new Promise(resolve => setImmediate(resolve));
  assert.match(rejected.get('builderOutputStatus').textContent, /Copy unavailable/); assert(rejected.get('builderPreview').selectionRequested);
  const pending = boot(); basicRouter(pending); pending.action('generate');
  let resolveCopy;
  pending.window.navigator.clipboard.writeText = () => new Promise(resolve => { resolveCopy = resolve; });
  pending.action('copy'); pending.field('hostname', 'EditedDuringCopy'); resolveCopy();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.get('builderOutputStatus').textContent, 'Not generated');
});

check('txt/cfg downloads use safe filenames and revoke Blob URLs; BOM resists CSV formulas', () => {
  const ui = boot(); basicRouter(ui); ui.action('generate'); ui.action('download');
  const first = ui.document.downloads[0]; assert(first.filename.endsWith('.txt')); assert(ui.revoked.includes(first.href));
  assert.equal(ui.blobs.get(first.href).text, ui.get('builderPreview').value);
  assertCliScript(ui.blobs.get(first.href).text);
  const format = ui.get('builderFormat'); format.value = 'cfg'; ui.emit('change', format); ui.action('download');
  assert(ui.document.downloads[1].filename.endsWith('.cfg'));
  assertCliScript(ui.blobs.get(ui.document.downloads[1].href).text);
  ui.field('hostname', 'Changed'); ui.action('download'); assert.equal(ui.document.downloads.length, 2);
  for (const value of ['=1+1', '\n=SUM(1,1)', '   =1+1', '\t@bad']) {
    ui.field('hostname', value); ui.action('bom');
    const last = ui.document.downloads.at(-1), csv = ui.blobs.get(last.href).text;
    assert(last.filename.endsWith('.csv')); assert(csv.includes('"\'' + value.replace(/"/g, '""') + '"'), 'Unescaped spreadsheet formula');
    assert(ui.revoked.includes(last.href));
  }
});

check('both CLI formats retain command boundaries in preview, clipboard and downloads for IOS and ASA', async () => {
  for (const name of ['2911', '2960-24TT', 'ASA5506-X']) {
    const ui = boot(); ui.api.addDevice(deviceId(name));
    assert.match(ui.get('builderFormat').querySelector('option[value="cfg"]').textContent, /CLI script/);
    for (const extension of ['txt', 'cfg']) {
      const format = ui.get('builderFormat'); format.value = extension; ui.emit('change', format); ui.action('generate');
      const text = ui.get('builderPreview').value;
      assert.equal(ui.get('builderErrors').textContent, ''); assertCliScript(text);
      assert.match(text, /^hostname /m);
      ui.action('copy'); await new Promise(resolve => setImmediate(resolve));
      assert.equal(ui.clipboard.at(-1), text); assertCliScript(ui.clipboard.at(-1));
      ui.action('download'); const file = ui.document.downloads.at(-1);
      assert(file.filename.endsWith('.' + extension));
      assert.equal(ui.blobs.get(file.href).text, text); assertCliScript(ui.blobs.get(file.href).text);
    }
  }
});

check('global All to 9 to 6 to All refreshes coverage, keeps the cart and resets every confirmation', () => {
  const ui = boot({major: ''}); basicRouter(ui);
  const first = ui.stored().instances[0].id;
  ui.api.addDevice(deviceId('ISR4321')); ui.field('interfacesConfirmed', true);
  ui.action('select', {'instance-id': first}); ui.field('interfacesConfirmed', true); ui.action('generate');
  const ids = ui.stored().instances.map(instance => instance.id);
  assert.match(ui.get('builderCoverage').innerHTML, /Unverified combined draft/);
  for (const version of ['9', '6', '']) {
    ui.setVersion(version);
    assert.deepEqual(ui.stored().instances.map(instance => instance.id), ids);
    assert(ui.stored().instances.every(instance => instance.config.interfacesConfirmed === false));
    assert.equal(ui.get('builderPreview').value, ''); assert.equal(ui.get('builderVerification').value, '');
    assert.equal(ui.get('builderCopy').disabled, true); assert.equal(ui.get('builderDownload').disabled, true);
    assert.match(ui.get('builderCoverage').innerHTML, version ? /template untested/ : /Unverified combined draft/);
    assert.equal(ui.stored().instances[0].config.interfaces[0].address, '192.168.10.1');
  }
});

check('global version hides unavailable additions but retains flagged existing instances and unknown parts', () => {
  const ui = boot({major: ''}); ui.api.addDevice(deviceId('C8200')); const id = ui.stored().instances[0].id;
  ui.setVersion('8');
  assert(!ui.get('builderDevicePicker').querySelectorAll('option').some(option => option.value === String(deviceId('C8200'))));
  assert.equal(ui.api.addDevice(deviceId('C8200')), false);
  assert.equal(ui.stored().instances[0].id, id);
  assert.match(ui.get('builderDevices').innerHTML, /not available in 8\.x/);
  assert.equal(ui.get('builderGenerate').disabled, true); ui.action('generate'); assert.equal(ui.get('builderPreview').value, '');
  assert(ui.get('builderModulePicker').querySelector('optgroup[label="Not verified"]'));
  const db = JSON.parse(JSON.stringify(catalogue)); const model = db.devices.find(item => item.pt_name === '1841');
  model.version_profiles['9'].modules = [{module_id: moduleId('HWIC-2T'), compatible: true, major_version: 9, verification_status: 'Verified', max_quantity: 2}];
  model.version_profiles['6'].modules = [{module_id: moduleId('HWIC-2T'), compatible: true, major_version: 9, verification_status: 'Verified', max_quantity: 2}];
  const scoped = boot({db, major: '6'});
  const option = scoped.get('builderModulePicker').querySelector(`option[value="${moduleId('HWIC-2T')}"]`);
  assert.match(option.textContent, /not verified for 6\.x/);
});

check('nested IOS services generate typed routing, DHCP, ACL, PAT and session-only credentials', () => {
  const ui = boot(); basicRouter(ui);
  const first = ui.stored().instances[0].config.interfaces[0]._id;
  ui.config(`interfaces.@${first}.natRole`, 'inside');
  ui.action('add-row', {'row-kind': 'interfaces'});
  ui.field('name', 'GigabitEthernet0/1', 'interfaces', 1); ui.field('address', '203.0.113.2', 'interfaces', 1); ui.field('mask', '255.255.255.252', 'interfaces', 1);
  const second = ui.stored().instances[0].config.interfaces[1]._id;
  ui.config(`interfaces.@${second}.natRole`, 'outside');
  const domain = ui.config('system.domainName', 'lab.test'); domain.focus();
  ui.config('system.domainName', 'network.lab.test'); assert.equal(ui.document.activeElement, domain); assert.equal(ui.find('[data-config-path="system.domainName"]'), domain);
  ui.config('system.enableSecret', 'EnableSessionOnly42');
  ui.action('add-config-row', {'config-list': 'system.users'});
  const user = ui.stored().instances[0].config.system.users[0]._id;
  ui.config(`system.users.@${user}.name`, 'operator'); ui.config(`system.users.@${user}.secret`, 'UserSessionOnly42'); ui.config(`system.users.@${user}.privilege`, '15');
  ui.config('system.ssh.enabled', true);
  assert.equal(ui.find('[data-config-path="system.enableSecret"]').type, 'password');
  assert(!ui.storage.get(storageKey).includes('EnableSessionOnly42')); assert(!ui.storage.get(storageKey).includes('UserSessionOnly42'));
  ui.config('protocols.ospf.enabled', true); ui.config('protocols.ospf.routerId', '1.1.1.1');
  ui.action('add-config-row', {'config-list': 'protocols.ospf.networks'});
  const ospf = ui.stored().instances[0].config.protocols.ospf.networks[0]._id;
  ui.config(`protocols.ospf.networks.@${ospf}.network`, '192.168.10.0'); ui.config(`protocols.ospf.networks.@${ospf}.wildcard`, '0.0.0.255'); ui.config(`protocols.ospf.networks.@${ospf}.area`, '0');
  ui.action('add-config-row', {'config-list': 'dhcp.pools'});
  const pool = ui.stored().instances[0].config.dhcp.pools[0]._id;
  for (const [key, value] of Object.entries({name: 'LAN', network: '192.168.10.0', mask: '255.255.255.0', gateway: '192.168.10.1', dns: '8.8.8.8', domain: 'lab.test'})) ui.config(`dhcp.pools.@${pool}.${key}`, value);
  ui.action('add-config-row', {'config-list': 'acls'});
  const acl = ui.stored().instances[0].config.acls[0]._id; ui.config(`acls.@${acl}.name`, 'LAN');
  ui.action('add-config-row', {'config-list': `acls.@${acl}.entries`});
  const entry = ui.stored().instances[0].config.acls[0].entries[0]._id;
  ui.config(`acls.@${acl}.entries.@${entry}.source`, '192.168.10.0'); ui.config(`acls.@${acl}.entries.@${entry}.sourceWildcard`, '0.0.0.255');
  ui.action('add-config-row', {'config-list': 'nat.pat'}); const pat = ui.stored().instances[0].config.nat.pat[0]._id;
  ui.config(`nat.pat.@${pat}.acl`, 'LAN'); ui.config(`nat.pat.@${pat}.interface`, 'GigabitEthernet0/1');
  ui.field('interfacesConfirmed', true); ui.action('generate');
  assert.equal(ui.get('builderErrors').textContent, '');
  const text = ui.get('builderPreview').value;
  assert.match(text, /router ospf 1/); assert.match(text, /ip dhcp pool LAN/); assert.match(text, /ip access-list standard LAN/);
  assert.match(text, /ip nat inside source list LAN interface GigabitEthernet0\/1 overload/);
  assert.match(text, /EnableSessionOnly42/); assert.match(text, /UserSessionOnly42/);
  assert.match(ui.get('builderWarnings').textContent, /plaintext credentials/i);
  const instance = ui.stored().instances[0]; ui.action('duplicate', {'instance-id': instance.id});
  assert.equal(ui.find('[data-config-path="system.enableSecret"]').value, '');
  assert.equal(ui.find(`[data-config-path="system.users.@${ui.stored().instances.at(-1).config.system.users[0]._id}.secret"]`).value, '');
  assert.match(ui.get('builderSelectionStatus').textContent, /Credentials.*not copied/);
});

check('routed SVI services and identity confirmation work on multilayer switches', () => {
  const ui = boot(); ui.api.addDevice(deviceId('3650-24PS')); ui.field('enableRouting', true);
  ui.action('add-row', {'row-kind': 'vlans'}); ui.field('id', '10', 'vlans'); ui.field('name', 'Students', 'vlans');
  ui.action('add-config-row', {'config-list': 'svis'}); const id = ui.stored().instances[0].config.svis[0]._id;
  const prefix = `svis.@${id}`;
  ui.config(prefix + '.vlan', '10'); ui.config(prefix + '.address', '192.168.10.2'); ui.config(prefix + '.mask', '255.255.255.0');
  ui.config(prefix + '.helperAddress', '192.168.20.1'); ui.config(prefix + '.hsrp.enabled', true); ui.config(prefix + '.hsrp.address', '192.168.10.1'); ui.config(prefix + '.hsrp.preempt', true);
  ui.field('interfacesConfirmed', true); ui.action('generate');
  assert.equal(ui.get('builderErrors').textContent, ''); assert.match(ui.get('builderPreview').value, /interface Vlan10/);
  assert.match(ui.get('builderPreview').value, /ip helper-address 192\.168\.20\.1/); assert.match(ui.get('builderPreview').value, /standby 1 ip 192\.168\.10\.1/);
  ui.config(prefix + '.vlan', '20'); assert.equal(ui.find('[data-field="interfacesConfirmed"]').checked, false);
  assert.equal(ui.get('builderPreview').value, '');
});

check('ASA interfaces and routes generate while undocumented NAT object transitions stay blocked', () => {
  const ui = boot(); ui.api.addDevice(deviceId('ASA5506-X'));
  ui.action('add-config-row', {'config-list': 'system.users'}); const user = ui.stored().instances[0].config.system.users[0]._id;
  assert.equal(ui.mount.querySelector(`[data-config-path="system.users.@${user}.privilege"]`), null);
  assert.equal(ui.mount.querySelector('[data-config-path="system.ssh.enabled"]'), null);
  ui.config(`system.users.@${user}.name`, 'operator'); ui.config(`system.users.@${user}.secret`, 'ASASessionPassword42');
  ui.config('system.enableSecret', 'ASAEnablePassword42');
  for (const data of [{name: 'GigabitEthernet1/1', nameif: 'inside', securityLevel: '100', address: '192.168.1.1', mask: '255.255.255.0'}, {name: 'GigabitEthernet1/2', nameif: 'outside', securityLevel: '0', address: '203.0.113.2', mask: '255.255.255.252'}]) {
    ui.action('add-config-row', {'config-list': 'asa.interfaces'}); const id = ui.stored().instances[0].config.asa.interfaces.at(-1)._id;
    for (const [key, value] of Object.entries(data)) ui.config(`asa.interfaces.@${id}.${key}`, value);
  }
  ui.action('add-config-row', {'config-list': 'asa.routes'}); const route = ui.stored().instances[0].config.asa.routes[0]._id;
  for (const [key, value] of Object.entries({nameif: 'outside', network: '0.0.0.0', mask: '0.0.0.0', nextHop: '203.0.113.1'})) ui.config(`asa.routes.@${route}.${key}`, value);
  ui.field('interfacesConfirmed', true); ui.action('generate');
  assert.equal(ui.get('builderErrors').textContent, '');
  assert.match(ui.get('builderPreview').value, /nameif inside/); assert.match(ui.get('builderPreview').value, /route outside 0\.0\.0\.0 0\.0\.0\.0 203\.0\.113\.1/);
  assert(!/username operator.*privilege/.test(ui.get('builderPreview').value));
  ui.action('add-config-row', {'config-list': 'asa.objects'}); const object = ui.stored().instances[0].config.asa.objects[0]._id;
  for (const [key, value] of Object.entries({name: 'LAN', network: '192.168.1.0', mask: '255.255.255.0', inside: 'inside', outside: 'outside', dynamicInterface: true})) ui.config(`asa.objects.@${object}.${key}`, value);
  ui.field('interfacesConfirmed', true); ui.action('generate');
  assert.match(ui.get('builderErrors').textContent, /No reviewed official syntax.*asa\.object\.exit/);
  assert.equal(ui.get('builderPreview').value, ''); assert.equal(ui.get('builderCopy').disabled, true); assert.equal(ui.get('builderDownload').disabled, true);
  assert(!ui.storage.get(storageKey).includes('ASASessionPassword42')); assert(!ui.storage.get(storageKey).includes('ASAEnablePassword42'));
});

check('all GUI adapters provide typed presets, honest TXT worksheets, and session-only values', () => {
  for (const name of ['AccessPoint-PT', 'LAP-PT', '3702i', 'WLC-2504', 'WLC-3504', 'HomeRouter', 'MX65W', 'Cloud-PT']) {
    const ui = boot({major: ''}); ui.api.addDevice(deviceId(name));
    const info = ui.window.PTConfigBuilder.describe(ui.db.devices.find(model => model.pt_name === name), {major: ''});
    assert.equal(info.platform, 'gui-plan'); assert(info.worksheetFields.length);
    assert.equal(ui.mount.querySelector('#builderRows-interfaces'), null);
    assert.equal(ui.mount.querySelector('[data-config-path="system.enableSecret"]'), null);
    assert.equal(ui.get('builderFormat').value, 'txt'); assert.equal(ui.get('builderFormat').querySelector('option[value="cfg"]').disabled, true);
    for (const definition of info.worksheetFields) {
      const row = ui.stored().instances[0].config.settings.find(setting => setting.label === definition.label);
      assert(row, 'Preset not seeded: ' + name + ' / ' + definition.label);
      const control = ui.find(`[data-config-path="settings.@${row._id}.value"]`);
      assert(control.closest('label'));
      if (definition.readOnly) { assert.equal(control.getAttribute('readonly'), ''); continue; }
      const value = definition.type === 'checkbox' ? true : definition.choices ? definition.choices[0] : definition.type === 'number' ? '1' : definition.type === 'password' ? 'WorksheetSessionSecret42' : 'ManualValue';
      ui.config(`settings.@${row._id}.value`, value);
      if (definition.type === 'checkbox') assert.equal(control.dataset.valueType, 'worksheet-checkbox');
      if (definition.type === 'password') assert.equal(control.type, 'password');
    }
    if (name === 'LAP-PT' || name === '3702i') assert(!ui.stored().instances[0].config.settings.some(row => row.label === 'SSID'));
    ui.action('generate'); assert.equal(ui.get('builderErrors').textContent, '', name);
    assert.match(ui.get('builderPreview').value, /manual configuration worksheet/i); assert(!/^configure terminal$/m.test(ui.get('builderPreview').value));
    assert.equal(ui.get('builderOutputStatus').textContent, 'Manual configuration worksheet');
    assert.equal(ui.get('builderVerification').closest('details').querySelector('summary').textContent, 'Verification checklist');
    ui.action('download'); assert(ui.document.downloads.at(-1).filename.endsWith('.txt'));
    assert(ui.stored().instances[0].config.settings.every(row => row.value === ''));
    assert(!ui.storage.get(storageKey).includes('WorksheetSessionSecret42'));
    assert(!ui.storage.get(storageKey).includes('ManualValue'));
  }
});

check('nested add/remove and preset setting controls repair keyboard focus', () => {
  const ui = boot(); ui.api.addDevice(deviceId('2911'));
  ui.action('add-config-row', {'config-list': 'acls'}); const acl = ui.stored().instances[0].config.acls[0]._id;
  ui.action('add-config-row', {'config-list': `acls.@${acl}.entries`}); const entry = ui.stored().instances[0].config.acls[0].entries[0]._id;
  assert(ui.mount.contains(ui.document.activeElement)); assert(ui.document.activeElement.closest(`[data-config-row="acls.@${acl}.entries.@${entry}"]`));
  ui.action('remove-config-row', {'config-list': `acls.@${acl}.entries`, 'row-id': entry});
  assert(ui.mount.contains(ui.document.activeElement)); assert.equal(ui.document.activeElement.dataset.action, 'add-config-row');
  ui.api.addDevice(deviceId('AccessPoint-PT')); const setting = ui.stored().instances.at(-1).config.settings.find(row => row.label === 'SSID');
  ui.action('remove-config-row', {'config-list': 'settings', 'row-id': setting._id});
  ui.get('builderSettingPicker').value = 'SSID'; ui.action('add-setting');
  assert(ui.mount.contains(ui.document.activeElement)); assert.equal(ui.document.activeElement.dataset.configPath?.split('.').at(-1), 'value');
});

check('all 34 component editors render platform sections and 52 honest coverage rows', () => {
  const ui = boot({major: ''});
  for (const model of ui.db.devices) {
    assert.equal(ui.api.addDevice(model.device_id), true);
    const info = ui.window.PTConfigBuilder.describe(model, {major: ''});
    assert.equal(info.coverage.length, 52);
    assert.equal(ui.get('builderCoverage').querySelectorAll('tbody tr').length, 52);
    assert.equal(ui.mount.querySelector('#builderVersion'), null); assert.equal(ui.mount.querySelector('[data-field="release"]'), null);
    for (const section of info.sections.filter(key => ['system', 'svis', 'protocols', 'switching', 'dhcp', 'acls', 'nat', 'asa', 'settings'].includes(key))) assert(ui.mount.querySelector('#builderConfig-' + section), model.pt_name + ' / ' + section);
    for (const input of ui.mount.querySelectorAll('input')) assert(input.closest('label'), model.pt_name + ': unlabelled input');
    for (const control of ui.mount.querySelectorAll('select')) assert(control.closest('label'), model.pt_name + ': unlabelled select');
    assert.match(ui.get('builderCoverage').innerHTML, /Unverified combined draft/);
  }
});

check('missing documentation blocks every CLI model even when inventory is observed', () => {
  for (const major of ['', '6', '7', '8', '9']) {
    const ui = boot({documentation: null, major: ''});
    for (const model of ui.db.devices.filter(model => ui.window.PTConfigBuilder.describe(model).cli)) {
      ui.setVersion(''); ui.api.addDevice(model.device_id); ui.setVersion(major);
      assert.equal(ui.get('builderGenerate').disabled, true, model.pt_name + ' / ' + major);
      assert.match(ui.get('builderContext').textContent, /Command syntax: Unknown/);
      assert.match(ui.get('builderErrors').textContent, /CLI generation blocked/);
      ui.get('builderGenerate').disabled = false; ui.action('generate');
      assert.equal(ui.get('builderPreview').value, ''); assert.equal(ui.get('builderVerification').value, '');
      assert.equal(ui.get('builderCopy').disabled, true); assert.equal(ui.get('builderDownload').disabled, true);
      ui.action('copy'); ui.action('download');
      assert.equal(ui.clipboard.length, 0); assert.equal(ui.document.downloads.length, 0);
    }
    assert.equal(ui.get('builderBom').disabled, false); ui.action('bom');
    assert.equal(ui.document.downloads.length, 1);
  }
  const ui = boot({documentation: null}); ui.api.addDevice(deviceId('2911'));
  assert.match(ui.get('builderContext').textContent, /Inventory observed release: 9\.0\.1/);
  assert.match(ui.get('builderContext').textContent, /Command syntax: Unknown/);
});

check('model runtime cases never label unrecorded current settings as runtime-tested', () => {
  const ui = boot({manifest: syntheticRuntimeManifest('Recorded-Router')}); basicRouter(ui);
  assert.equal(ui.get('builderGenerate').disabled, false);
  assert.match(ui.get('builderContext').textContent, /Command syntax: Documentation-backed/);
  ui.action('generate');
  assert.equal(ui.get('builderErrors').textContent, ''); assertCliScript(ui.get('builderPreview').value);
  assert.match(ui.get('builderOutputStatus').textContent, /Documentation-backed.*Runtime-tested: No/);
  ui.field('hostname', 'Recorded-Router'); ui.action('generate');
  assert.match(ui.get('builderOutputStatus').textContent, /^Runtime-tested · Packet Tracer 9\.0\.1$/);
  const format = ui.get('builderFormat'); format.value = 'cfg'; ui.emit('change', format);
  assert.match(ui.get('builderOutputStatus').textContent, /Documentation-backed.*Runtime-tested: No/);
  format.value = 'txt'; ui.emit('change', format);
  assert.match(ui.get('builderOutputStatus').textContent, /^Runtime-tested/);
  ui.field('address', '192.168.11.1', 'interfaces'); ui.action('generate');
  assert.match(ui.get('builderOutputStatus').textContent, /Documentation-backed.*Runtime-tested: No/);
});

check('bare successful text and mismatched documentation or runtime metadata cannot enable output', () => {
  const variants = [
    () => undefined,
    row => ({...row, status: 'Unknown'}),
    row => ({...row, model: '1841'}),
    row => ({...row, majorVersion: '8'}),
    row => ({...row, documentedRelease: '8.2.2'}),
    row => ({...row, documentedRelease: '9.2.1'}),
    row => ({...row, documentationRecordId: ''}),
    row => ({...row, documentationRecordId: 'wrong-record'}),
    row => ({...row, documentationSources: []}),
    row => ({...row, documentationSources: ['https://example.com/untrusted']}),
    row => ({...row, documentationSources: row.documentationSources.map(url => url.replace('/default/', '/default/./'))}),
    row => ({...row, documentationSources: row.documentationSources.map(url => url.replace('/default/', '/default//'))}),
    row => ({...row, runtime: undefined}),
    row => ({...row, runtime: {status: 'Verified', observedRelease: '9.0.1', recordId: 'fake'}}),
    row => ({...row, status: 'Runtime-tested', runtime: {status: 'Verified', observedRelease: '9.0.1', recordId: 'fake'}}),
    row => ({...row, status: 'Runtime-tested', runtime: {status: 'Unknown', observedRelease: null, recordId: null}})
  ];
  for (const variant of variants) {
    const ui = boot({engineOverride: engine => ({...engine, generate(...args) { const result = engine.generate(...args); return {...result, verification: variant(result.verification)}; }})});
    basicRouter(ui); ui.action('generate');
    assert.match(ui.get('builderErrors').textContent, /matching command documentation or runtime evidence/);
    assert.equal(ui.get('builderPreview').value, ''); assert.equal(ui.get('builderVerification').value, '');
    assert.equal(ui.get('builderCopy').disabled, true); assert.equal(ui.get('builderDownload').disabled, true);
    ui.action('copy'); ui.action('download');
    assert.equal(ui.clipboard.length, 0); assert.equal(ui.document.downloads.length, 0);
  }
});

check('missing malformed and unavailable status evidence fails closed even through a forced generate action', () => {
  const variants = [
    () => undefined,
    row => ({...row, status: 'Verified'}),
    row => ({...row, status: 'Partial'}),
    row => ({...row, documentedRelease: null}),
    row => ({...row, documentedRelease: '9'}),
    row => ({...row, documentedRelease: '8.2.2'}),
    row => ({...row, model: '1841'}),
    row => ({...row, majorVersion: '8'}),
    row => ({...row, documentationRecordId: null}),
    row => ({...row, documentationSources: null}),
    row => ({...row, documentationSources: ['http://tutorials.ptnetacad.net/help/default/CLI_routerIOS15.htm']}),
    row => ({...row, documentationSources: row.documentationSources.map(url => url.replace('/default/', '/default/./'))}),
    row => ({...row, documentationSources: row.documentationSources.map(url => url.replace('/default/', '/default//'))}),
    row => ({...row, documentationSources: row.documentationSources.map(url => url.replace('/default/', '/default/../'))})
  ];
  for (const variant of variants) {
    let calls = 0;
    const ui = boot({engineOverride: engine => ({...engine, verificationStatus: (...args) => variant(engine.verificationStatus(...args)), generate() { calls++; return {ok: true, text: 'unsafe'}; }})});
    basicRouter(ui); assert.equal(ui.get('builderGenerate').disabled, true);
    ui.get('builderGenerate').disabled = false; ui.action('generate');
    assert.equal(calls, 0); assert.match(ui.get('builderErrors').textContent, /CLI generation blocked/);
    assert.equal(ui.get('builderPreview').value, '');
  }
  const missing = boot({engineOverride: engine => ({...engine, verificationStatus: undefined})}); basicRouter(missing);
  assert.equal(missing.get('builderGenerate').disabled, true);
  const throwing = boot({engineOverride: engine => ({...engine, verificationStatus() { throw new Error('Missing evidence'); }})}); basicRouter(throwing);
  assert.equal(throwing.get('builderGenerate').disabled, true); assert.match(throwing.get('builderErrors').textContent, /unavailable/);
});

check('copy and download recheck documentation and global context before using prior output', async () => {
  let trusted = true;
  const ui = boot({engineOverride: engine => ({...engine, verificationStatus(model, context) { return trusted ? engine.verificationStatus(model, context) : {status: 'Unknown', observedRelease: null, reason: 'Evidence withdrawn.'}; }})});
  basicRouter(ui); ui.action('generate'); assert(ui.get('builderPreview').value);
  trusted = false; ui.action('copy'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.clipboard.length, 0); assert.equal(ui.get('builderPreview').value, '');
  assert.equal(ui.get('builderCopy').disabled, true); assert.equal(ui.get('builderDownload').disabled, true);
  assert.match(ui.get('builderErrors').textContent, /Evidence withdrawn/);
  const changed = boot(); basicRouter(changed); changed.action('generate');
  changed.settings.getVersion = () => '8'; changed.action('download');
  assert.equal(changed.document.downloads.length, 0); assert.equal(changed.get('builderPreview').value, '');
  for (const action of ['copy', 'download']) {
    let recordId = null;
    const replaced = boot({engineOverride: engine => ({...engine, verificationStatus(...args) { const row = engine.verificationStatus(...args); return recordId ? {...row, documentationRecordId: recordId} : row; }})});
    basicRouter(replaced); replaced.action('generate'); recordId = 'replacement-documentation'; replaced.action(action);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(replaced.clipboard.length, 0); assert.equal(replaced.document.downloads.length, 0);
    assert.equal(replaced.get('builderPreview').value, '');
  }
});

check('withdrawn exact runtime evidence invalidates runtime-labelled output without blocking documentation', async () => {
  let runtimeAvailable = true;
  const ui = boot({manifest: syntheticRuntimeManifest(), engineOverride: engine => ({...engine, verificationStatus(...args) { const row = engine.verificationStatus(...args); return runtimeAvailable ? row : {...row, runtime: {status: 'Unknown', observedRelease: null, recordCount: 0, recordIds: []}}; }})});
  basicRouter(ui); ui.action('generate'); assert.match(ui.get('builderOutputStatus').textContent, /^Runtime-tested/);
  runtimeAvailable = false; ui.action('copy'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.clipboard.length, 0); assert.equal(ui.get('builderPreview').value, '');
  assert.equal(ui.get('builderGenerate').disabled, false);
});

check('manual GUI worksheets remain honest TXT exports with empty production command records', () => {
  const ui = boot({major: ''}); ui.api.addDevice(deviceId('AccessPoint-PT'));
  const ssid = ui.stored().instances[0].config.settings.find(row => row.label === 'SSID');
  ui.config(`settings.@${ssid._id}.value`, 'Manual plan');
  assert.equal(ui.get('builderGenerate').disabled, false); ui.action('generate');
  assert.match(ui.get('builderPreview').value, /Not executable CLI/);
  assert.match(ui.get('builderOutputStatus').textContent, /Manual configuration worksheet/);
  assert(!/^hostname |^configure terminal$/m.test(ui.get('builderPreview').value));
  ui.action('download'); assert(ui.document.downloads[0].filename.endsWith('.txt'));
  assert.equal(ui.stored().instances[0].config.settings.find(row => row.label === 'SSID').value, '');
});

(async () => {
  let failures = 0;
  for (const {name, run} of checks) {
    try { await run(); process.stdout.write('PASS ' + name + '\n'); }
    catch (error) { failures++; process.stderr.write('FAIL ' + name + '\n' + error.stack + '\n'); }
  }
  process.stdout.write(`${checks.length - failures}/${checks.length} builder UI checks passed (VM/DOM stub; no browser geometry or Packet Tracer execution).\n`);
  if (failures) process.exitCode = 1;
})();
