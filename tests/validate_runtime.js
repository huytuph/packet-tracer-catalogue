'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const dataContext = vm.createContext({window: {}});
vm.runInContext(fs.readFileSync(path.join(root, 'data/catalogue-data.js'), 'utf8'), dataContext);
const catalogue = JSON.parse(JSON.stringify(dataContext.window.PT_CATALOGUE));
const families = ['6', '7', '8', '9'];
const storageKey = 'ptCatalogue.targetVersion';
let checks = 0;

function check(name, run) {
  try {
    run();
    checks += 1;
    console.log('PASS ' + name);
  } catch (error) {
    console.error('FAIL ' + name + ': ' + error.message);
    process.exitCode = 1;
  }
}

function attributes(source) {
  const result = {};
  for (const match of source.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) result[match[1]] = match[2] ?? true;
  return result;
}

function boot(db = catalogue, options = {}) {
  const nodes = new Map();
  const features = [];
  const browseChecks = [];
  const modalLinks = [];
  const background = [];
  const documentEvents = new Map();
  const storage = new Map([[storageKey, options.saved ?? '']]);
  let headers = [];

  function makeNode(id, tag = 'div', source = '') {
    const attrs = attributes(source);
    const node = {
      id, tag, attrs, checked: attrs.checked === true, style: {}, dataset: {}, events: new Map(),
      inert: attrs.inert === true, isConnected: true, inModal: id.startsWith('modal'),
      classes: new Set(String(attrs.class || '').split(/\s+/)), options: [], _html: '', _value: String(attrs.value || ''),
      textContent: '',
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return Object.hasOwn(this.attrs, name) ? String(this.attrs[name]) : null; },
      focus() {
        if (!this.isConnected || this.inert || this.region?.inert) return;
        document.activeElement = this;
      },
      getClientRects() { return this.isConnected && !this.classes.has('hidden') ? [{}] : []; },
      addEventListener(type, callback) {
        if (!this.events.has(type)) this.events.set(type, []);
        this.events.get(type).push(callback);
      },
      querySelectorAll(selector) {
        if (id === 'deviceTable' && selector === 'th[data-sort]') return headers;
        if (id === 'modal' && selector === 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') return [nodes.get('modalCloseBtn'), ...modalLinks];
        throw new Error('Unexpected scoped selector: ' + id + ' ' + selector);
      },
      matches(selector) {
        const match = selector.match(/^\[data-([\w-]+)\]$/);
        assert(match, 'Unexpected target selector ' + selector);
        return Object.hasOwn(this.dataset, match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()));
      },
      closest(selector) { return this.matches(selector) ? this : null; },
      get value() { return this._value; },
      set value(value) {
        const string = String(value);
        this._value = tag === 'select' && !this.options.includes(string) ? '' : string;
      },
      get innerHTML() { return this._html; },
      set innerHTML(value) {
        this._html = String(value);
        if (tag === 'select') {
          this.options = [...this._html.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)]
            .map(match => String(attributes(match[1]).value ?? match[2]));
          this._value = this.options[0] ?? '';
        }
        const inputs = id === 'reqFeatures' ? features : id === 'deviceTableBody' ? browseChecks : null;
        if (inputs) {
          inputs.forEach(input => { input.isConnected = false; });
          inputs.length = 0;
          for (const match of this._html.matchAll(/<input\b([^>]*)>/g)) {
            const input = makeNode('', 'input', match[1]); input.region = background[2]; inputs.push(input);
          }
        }
        if (id === 'modalContent') {
          modalLinks.forEach(link => { link.isConnected = false; }); modalLinks.length = 0;
          for (const match of this._html.matchAll(/<a\b([^>]*)>/g)) {
            const link = makeNode('', 'a', match[1]); link.inModal = true; modalLinks.push(link);
          }
        }
      }
    };
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('data-')) node.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
    node.classList = {
      add: value => node.classes.add(value),
      remove: value => node.classes.delete(value),
      toggle(value, enabled = !node.classes.has(value)) {
        if (enabled) node.classes.add(value); else node.classes.delete(value);
      }
    };
    return node;
  }

  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    assert(!nodes.has(match[3]), 'Duplicate HTML ID ' + match[3]);
    const node = makeNode(match[3], match[1].toLowerCase(), match[2]);
    if (node.tag === 'select') {
      const content = html.slice(match.index + match[0].length).match(/^([\s\S]*?)<\/select>/)?.[1] || '';
      node.innerHTML = content;
    }
    nodes.set(node.id, node);
  }
  const tabs = [...html.matchAll(/<button\b([^>]*class="tab[^>]*data-view="[^"]+"[^>]*)>/g)]
    .map(match => makeNode('', 'button', match[1]));
  const views = [...nodes.values()].filter(node => node.classes.has('view'));
  headers = [...html.matchAll(/<th\b([^>]*data-sort="[^"]+"[^>]*)>([\s\S]*?)<\/th>/g)]
    .map(match => {
      const header = makeNode('', 'th', match[1]);
      const button = match[2].match(/<button\b([^>]*)>([\s\S]*?)<\/button>/);
      if (button) {
        header.sortButton = makeNode('', 'button', button[1]); header.sortButton.textContent = text(button[2]);
        header.sortButton.parentHeader = header;
      }
      return header;
    });
  background.push(makeNode('', 'header'), makeNode('', 'nav'), makeNode('', 'main'), makeNode('', 'footer'));
  for (const node of nodes.values()) if (!node.inModal) node.region = node.id === 'versionFilter' ? background[0] : background[2];
  headers.forEach(header => { if (header.sortButton) header.sortButton.region = background[2]; });
  tabs.forEach(tab => { tab.region = background[1]; });
  const document = {
    body: makeNode('body', 'body'),
    activeElement: null,
    querySelector(selector) {
      assert.match(selector, /^#[\w-]+$/, 'Unexpected selector ' + selector);
      assert(nodes.has(selector.slice(1)), 'Missing HTML ID ' + selector);
      return nodes.get(selector.slice(1));
    },
    querySelectorAll(selector) {
      if (selector === '.tab') return tabs;
      if (selector === '.view') return views;
      if (selector === '#reqFeatures input') return features;
      if (selector === '#reqFeatures input:checked') return features.filter(node => node.checked);
      if (selector === '#deviceTableBody input[type=checkbox]:checked') return browseChecks.filter(node => node.checked);
      if (selector === '.app-header, .tabs, main, footer') return background;
      throw new Error('Unexpected selector ' + selector);
    },
    addEventListener(type, callback) {
      if (!documentEvents.has(type)) documentEvents.set(type, []);
      documentEvents.get(type).push(callback);
    }
  };
  document.activeElement = document.body;
  const localStorage = {
    getItem(key) { if (options.deniedStorage) throw new Error('Storage unavailable'); return storage.get(key) ?? null; },
    setItem(key, value) { if (options.deniedStorage) throw new Error('Storage unavailable'); storage.set(key, String(value)); }
  };
  const context = vm.createContext({window: {PT_CATALOGUE: db, PTBuilderUI: options.builder, localStorage, scrollTo() {}}, document, Intl});
  vm.runInContext(app, context, {filename: 'js/app.js'});
  const get = id => {
    assert(nodes.has(id), 'Unknown test ID ' + id);
    return nodes.get(id);
  };
  const dispatch = (target, type, properties = {}) => {
    const event = {target, ...properties, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }};
    for (const callback of target.events.get(type) || []) callback(event);
    if (type === 'click' && target.parentHeader) {
      for (const callback of target.parentHeader.events.get(type) || []) callback(event);
    }
    for (const callback of documentEvents.get(type) || []) callback(event);
    return event;
  };
  const emit = (id, type = 'click') => dispatch(get(id), type);
  const version = major => { get('versionFilter').value = major; emit('versionFilter', 'change'); };
  const select = (id, value) => { get(id).value = value; emit(id, 'change'); };
  const clickData = (key, value, extraAttributes = '') => {
    const target = makeNode('', 'button', `data-${key}="${value}" ${extraAttributes}`);
    target.region = key === 'close-modal' ? null : background[2];
    target.focus(); dispatch(target, 'click'); return target;
  };
  const keydown = (key, shiftKey = false) => dispatch(document.activeElement, 'keydown', {key, shiftKey});
  const sort = key => {
    const header = headers.find(node => node.dataset.sort === key);
    assert(header?.sortButton, 'Missing native sort button for ' + key);
    header.sortButton.focus(); dispatch(header.sortButton, 'click');
  };
  return {get, emit, version, select, clickData, keydown, sort, features, browseChecks, modalLinks, background, headers, tabs, views, document, storage};
}

function tableRows(markup) {
  const body = markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? markup;
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => match[1]);
}

function tableCells(row) { return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match => match[1]); }
function text(markup) { return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function allowed(db, major) { return db.devices.filter(device => !major || device.version_profiles[major].availability.available !== false); }
function deviceRows(ui) { return tableRows(ui.get('deviceTableBody').innerHTML).filter(row => row.includes('data-device-id=')); }
function rowFor(ui, name) { return deviceRows(ui).find(row => text(row).includes(name)); }
function finderCard(ui, name) {
  return [...ui.get('finderResults').innerHTML.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)]
    .map(match => match[0]).find(markup => markup.includes(name));
}

