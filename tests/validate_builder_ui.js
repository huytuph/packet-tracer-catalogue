'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(root, 'js/builder-ui.js'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'js/config-builder.js'), 'utf8');
const dataWindow = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'data/catalogue-data.js'), 'utf8'), {window: dataWindow});
const catalogue = JSON.parse(JSON.stringify(dataWindow.PT_CATALOGUE));
const storageKey = 'ptCatalogue.builder.v1';
const checks = [];
const check = (name, run) => checks.push({name, run});
const decode = value => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'"}[entity]));

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
    const selectors = selector.trim().split(/\s+/);
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
  vm.runInNewContext(engineSource, context, {filename: 'config-builder.js'});
  vm.runInNewContext(uiSource, context, {filename: 'builder-ui.js'});
  const db = options.db || JSON.parse(JSON.stringify(catalogue));
  const counts = [];
  const api = window.PTBuilderUI;
  const settings = {db, getVersion: () => version, onVersionChange(value) { version = value; api.versionChanged(); }, onOpenBuilder() { opens++; }, onCountChange(count) { counts.push(count); }};
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
  return {api, db, window, document, mount, storage, clipboard, blobs, revoked, counts, settings, get, find, emit, action, field, stored, setVersion(value) { version = value; api.versionChanged(); }, getVersion: () => version, opens: () => opens, confirmCalls: () => confirmCalls};
}

const deviceId = name => catalogue.devices.find(device => device.pt_name === name).device_id;
const moduleId = name => catalogue.modules.find(module => module.model === name).module_id;
function basicRouter(ui) {
  assert.equal(ui.api.addDevice(deviceId('2911')), true);
  ui.field('release', '9.0.1');
  ui.action('add-row', {'row-kind': 'interfaces'});
  ui.field('name', 'GigabitEthernet0/0', 'interfaces');
  ui.field('address', '192.168.10.1', 'interfaces');
  ui.field('mask', '255.255.255.0', 'interfaces');
  ui.field('interfacesConfirmed', true);
}