function balanced(markup) {
  const stack = [];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const match of markup.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const tag = match[2].toLowerCase();
    if (voidTags.has(tag)) continue;
    if (match[1]) assert.equal(stack.pop(), tag, 'Mismatched closing tag ' + tag); else stack.push(tag);
  }
  assert.equal(stack.length, 0, 'Unclosed tags ' + stack.join(', '));
}

function isolationCatalogue() {
  const db = JSON.parse(JSON.stringify(catalogue));
  const base = {...db.devices[0], device_id: 101, display_name: 'Isolation Alpha', pt_name: 'IsolationAlpha', verification_status: 'Verified'};
  const feature = {...db.featureCatalog[0], slug: 'isolation_feature', name: 'Isolation Feature'};
  const interfaceType = db.interfaceTypes.find(item => item.slug === 'gigabitethernet');
  const module = {module_id: 800, model: 'ONLY8MODULE', description: 'Eight module', max_quantity: 1, verification_status: 'Verified', interfaces: [{...interfaceType, slug: 'serial', name: 'Eight Serial', quantity: 1, speed_mbps: null}]};
  const module9 = {...module, module_id: 900, model: 'ONLY9MODULE'};
  const globalModule = {...module, module_id: 999, model: 'GLOBALMODULE'};
  db.featureCatalog = [feature];
  db.modules = [module, module9, globalModule];
  db.devices = ['Alpha', 'Beta', 'Mystery', 'Absent'].map((name, index) => {
    const device = {...base, device_id: 101 + index, display_name: 'Isolation ' + name, pt_name: 'Isolation' + name};
    const globalFeature = {...feature, name: 'GLOBALFEATURE', support_mode: 'native', verification_status: 'Verified'};
    device.interfaces = [{...interfaceType, name: 'GLOBALPORT', quantity: 99, verification_status: 'Verified'}];
    device.features = [globalFeature]; device.feature_map = {[feature.slug]: globalFeature};
    device.modules = [globalModule]; device.limitations = [{title: 'GLOBALLIMITATION', description: 'Outside selected version'}];
    device.port_totals = {gigabitethernet: 99}; device.total_physical_ports = 99;
    device.interface_verification_status = 'Verified'; device.max_module_port_additions = {serial: 1}; device.max_module_total_ports = 1;
    device.search_blob = (device.display_name + ' GLOBALFEATURE GLOBALMODULE GLOBALPORT ONLY9MODULE').toLowerCase();
    device.version_profiles = {};
    for (const major of families) {
      const available = name === 'Mystery' ? null : name === 'Absent' ? false : true;
      const availability = {available, verification_status: available === null ? 'Unknown' : 'Verified', observed_release: major + '.2', support_notes: 'Evidence for ' + major, major_version: Number(major), version: major + '.x', is_family: true};
      const interfaces = name === 'Mystery' ? [] : [{...interfaceType, name: 'PORT' + major, quantity: Number(major), verification_status: 'Verified'}];
      const mode = {'6': 'unsupported', '7': 'native', '8': 'configuration_required', '9': 'module_required'}[major];
      const f = {...feature, support_mode: mode, name: 'Feature' + major, major_version: Number(major), verification_status: 'Verified'};
      const modules = ['Alpha', 'Beta'].includes(name) ? major === '8' ? [module] : major === '9' ? [module9] : [] : [];
      device.version_profiles[major] = {availability, interfaces, features: [f], feature_map: {[feature.slug]: f}, modules,
        limitations: [{title: 'LIMITATION' + major, description: 'Selected-version note'}],
        port_totals: interfaces.length ? {gigabitethernet: Number(major)} : {}, total_physical_ports: interfaces.length ? Number(major) : 0,
        max_module_port_additions: modules.length ? {serial: 1} : {}, max_module_total_ports: modules.length ? 1 : 0,
        interface_verification_status: interfaces.length ? 'Verified' : 'Unknown'};
    }
    device.versions = families.map(major => device.version_profiles[major].availability);
    return device;
  });
  db.stats = {...db.stats, devices: 4, features: 1, modules: 3};
  return db;
}

function confidenceContext(db, major, templateMajor) {
  const source = db.devices[0].version_profiles[templateMajor];
  const target = major ? db.devices[0].version_profiles[major] : db.devices[0];
  for (const field of ['interfaces', 'features', 'modules', 'port_totals', 'total_physical_ports', 'max_module_port_additions', 'max_module_total_ports', 'interface_verification_status']) {
    target[field] = JSON.parse(JSON.stringify(source[field]));
  }
  target.feature_map = Object.fromEntries(target.features.map(feature => [feature.slug, feature]));
  db.devices[0].is_modular = true;
  return target;
}

check('complete four-family data and 136 assessment audit', () => {
  assert.equal(catalogue.devices.length, 34);
  for (const device of catalogue.devices) {
    for (const major of families) {
      const profile = device.version_profiles[major];
      assert(profile, device.pt_name + ' missing ' + major + '.x profile');
      assert([true, false, null].includes(profile.availability.available));
    }
  }
  const ui = boot();
  const rows = tableRows(ui.get('versionAuditBody').innerHTML);
  assert.equal(rows.length, 34);
  assert.equal(rows.reduce((count, row) => count + tableCells(row).length - 1, 0), 136);
  assert.match(ui.get('versionCoverageSummary').textContent, /136/);
});

check('startup, all versions, browse columns, sources and tabs', () => {
  const ui = boot();
  assert.deepEqual(ui.get('versionFilter').options, ['', '9', '8', '7', '6']);
  assert.match(html, /independent project is not affiliated with or endorsed by Cisco/);
  assert.equal(deviceRows(ui).length, 34);
  const header = html.match(/<table[^>]+id="deviceTable"[^>]*>[\s\S]*?<thead>([\s\S]*?)<\/thead>/)[1];
  const columns = (header.match(/<th[\s>]/g) || []).length;
  for (const row of tableRows(ui.get('deviceTableBody').innerHTML)) assert.equal(tableCells(row).length, columns);
  assert.equal(tableRows(ui.get('sourcesBody').innerHTML).length, catalogue.sources.length);
  for (const node of ui.tabs) for (const callback of node.events.get('click') || []) callback();
  assert.equal(ui.views.filter(node => node.classes.has('active')).length, 1);
});