check('initialization is one-time, accessible, local, and has no guessed ports or IPs', () => {
  const ui = boot({major: ''});
  const firstMount = ui.get('builderDevicePicker');
  ui.api.init(ui.settings);
  assert.equal(ui.get('builderDevicePicker'), firstMount);
  assert.equal(ui.get('builderVersion').value, '');
  assert.deepEqual(ui.get('builderVersion').querySelectorAll('option').map(option => option.value), ['', '9', '8', '7', '6']);
  assert.equal(ui.get('builderGenerate').disabled, true);
  assert.equal(ui.get('builderCopy').disabled, true);
  assert.equal(ui.get('builderPreview').getAttribute('readonly'), '');
  assert.equal(ui.get('builderPreview').getAttribute('wrap'), 'off');
  assert.equal(ui.get('builderVerification').getAttribute('wrap'), 'off');
  assert.equal(ui.get('builderErrors').getAttribute('role'), 'alert');
  ui.api.addDevice(deviceId('2911'));
  assert.equal(ui.find('[data-field="release"]').value, '');
  assert.equal(ui.stored().instances[0].config.interfaces.length, 0);
  assert.equal(ui.stored().instances[0].config.routes.length, 0);
  assert.equal(ui.stored().instances[0].config.management.address, '');
  assert.match(ui.get('builderContext').textContent, /Choose a Packet Tracer version/);
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

check('picker additions and local/global version selectors stay synchronized', () => {
  const ui = boot({major: ''});
  ui.get('builderDevicePicker').value = String(deviceId('2911'));
  ui.action('add-device');
  assert.equal(ui.stored().instances.length, 1);
  const version = ui.get('builderVersion'); version.value = '8'; ui.emit('change', version);
  assert.equal(ui.getVersion(), '8'); assert.equal(version.value, '8');
  ui.setVersion('7'); assert.equal(version.value, '7');
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
  restored.field('release', '9.0.1');
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
  ui.api.addDevice(deviceId('2960-24TT')); ui.field('release', '9.0.1');
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

check('generation is explicitly untested and every edit invalidates copy/export', () => {
  const ui = boot(); basicRouter(ui); ui.action('generate');
  assert.equal(ui.get('builderErrors').textContent, '');
  assert.match(ui.get('builderPreview').value, /configure terminal/);
  assert.match(ui.get('builderWarnings').textContent, /untested/i);
  assert.match(ui.get('builderOutputStatus').textContent, /Untested/);
  assert.equal(ui.get('builderCopy').disabled, false);
  assert.match(ui.get('builderVerification').value, /show/);
  ui.field('description', 'Changed', 'interfaces');
  assert.equal(ui.get('builderPreview').value, ''); assert.equal(ui.get('builderVerification').value, '');
  assert.equal(ui.get('builderCopy').disabled, true); assert.equal(ui.get('builderDownload').disabled, true);
  ui.action('generate'); const format = ui.get('builderFormat'); format.value = 'cfg'; ui.emit('change', format);
  assert(!ui.get('builderPreview').value.includes('configure terminal'));
  assert.equal(ui.get('builderDownload').disabled, false);
  ui.field('mask', '255.0.255.0', 'interfaces'); ui.action('generate');
  assert(ui.get('builderErrors').textContent); assert.equal(ui.get('builderPreview').value, '');
  format.value = 'txt'; ui.emit('change', format); assert.equal(ui.get('builderPreview').value, '');
});

check('versions and release edits preserve configuration but invalidate confirmation and output', () => {
  const ui = boot(); basicRouter(ui); ui.action('generate');
  const hostname = ui.find('[data-field="hostname"]');
  ui.setVersion('8');
  assert.equal(ui.find('[data-field="hostname"]'), hostname);
  assert.equal(ui.get('builderVersion').value, '8');
  assert.equal(ui.find('[data-field="release"]').getAttribute('placeholder'), '8.2.2');
  assert.equal(ui.stored().instances[0].config.interfaces[0].address, '192.168.10.1');
  assert.equal(ui.stored().instances[0].release, '9.0.1');
  assert.equal(ui.find('[data-field="interfacesConfirmed"]').checked, false);
  assert.equal(ui.get('builderPreview').value, '');
  ui.action('generate'); assert.match(ui.get('builderErrors').textContent, /release|confirmed/i);
  ui.field('release', '8.2.2'); ui.field('interfacesConfirmed', true); ui.action('generate');
  assert.equal(ui.get('builderErrors').textContent, '');
  ui.field('release', '8.2.1'); assert.equal(ui.find('[data-field="interfacesConfirmed"]').checked, false);
  ui.setVersion(''); ui.action('generate'); assert.match(ui.get('builderErrors').textContent, /Choose a Packet Tracer version/);
});

check('unsupported and unknown devices remain list entries without a false certified result', () => {
  const ui = boot(); ui.api.addDevice(deviceId('ASA5506-X'));
  assert.equal(ui.get('builderGenerate').disabled, true);
  assert.match(ui.get('builderContext').textContent, /unavailable for this device/);
  assert.equal(ui.stored().instances.length, 1);
  ui.api.addDevice(deviceId('ISR4321')); ui.setVersion('6');
  assert.match(ui.get('builderContext').textContent, /availability is not verified/);
  ui.field('release', '6.3'); ui.action('generate');
  assert.match(ui.get('builderWarnings').textContent + ui.get('builderErrors').textContent, /availability|unknown|unverified|not verified/i);
  assert(!/certified/i.test(ui.get('builderOutputStatus').textContent));
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
  ui.field('release', '9.0.1'); ui.action('generate'); assert.match(ui.get('builderErrors').textContent, /Correct invalid part/);
  ui.setVersion('8');
  const rebuilt = ui.find(`[data-part-field="quantity"][data-part-id="${part.id}"]`);
  assert.equal(rebuilt.value, '2');
  assert.match(ui.get('builderParts').textContent, /No cross-version compatibility was used/);
  rebuilt.value = '3'; ui.emit('input', rebuilt);
  assert.equal(rebuilt.getAttribute('aria-invalid'), null);
  assert.equal(ui.stored().parts[0].quantity, 3);
  ui.field('release', '8.2.2'); ui.action('generate');
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
  const ui = boot(); ui.api.addDevice(deviceId('1841')); ui.field('release', '9.0.1');
  ui.api.addModule(moduleId('HWIC-2T'), deviceId('1841'));
  ui.api.addModule(moduleId('HWIC-2T'));
  const loose = ui.stored().parts.find(part => part.instanceId === null);
  const attachment = ui.find(`[data-part-field="instanceId"][data-part-id="${loose.id}"]`);
  attachment.value = ui.stored().instances[0].id; ui.emit('change', attachment);
  ui.action('generate');
  assert.equal(ui.get('builderErrors').textContent, '');
  assert.match(ui.get('builderPreview').value, new RegExp(moduleId('HWIC-2T') + ' x 2'));
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
  const saved = ui.stored(); saved.instances[0].config.password = 'must-not-survive'; saved.instances[0].config.management.secret = 'must-not-survive';
  ui.storage.set(storageKey, JSON.stringify(saved));
  const restored = boot({storage: ui.storage});
  assert.equal(restored.find('[data-field="release"]').value, '9.0.1');
  assert.equal(restored.find('[data-field="interfacesConfirmed"]').checked, false);
  assert.equal(restored.get('builderPreview').value, '');
  assert.equal(restored.get('builderCopy').disabled, true);
  restored.field('hostname', 'Restored');
  assert(!restored.storage.get(storageKey).includes('must-not-survive'));
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
  const format = ui.get('builderFormat'); format.value = 'cfg'; ui.emit('change', format); ui.action('download');
  assert(ui.document.downloads[1].filename.endsWith('.cfg'));
  ui.field('hostname', 'Changed'); ui.action('download'); assert.equal(ui.document.downloads.length, 2);
  for (const value of ['=1+1', '\n=SUM(1,1)', '   =1+1', '\t@bad']) {
    ui.field('hostname', value); ui.action('bom');
    const last = ui.document.downloads.at(-1), csv = ui.blobs.get(last.href).text;
    assert(last.filename.endsWith('.csv')); assert(csv.includes('"\'' + value.replace(/"/g, '""') + '"'), 'Unescaped spreadsheet formula');
    assert(ui.revoked.includes(last.href));
  }
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