check('native sort controls update order and aria-sort without replacing focus', () => {
  const ui = boot();
  for (const header of ui.headers) {
    assert.equal(header.getAttribute('scope'), 'col');
    assert.equal(header.sortButton?.tag, 'button');
    assert.equal(header.sortButton.getAttribute('type'), 'button');
    assert.match(header.sortButton.getAttribute('aria-label'), /^Sort by /);
  }
  const names = () => deviceRows(ui).map(row => text(tableCells(row)[1]));
  const initial = names(); ui.sort('display_name');
  assert.deepEqual(names(), initial.reverse());
  assert.equal(ui.headers.find(header => header.dataset.sort === 'display_name').getAttribute('aria-sort'), 'descending');
  ui.sort('modules');
  const active = ui.headers.find(header => header.dataset.sort === 'modules');
  assert.equal(active.getAttribute('aria-sort'), 'ascending');
  assert.equal(ui.document.activeElement, active.sortButton);
  assert.equal(ui.headers.filter(header => header.getAttribute('aria-sort') !== 'none').length, 1);
  const counts = () => deviceRows(ui).map(row => Number(text(tableCells(row)[6])));
  assert.deepEqual(counts(), [...counts()].sort((a, b) => a - b));
  ui.sort('modules'); assert.equal(active.getAttribute('aria-sort'), 'descending');
  assert.deepEqual(counts(), [...counts()].sort((a, b) => b - a));
});

check('comparison checkboxes have escaped device-specific accessible names', () => {
  const ui = boot();
  assert.equal(ui.browseChecks.length, catalogue.devices.length);
  for (const checkbox of ui.browseChecks) {
    const device = catalogue.devices.find(item => String(item.device_id) === checkbox.value);
    assert.equal(checkbox.getAttribute('aria-label'), 'Select ' + device.display_name + ' for comparison');
  }
  const db = isolationCatalogue(); db.devices[0].display_name = 'Probe "quoted" <device> & next';
  const escaped = boot(db).get('deviceTableBody').innerHTML;
  assert(escaped.includes('aria-label="Select Probe &quot;quoted&quot; &lt;device&gt; &amp; next for comparison"'));
});

check('modal moves, traps and restores focus through close and Escape', () => {
  const ui = boot(); ui.document.body.style.overflow = 'auto';
  const opener = ui.clickData('device-id', catalogue.devices[0].device_id);
  const first = ui.get('modalCloseBtn'), last = ui.modalLinks.at(-1);
  assert(last, 'Expected a source link to exercise modal focus boundaries');
  assert.equal(ui.document.activeElement, first);
  assert(ui.background.every(element => element.inert));
  assert.equal(ui.document.body.style.overflow, 'hidden');
  last.focus(); assert(ui.keydown('Tab').defaultPrevented); assert.equal(ui.document.activeElement, first);
  first.focus(); assert(ui.keydown('Tab', true).defaultPrevented); assert.equal(ui.document.activeElement, last);
  first.focus(); assert(!ui.keydown('Tab').defaultPrevented, 'Middle traversal remains native');
  ui.emit('modalCloseBtn');
  assert.equal(ui.document.activeElement, opener); assert(ui.background.every(element => !element.inert));
  assert.equal(ui.document.body.style.overflow, 'auto');
  const reopened = ui.clickData('device-id', catalogue.devices[0].device_id);
  assert(ui.keydown('Escape').defaultPrevented);
  assert.equal(ui.document.activeElement, reopened); assert(ui.get('modal').classes.has('hidden'));
  assert(!ui.keydown('Escape').defaultPrevented, 'Escape outside the modal is unchanged');
});

check('modal refresh retains opener and repairs detached content focus', () => {
  const ui = boot();
  const opener = ui.clickData('device-id', catalogue.devices[0].device_id);
  const source = ui.modalLinks.at(-1); source.focus();
  ui.version('8');
  assert(!source.isConnected); assert.equal(ui.document.activeElement, ui.get('modalCloseBtn'));
  ui.keydown('Escape'); assert.equal(ui.document.activeElement, opener);
  const detached = ui.clickData('device-id', catalogue.devices[0].device_id); detached.isConnected = false;
  ui.keydown('Escape'); assert.equal(ui.document.activeElement, ui.get('versionFilter'));
  const singleton = boot(isolationCatalogue());
  singleton.clickData('device-id', '101'); assert.equal(singleton.modalLinks.length, 0);
  assert(singleton.keydown('Tab').defaultPrevented);
  assert(singleton.keydown('Tab', true).defaultPrevented);
  assert.equal(singleton.document.activeElement, singleton.get('modalCloseBtn'));
});

check('persisted, invalid and denied local storage', () => {
  const saved = boot(catalogue, {saved: '8'});
  assert.equal(saved.get('versionFilter').value, '8');
  assert.equal(deviceRows(saved).length, allowed(catalogue, '8').length);
  saved.version('9'); assert.equal(saved.storage.get(storageKey), '9');
  assert.equal(boot(catalogue, {saved: 'invalid'}).get('versionFilter').value, '');
  const denied = boot(catalogue, {deniedStorage: true}); denied.version('6');
  assert.equal(denied.get('versionFilter').value, '6');
});

check('available, unknown and unavailable visibility across all four families', () => {
  const ui = boot();
  for (const major of families) {
    ui.version(major);
    assert.equal(deviceRows(ui).length, allowed(catalogue, major).length);
    const options = ui.get('compareDeviceSelect').options;
    for (const device of catalogue.devices) {
      const state = device.version_profiles[major].availability.available;
      assert.equal(options.includes(String(device.device_id)), state !== false);
      if (state === null) assert.match(rowFor(ui, device.display_name), /Not verified/);
    }
  }
});

check('empty catalogue and missing-profile fallback', () => {
  const empty = {...catalogue, devices: [], stats: {...catalogue.stats, devices: 0}};
  const ui = boot(empty); ui.version('8');
  assert.equal(deviceRows(ui).length, 0);
  assert.match(ui.get('deviceTableBody').innerHTML, /No devices match/);
  assert.equal(ui.get('compareDeviceSelect').options.length, 1);
  const db = isolationCatalogue(); delete db.devices[2].version_profiles['8'];
  const fallback = boot(db, {saved: '8'});
  assert.match(rowFor(fallback, 'Isolation Mystery'), /Not verified/);
  assert(!rowFor(fallback, 'Isolation Mystery').includes('GLOBALPORT'));
});

check('finder and browse isolate ports and features by selected version', () => {
  const db = isolationCatalogue(), ui = boot(db);
  for (const major of families) {
    ui.version(major);
    const row = rowFor(ui, 'Isolation Alpha');
    assert.equal(text(tableCells(row)[4]), major);
    assert(!ui.get('finderResults').innerHTML.includes('99'));
    ui.select('browseFeature', 'isolation_feature');
    assert.equal(deviceRows(ui).length, major === '6' ? 0 : 2);
    ui.select('browseFeature', '');
    const feature = ui.features.find(node => node.value === 'isolation_feature');
    feature.checked = true; ui.emit('reqFeatures', 'change');
    const finder = ui.get('finderResults').innerHTML;
    assert(finder.includes('Feature' + major));
    assert(!finder.includes('GLOBALFEATURE'));
    feature.checked = false; ui.emit('reqFeatures', 'change');
  }
  ui.get('browseSearch').value = 'ONLY9MODULE';
  ui.version('8'); assert.equal(deviceRows(ui).length, 0);
  ui.version('9'); assert.equal(deviceRows(ui).length, 2);
});

check('unknown availability is never a confident native match', () => {
  const ui = boot(isolationCatalogue(), {saved: '8'});
  ui.select('reqCategory', catalogue.devices[0].category.slug);
  const card = finderCard(ui, 'Isolation Mystery');
  assert(card); assert(!/>Native match</.test(card)); assert.match(card, /[Nn]ot verified|[Uu]nknown|Partial/);
  ui.get('reqIncludePartial').checked = false; ui.emit('reqIncludePartial', 'change');
  assert.match(finderCard(ui, 'Isolation Mystery'), /No full match/);
});

check('actual unknown ISR4321 in 6.x leaks no raw technical claims', () => {
  const device = catalogue.devices.find(item => item.pt_name === 'ISR4321');
  assert.equal(device.version_profiles['6'].availability.available, null);
  const ui = boot(catalogue, {saved: '6'});
  const row = rowFor(ui, device.display_name), card = finderCard(ui, device.display_name);
  assert.match(row, /Not verified/); assert.match(card, /Port data not verified/);
  assert(!row.includes('GigabitEthernet')); assert(!card.includes('2× GE'));
  ui.clickData('device-id', device.device_id);
  const detail = ui.get('modalContent').innerHTML;
  assert(!detail.includes(device.description)); assert(!detail.includes(device.typical_use));
  assert.match(detail, /No interface data verified for this version/);
  assert.match(detail, /No feature support verified for this version/);
  assert.match(detail, /No module compatibility verified for this version/);
  for (const role of device.roles) assert(!detail.includes(role.name));
  ui.select('moduleDeviceSelect', String(device.device_id));
  assert.match(ui.get('deviceModules').innerHTML, /No module compatibility verified/);
});

check('actual ASA5506-X partial availability is explicitly cautious', () => {
  const device = catalogue.devices.find(item => item.pt_name === 'ASA5506-X');
  const ui = boot();
  for (const major of ['7', '8', '9']) {
    assert.equal(device.version_profiles[major].availability.verification_status, 'Partial');
    ui.version(major);
    const row = rowFor(ui, device.display_name), card = finderCard(ui, device.display_name);
    assert.match(row, /Available in [789]\.x \(Partial\)/);
    assert.match(row, /class="badge warn"/);
    assert.match(card, /Partial \/ verify/); assert(!/>Native match</.test(card));
  }
});

check('actual All versions PoE uncertainty survives partial exclusion and detail views', () => {
  const device = catalogue.devices.find(item => item.pt_name === '3560-24PS');
  assert.equal(device.features.find(feature => feature.slug === 'poe').verification_status, 'Partial');
  const ui = boot();
  ui.features.find(node => node.value === 'poe').checked = true; ui.emit('reqFeatures', 'change');
  assert.match(finderCard(ui, device.display_name), /Partial \/ verify/);
  assert(!/>Native match</.test(finderCard(ui, device.display_name)));
  ui.get('reqIncludePartial').checked = false; ui.emit('reqIncludePartial', 'change');
  assert.match(finderCard(ui, device.display_name), /No full match/);
  ui.select('compareDeviceSelect', String(device.device_id)); ui.emit('addCompareBtn');
  const row = tableRows(ui.get('compareOutput').innerHTML).find(item => text(tableCells(item)[0]) === 'PoE');
  assert.match(row, /state-unknown/); assert.match(row, /Native \(Partial\)/);
  ui.clickData('device-id', device.device_id);
  assert.match(ui.get('modalContent').innerHTML, /state-unknown[^>]*>[^<]*Native \(Partial\) PoE/);
  ui.keydown('Escape');
  ui.features.find(node => node.value === 'poe').checked = false;
  ui.get('reqIncludePartial').checked = true;
  ui.get('reqTotalPorts').value = '1'; ui.emit('reqTotalPorts', 'change');
  assert.match(finderCard(ui, device.display_name), /Partial \/ verify/);
  assert.match(finderCard(ui, device.display_name), /Port data is Partial/);
  ui.get('reqIncludePartial').checked = false; ui.emit('reqIncludePartial', 'change');
  assert.match(finderCard(ui, device.display_name), /No full match/);
});

check('partial port and feature evidence is cautious in All and each version', () => {
  for (const major of ['', ...families]) {
    for (const kind of ['ports', 'feature']) {
      const db = isolationCatalogue(), profile = confidenceContext(db, major, '7');
      if (kind === 'ports') profile.interface_verification_status = 'Partial';
      else profile.features[0].verification_status = 'Partial';
      const ui = boot(db, {saved: major});
      if (kind === 'ports') { ui.get('reqGE').value = '1'; ui.emit('reqGE', 'change'); }
      else { ui.features.find(node => node.value === 'isolation_feature').checked = true; ui.emit('reqFeatures', 'change'); }
      const card = finderCard(ui, 'Isolation Alpha');
      assert.match(card, /Partial \/ verify/); assert(!/>Native match</.test(card));
      if (kind === 'ports') assert.match(card, /Port data is Partial/);
      else {
        ui.select('compareDeviceSelect', '101'); ui.emit('addCompareBtn');
        const row = tableRows(ui.get('compareOutput').innerHTML).find(item => item.includes('Isolation Feature'));
        assert.match(row, /class="state-unknown"/);
      }
      ui.get('reqIncludePartial').checked = false; ui.emit('reqIncludePartial', 'change');
      assert.match(finderCard(ui, 'Isolation Alpha'), /No full match/);
    }
  }
});

check('feature matching cannot use a module from another version', () => {
  const db = isolationCatalogue(), profile = db.devices[0].version_profiles['9'];
  profile.features[0].required_module_id = 800;
  const ui = boot(db, {saved: '9'});
  ui.features.find(node => node.value === 'isolation_feature').checked = true;
  ui.emit('reqFeatures', 'change');
  const card = finderCard(ui, 'Isolation Alpha');
  assert.match(card, /no compatible module verified/);
  assert.match(card, /Partial \/ verify/); assert(!/>Match with module</.test(card));
});

check('required-module features respect compatibility evidence confidence', () => {
  for (const major of ['', ...families]) {
    for (const mode of ['module_required', 'module_and_configuration']) {
      for (const status of ['Verified', 'Partial', 'Unknown', null]) {
        const db = isolationCatalogue(), profile = confidenceContext(db, major, '9');
        profile.features[0].support_mode = mode; profile.features[0].required_module_id = 900;
        if (status === null) profile.modules = [];
        else profile.modules[0].verification_status = status;
        const ui = boot(db, {saved: major});
        ui.features.find(node => node.value === 'isolation_feature').checked = true;
        ui.emit('reqFeatures', 'change');
        const card = finderCard(ui, 'Isolation Alpha'), label = (major || 'All') + ' / ' + mode + ' / ' + (status || 'missing');
        assert.match(card, status === 'Verified' ? /Match with module/ : /Partial \/ verify/, label);
        if (status !== 'Verified') assert(!/>Match with module</.test(card), label + ' must not be confident');
        ui.get('reqIncludePartial').checked = false; ui.emit('reqIncludePartial', 'change');
        assert.match(finderCard(ui, 'Isolation Alpha'), status === 'Verified' ? /Match with module/ : /No full match/, label + ' / exclude partial');
      }
    }
  }
});

check('module-assisted port matches respect expansion evidence confidence', () => {
  for (const major of ['', ...families]) {
    for (const status of ['Verified', 'Partial', 'Unknown', null]) {
      for (const [field, minimum] of [['reqSerial', 1], ['reqTotalPorts', 9]]) {
        const db = isolationCatalogue(), profile = confidenceContext(db, major, '8');
        if (status === null) {
          profile.modules = []; profile.max_module_port_additions = {}; profile.max_module_total_ports = 0;
        } else profile.modules[0].verification_status = status;
        const ui = boot(db, {saved: major});
        ui.get(field).value = String(minimum); ui.emit(field, 'change');
        const card = finderCard(ui, 'Isolation Alpha'), label = (major || 'All') + ' / ' + field + ' / ' + (status || 'missing');
        assert.match(card, status === 'Verified' ? /Match with module/ : /Partial \/ verify/, label);
        if (status !== 'Verified') assert(!/>Match with module</.test(card), label + ' must not be confident');
        ui.get('reqIncludePartial').checked = false; ui.emit('reqIncludePartial', 'change');
        assert.match(finderCard(ui, 'Isolation Alpha'), status === 'Verified' ? /Match with module/ : /No full match/, label + ' / exclude partial');
      }
    }
    const db = isolationCatalogue(), profile = confidenceContext(db, major, '8');
    const partial = {...profile.modules[0], module_id: 801, model: 'PARTIAL8MODULE', verification_status: 'Partial',
      interfaces: [{...profile.modules[0].interfaces[0], quantity: 10}]};
    profile.modules.push(partial); profile.max_module_port_additions.serial = 10; profile.max_module_total_ports = 10;
    const ui = boot(db, {saved: major});
    ui.get('reqSerial').value = '1'; ui.emit('reqSerial', 'change');
    assert.match(finderCard(ui, 'Isolation Alpha'), /Match with module/, 'Verified expansion alone is sufficient');
    ui.get('reqSerial').value = '2'; ui.emit('reqSerial', 'change');
    assert.match(finderCard(ui, 'Isolation Alpha'), /Partial \/ verify/, 'Only Partial expansion reaches threshold');
  }
});

check('incomplete modular expansion is unknown, but disabled expansion can fail', () => {
  for (const major of ['', ...families]) {
    for (const status of ['Partial', 'Unknown', null]) {
      const db = isolationCatalogue(), profile = confidenceContext(db, major, '8');
      if (status === null) {
        profile.modules = []; profile.max_module_port_additions = {}; profile.max_module_total_ports = 0;
      } else profile.modules[0].verification_status = status;
      const ui = boot(db, {saved: major});
      ui.get('reqSerial').value = '2'; ui.emit('reqSerial', 'change');
      assert.match(finderCard(ui, 'Isolation Alpha'), /Partial \/ verify/, status || 'missing');
      ui.get('reqAllowModules').checked = false; ui.emit('reqAllowModules', 'change');
      assert.match(finderCard(ui, 'Isolation Alpha'), /No full match/, status || 'missing');
    }
  }
});

check('unavailable comparison safeguards and selected-version feature colors', () => {
  const ui = boot(isolationCatalogue());
  for (const id of ['compareDeviceSelect', 'moduleDeviceSelect', 'connDeviceA', 'connDeviceB']) ui.select(id, '104');
  ui.emit('addCompareBtn'); ui.clickData('device-id', '104');
  ui.version('8');
  for (const id of ['compareDeviceSelect', 'moduleDeviceSelect', 'connDeviceA', 'connDeviceB']) assert.equal(ui.get(id).value, '');
  assert.match(ui.get('compareOutput').innerHTML, /Not available in 8.x/);
  assert(!/GLOBALPORT|GLOBALFEATURE|GLOBALMODULE|GLOBALLIMITATION/.test(ui.get('compareOutput').innerHTML));
  assert(!/PORT8|Feature8|ONLY8MODULE|LIMITATION8/.test(ui.get('modalContent').innerHTML));
  ui.clickData('remove-compare', '104');
  ui.select('compareDeviceSelect', '101'); ui.emit('addCompareBtn');
  for (const major of families) {
    ui.version(major);
    const rows = tableRows(ui.get('compareOutput').innerHTML);
    assert(rows.some(row => row.includes('Feature' + major) || row.includes('Isolation Feature')));
    assert(!ui.get('compareOutput').innerHTML.includes('GLOBALMODULE'));
    assert(!ui.get('compareOutput').innerHTML.includes('99'));
    const featureRow = rows.find(row => row.includes('Isolation Feature'));
    const expected = {'6': 'unsupported', '7': 'native', '8': 'configuration_required', '9': 'module_required'}[major];
    assert(featureRow.includes('class="state-' + expected + '"'));
    balanced(ui.get('compareOutput').innerHTML);
  }
});

check('module, connection and modal views isolate version records', () => {
  const ui = boot(isolationCatalogue());
  ui.select('moduleDeviceSelect', '101'); ui.select('connDeviceA', '101'); ui.select('connDeviceB', '102');
  ui.clickData('device-id', '101');
  for (const major of families) {
    ui.version(major);
    const moduleMarkup = ui.get('deviceModules').innerHTML;
    assert(!moduleMarkup.includes('GLOBALMODULE'));
    assert.equal(moduleMarkup.includes('ONLY8MODULE'), major === '8');
    assert.equal(moduleMarkup.includes('ONLY9MODULE'), major === '9');
    ui.select('moduleSelect', '800');
    assert.equal(ui.get('moduleDevices').innerHTML.includes('Isolation Alpha'), major === '8');
    const connection = ui.get('connectionOutput').innerHTML;
    assert(connection.includes('PORT' + major)); assert(!connection.includes('GLOBALPORT'));
    assert.equal(connection.includes('ONLY8MODULE'), major === '8');
    assert.equal(connection.includes('ONLY9MODULE'), major === '9');
    const detail = ui.get('modalContent').innerHTML;
    assert(detail.includes('PORT' + major)); assert(detail.includes('LIMITATION' + major));
    assert(!/GLOBALPORT|GLOBALFEATURE|GLOBALMODULE|GLOBALLIMITATION/.test(detail));
    balanced(detail); balanced(connection);
  }
});

check('all device modals render and close in All and each version', () => {
  const ui = boot();
  for (const major of ['', ...families]) {
    ui.version(major);
    for (const device of catalogue.devices) {
      ui.clickData('device-id', device.device_id);
      balanced(ui.get('modalContent').innerHTML);
      assert(ui.get('modalContent').innerHTML.includes('id="modalTitle"'));
      assert(!ui.get('modal').classes.has('hidden'));
      ui.clickData('close-modal', ''); assert(ui.get('modal').classes.has('hidden'));
    }
  }
});

check('all module lookups and connection pairs render in All and each version', () => {
  const ui = boot();
  for (const major of ['', ...families]) {
    ui.version(major);
    const devices = allowed(catalogue, major);
    for (const device of devices) {
      ui.select('moduleDeviceSelect', String(device.device_id));
      balanced(ui.get('deviceModules').innerHTML);
      ui.select('connDeviceA', String(device.device_id));
      for (const peer of devices) {
        ui.select('connDeviceB', String(peer.device_id));
        for (const allowModules of [false, true]) {
          ui.get('connAllowModules').checked = allowModules; ui.emit('connAllowModules', 'change');
          balanced(ui.get('connectionOutput').innerHTML);
        }
      }
    }
    for (const module of catalogue.modules) {
      ui.select('moduleSelect', String(module.module_id));
      balanced(ui.get('moduleDevices').innerHTML);
    }
  }
});

check('builder initialization connects version, navigation and count callbacks', () => {
  let configuration, initializations = 0, versionChanges = 0;
  const builder = {
    init(options) { configuration = options; initializations++; },
    versionChanged() { versionChanges++; }
  };
  const ui = boot(catalogue, {saved: '8', builder});
  assert.equal(initializations, 1);
  assert.equal(configuration.db, catalogue);
  assert.equal(configuration.getVersion(), '8');
  configuration.onCountChange(7);
  assert.equal(ui.get('builderCount').textContent, '7');
  ui.version('7');
  assert.equal(configuration.getVersion(), '7');
  assert.equal(versionChanges, 1);
  configuration.onVersionChange('9');
  assert.equal(ui.get('versionFilter').value, '9');
  assert.equal(configuration.getVersion(), '9');
  assert.equal(versionChanges, 2);
  configuration.onOpenBuilder();
  assert(ui.get('view-builder').classes.has('active'));
  assert.equal(ui.views.filter(view => view.classes.has('active')).length, 1);
  assert(ui.tabs.find(tab => tab.dataset.view === 'builder').classes.has('active'));
});

check('selection delegation uses numeric identities and success-only focused feedback', () => {
  const calls = [];
  let accepted = true;
  const builder = {
    init() {},
    addDevice(id) { calls.push(['device', id]); return accepted ? 'i-1' : null; },
    addModule(id, deviceId) { calls.push(['part', id, deviceId]); return accepted ? 'p-1' : null; }
  };
  const ui = boot(catalogue, {builder});
  const deviceButton = ui.clickData('select-device', '0005');
  assert.deepEqual(calls.pop(), ['device', 5]);
  assert.match(deviceButton.innerHTML, /Added - add another/);
  assert.equal(deviceButton.getAttribute('aria-label'), 'Added to selected components. Add another.');
  assert.equal(ui.document.activeElement, deviceButton);
  const partButton = ui.clickData('select-module', '0007', 'data-for-device-id="0012"');
  assert.deepEqual(calls.pop(), ['part', 7, 12]);
  assert.match(partButton.innerHTML, /Added - add another/);
  assert.equal(ui.document.activeElement, partButton);
  ui.clickData('select-module', '7');
  assert.deepEqual(calls.pop(), ['part', 7, undefined]);
  accepted = false;
  for (const key of ['select-device', 'select-module']) {
    const rejected = ui.clickData(key, '5');
    assert.equal(rejected.innerHTML, '');
    assert.equal(rejected.getAttribute('aria-label'), null);
    assert.equal(ui.document.activeElement, rejected);
  }
});

check('every module selection button carries the actual 1941 device identity', () => {
  const model = catalogue.devices.find(device => device.pt_name === '1941');
  assert(model && model.modules.length > 1, '1941 must exercise multiple module cards');
  const ui = boot();
  for (const major of ['', ...families]) {
    ui.version(major);
    const expected = major ? model.version_profiles[major].modules.length : model.modules.length;
    ui.select('moduleDeviceSelect', String(model.device_id));
    const lookupButtons = [...ui.get('deviceModules').innerHTML.matchAll(/<button\b([^>]*data-select-module="[^"]+"[^>]*)>/g)];
    assert.equal(lookupButtons.length, expected, (major || 'All') + ' lookup');
    ui.clickData('device-id', model.device_id);
    const modalButtons = [...ui.get('modalContent').innerHTML.matchAll(/<button\b([^>]*data-select-module="[^"]+"[^>]*)>/g)];
    assert.equal(modalButtons.length, expected, (major || 'All') + ' modal');
    for (const match of [...lookupButtons, ...modalButtons]) {
      assert.equal(attributes(match[1])['data-for-device-id'], String(model.device_id), (major || 'All') + ' module owner');
    }
    ui.clickData('close-modal', '');
  }
});

console.log(checks + ' runtime checks passed' + (process.exitCode ? '; failures above' : '.'));
