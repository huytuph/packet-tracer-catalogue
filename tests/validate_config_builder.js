#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const builder = require('../js/config-builder.js');
const root = path.resolve(__dirname, '..');
const sandbox = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'data/catalogue-data.js'), 'utf8'), sandbox);
const catalogue = JSON.parse(JSON.stringify(sandbox.window.PT_CATALOGUE));
const clone = value => JSON.parse(JSON.stringify(value));
const device = name => clone(catalogue.devices.find(row => row.pt_name === name));
const engineSource = fs.readFileSync(path.join(root, 'js/config-builder.js'), 'utf8');
const gateMarker = 'const approved = matchingRecord(device, major, extension, config.modules, commands, checks);';
let passed = 0;

// Synthetic records exercise gating mechanics only; they are not Packet Tracer evidence.
function syntheticRecord(d, major, format, modules, commands, checks) {
  return {id: 'TEST_ONLY_SYNTHETIC', model: d.pt_name, major_version: Number(major), observed_release: major + '.0.1',
    template_revision: '2.0.1', format, modules: modules.map(row => ({moduleId: row.id, quantity: row.quantity})).sort((a, b) => a.moduleId - b.moduleId),
    prerequisites: ['TEST ONLY: synthetic fixture, not observed simulator behavior.'],
    commands: clone(commands).map(row => ({...row, result: 'accepted'})), checks: clone(checks).map(row => ({...row, result: 'accepted'})),
    evidence: {method: 'packet-tracer-runtime', transcript_path: 'evidence/runtime/TEST_ONLY_SYNTHETIC.txt', transcript_sha256: '0'.repeat(64), checked_date: '2026-10-02', error_count: 0,
      running_config_assertions: ['TEST ONLY: synthetic running configuration.'], diagnostic_assertions: ['TEST ONLY: synthetic diagnostic output.']}};
}
function loadEngine(records = [], capture) {
  const browser = {window: {PT_COMMAND_VERIFICATION: {schema_version: 1, records: clone(records)}}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/vendor/ipaddr.js'), 'utf8'), browser);
  if (capture) browser.TEST_ONLY_CAPTURE = capture;
  const source = capture ? engineSource.replace(gateMarker, 'const approved = globalThis.TEST_ONLY_CAPTURE(device, major, extension, config.modules, commands, checks);') : engineSource;
  assert(!capture || source !== engineSource);
  vm.runInNewContext(source, browser);
  return browser.window.PTConfigBuilder;
}
function testedCase(entry, d, c = context()) {
  let record;
  const api = loadEngine([], (...args) => { record = syntheticRecord(...args); return record; });
  const draft = api.generate(entry, d, c);
  assert.equal(draft.ok, true, draft.errors.join('\n'));
  assert.deepEqual(draft.text.trimEnd().split('\n').map(line => line.trim()), record.commands.map(row => row.text));
  assert.deepEqual(draft.verificationText.trim().split('\n'), record.checks.map(row => row.text));
  return record;
}

function check(name, test) {
  test(); passed++;
  console.log('PASS ' + name);
}
function context(major = '9', format = 'txt') {
  return {major, format};
}
function item(d, config = {}) {
  return {id: 'test', deviceId: d.device_id, modules: [], config: {...builder.createConfig(d), ...config}};
}
function routed(name = 'GigabitEthernet0/0') {
  return {name, mode: 'routed', address: '192.168.10.1', mask: '255.255.255.0', description: 'LAN', shutdown: false};
}
function access(name = 'FastEthernet0/1') {
  return {name, mode: 'access', vlan: 10, address: '', mask: '', description: '', shutdown: false};
}
function trunk(name = 'GigabitEthernet0/1') {
  return {name, mode: 'trunk', allowedVlans: '10,20-22', nativeVlan: 1, address: '', mask: '', description: '', shutdown: false};
}
function succeeds(entry, d, c = context()) {
  const gui = builder.describe(d, c).platform === 'gui-plan';
  const api = gui ? builder : loadEngine([testedCase(entry, d, c)]);
  const result = api.generate(entry, d, c);
  assert.equal(result.ok, true, result.errors.join('\n'));
  if (gui) assert.match(result.text, /UNTESTED/);
  else {
    assert.equal(result.verification.status, 'Verified'); assert.equal(result.verification.observedRelease, c.major + '.0.1');
    assert.equal(result.verification.templateRevision, '2.0.1');
    assert.equal(result.verification.transcriptPath, 'evidence/runtime/TEST_ONLY_SYNTHETIC.txt');
    assert.deepEqual(Array.from(result.verification.prerequisites), ['TEST ONLY: synthetic fixture, not observed simulator behavior.']);
    assert(result.warnings.includes('Tested-case prerequisite: TEST ONLY: synthetic fixture, not observed simulator behavior.'));
  }
  return result;
}
function fails(entry, d, pattern, c = context()) {
  const result = builder.generate(entry, d, c);
  assert.equal(result.ok, false);
  assert(result.errors.some(error => pattern.test(error)), result.errors.join('\n'));
  assert.equal(result.text, ''); assert.equal(result.verificationText, '');
  return result;
}

check('browser global and Node exports have the same pure API', () => {
  const browser = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/vendor/ipaddr.js'), 'utf8'), browser);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/config-builder.js'), 'utf8'), browser);
  assert.deepEqual(Object.keys(browser.window.PTConfigBuilder), Object.keys(builder));
  assert(Object.isFrozen(builder));
});
check('all 34 components have a platform adapter and all 52 features have explicit coverage dispositions', () => {
  assert.equal(catalogue.devices.filter(builder.supportsDevice).length, 34);
  let cli = 0, worksheets = 0;
  for (const d of catalogue.devices) {
    const info = builder.describe(d, {major: '9'});
    assert(['ios-router', 'ios-l2', 'ios-l3', 'asa', 'gui-plan'].includes(info.platform));
    assert.equal(info.coverage.length, 52); assert.equal(new Set(info.coverage.map(row => row.slug)).size, 52);
    assert(info.coverage.every(row => ['template', 'gui', 'hardware', 'advanced', 'unsupported'].includes(row.kind) && row.reason));
    assert(info.sources.every(source => source.startsWith('https://tutorials.ptnetacad.net/help/default/')));
    if (info.cli) cli++; else worksheets++;
  }
  assert.equal(cli, 26); assert.equal(worksheets, 8);
  fails(item({device_id: 999, pt_name: 'Unknown'}), {device_id: 999, pt_name: 'Unknown'}, /no configuration adapter/);
  assert.equal(builder.supportsDevice(null), false);
});
check('default configurations contain no guessed ports and do not share mutable arrays', () => {
  const d = device('2911'), first = builder.createConfig(d, 2), second = builder.createConfig(d, 2);
  assert.equal(first.hostname, 'R2'); assert.equal(builder.createConfig(device('2960-24TT')).hostname, 'SW1');
  assert.deepEqual(first.interfaces, []); assert.equal(first.interfacesConfirmed, false);
  first.interfaces.push(routed()); assert.deepEqual(second.interfaces, []);
});
check('synthetic exact router cases exercise each 6/7/8/9 family without mutating inputs', () => {
  for (const major of ['6', '7', '8', '9']) {
    const d = device('2911'), entry = item(d, {interfaces: [routed()], interfacesConfirmed: true,
      routes: [{network: '0.0.0.0', mask: '0.0.0.0', nextHop: '192.168.10.2'}]});
    const before = JSON.stringify({d, entry});
    const result = succeeds(entry, d, context(major));
    assert.match(result.text, /ip route 0\.0\.0\.0 0\.0\.0\.0 192\.168\.10\.2/);
    assert.equal(JSON.stringify({d, entry}), before);
  }
});
check('global major is the sole version control and obsolete exact release fields are ignored', () => {
  const d = device('1841'), entry = item(d);
  for (const major of [9, null, undefined, '5', '10', '9\n']) fails(entry, d, /global Packet Tracer/, {major, format: 'txt'});
  for (const major of ['6', '7', '8', '9']) {
    const result = succeeds({...entry, release: '7.2.2'}, d, {major, release: '8.2.2\nreload', format: 'txt'});
    assert(!result.text.includes('7.2.2')); assert(!result.text.includes('8.2.2')); assert(!result.text.includes('reload'));
  }
  fails(entry, d, /output/, {...context(), format: 'zip'});
  fails({...entry, deviceId: 12345}, d, /device ID/);
});
check('All versions never borrows availability or unsupported feature claims from any release profile', () => {
  const d = device('2960-24TT');
  for (const profile of Object.values(d.version_profiles)) { profile.availability.available = false; profile.features = [{slug: 'dot1q_trunk', support_mode: 'unsupported', verification_status: 'Verified'}]; }
  const result = fails(item(d, {interfaces: [trunk()], interfacesConfirmed: true}), d, /exact runtime-tested/, {major: '', format: 'txt'});
  assert(result.warnings.some(warning => /combined, unverified/.test(warning)));
  assert(builder.describe(d, {major: ''}).coverage.every(row => /Unverified combined/.test(row.status)));
});
check('unavailable blocks, unknown warns and family availability never certifies an exact release', () => {
  const d = device('1841'); d.version_profiles['9'].availability.available = false;
  fails(item(d), d, /unavailable/);
  d.version_profiles['9'].availability.available = null;
  assert(succeeds(item(d), d).warnings.some(warning => /availability is unknown/.test(warning)));
  delete d.version_profiles['9'];
  assert(succeeds(item(d), d).warnings.some(warning => /availability is unknown/.test(warning)));
});
check('a mismatched profile cannot supply availability or capability claims for the target major', () => {
  const d = device('2960-24TT');
  d.version_profiles['9'] = {major_version: 8, availability: {available: false, verification_status: 'Verified'},
    features: [{slug: 'dot1q_trunk', support_mode: 'unsupported', verification_status: 'Verified', major_version: 9}]};
  const result = succeeds(item(d, {interfaces: [trunk()], interfacesConfirmed: true}), d);
  assert(result.warnings.some(warning => /availability is unknown/.test(warning)));
  assert(result.warnings.some(warning => /802\.1Q.*not verified/.test(warning)));
});
check('only selected-major verified unsupported features block relevant commands', () => {
  const d = device('2960-24TT'), entry = item(d, {interfaces: [trunk()], interfacesConfirmed: true});
  d.feature_map.dot1q_trunk = {slug: 'dot1q_trunk', support_mode: 'unsupported', verification_status: 'Verified', major_version: 8};
  d.version_profiles['9'].features = [{...d.feature_map.dot1q_trunk, major_version: 8}];
  succeeds(entry, d);
  d.version_profiles['9'].features[0].major_version = 9;
  fails(entry, d, /802\.1Q.*unsupported/);
  d.version_profiles['9'].features[0].verification_status = 'Partial'; succeeds(entry, d);
  d.version_profiles['9'].features = [{slug: 'nat', support_mode: 'unsupported', verification_status: 'Verified', major_version: 9}]; succeeds(entry, d);
});
check('explicit interface confirmation is required for ports and management SVI', () => {
  const d = device('2911'); fails(item(d, {interfaces: [routed()]}), d, /Confirm the concrete/);
  const sw = device('2960-24TT'); fails(item(sw, {management: {enabled: true, vlan: 1, address: '192.168.1.2', mask: '255.255.255.0', gateway: '192.168.1.1'}}), sw, /Confirm the concrete/);
});
check('L2 switch rejects routed IP, static routes and ip routing', () => {
  const d = device('2960-24TT');
  for (const config of [{interfaces: [routed()], interfacesConfirmed: true}, {enableRouting: true},
    {routes: [{network: '10.0.0.0', mask: '255.0.0.0', nextHop: '192.168.1.1'}]}]) fails(item(d, config), d, /Layer 2/);
});
check('L3 switch requires routing enablement and emits no switchport without L2 default gateway', () => {
  const d = device('3560-24PS'), config = {interfaces: [routed('FastEthernet0/1')], interfacesConfirmed: true};
  fails(item(d, config), d, /Enable IP routing/);
  const result = succeeds(item(d, {...config, enableRouting: true}), d);
  assert.match(result.text, /ip routing/); assert.match(result.text, /no switchport/); assert(!result.text.includes('ip default-gateway'));
  fails(item(d, {management: {enabled: true, vlan: 10, address: '192.168.1.2', mask: '255.255.255.0', gateway: ''}, interfacesConfirmed: true}), d, /only available for Layer 2/);
});
check('trunk encapsulation is emitted for 3560 but not dot1q-only switch models', () => {
  for (const name of ['2950-24', '2960-24TT', '3560-24PS', '3650-24PS']) {
    const d = device(name), result = succeeds(item(d, {interfaces: [trunk()], interfacesConfirmed: true}), d);
    assert.equal(result.text.includes('switchport trunk encapsulation dot1q'), name === '3560-24PS');
  }
});
check('Layer 3 access and trunk templates restore switchport mode before configuring it', () => {
  for (const name of ['3560-24PS', '3650-24PS']) {
    const d = device(name);
    for (const port of [access(), trunk()]) {
      const result = succeeds(item(d, {interfaces: [port], interfacesConfirmed: true}), d);
      assert(result.text.indexOf(' switchport\n') < result.text.indexOf(' switchport mode ' + port.mode));
      assert(result.text.includes(' switchport\n'));
    }
  }
});
check('management SVI and gateway are validated and generated only on L2 switches', () => {
  const d = device('2960-24TT'), config = {vlans: [{id: 10, name: 'Management'}], interfacesConfirmed: true,
    management: {enabled: true, vlan: 10, address: '192.168.1.2', mask: '255.255.255.0', gateway: '192.168.1.1'}};
  const result = succeeds(item(d, config), d);
  assert.match(result.text, /interface Vlan10/); assert.match(result.text, /ip default-gateway 192\.168\.1\.1/);
  for (const gateway of ['192.168.2.1', '192.168.1.2', '192.168.1.0', '192.168.1.255', '224.1.1.1']) fails(item(d, {...config, management: {...config.management, gateway}}), d, /gateway/);
});
check('router switching requires module selection and cautions about EtherSwitch port roles', () => {
  const d = device('2811'), entry = item(d, {interfaces: [access()], interfacesConfirmed: true});
  fails(entry, d, /EtherSwitch module/);
  entry.modules = [{moduleId: 1, quantity: 1}]; fails(entry, d, /EtherSwitch module/);
  entry.modules = [{moduleId: 2, quantity: 1}];
  const result = succeeds(entry, d); assert(result.warnings.some(warning => /EtherSwitch module ports/.test(warning)));
  assert(result.warnings.some(warning => /module compatibility.*not verified/i.test(warning)));
  assert(result.warnings.some(warning => /only reference existing VLANs/.test(warning)));
  assert(!result.text.includes('interface Serial'));
});
check('router EtherSwitch templates reference existing VLANs without global VLAN creation in either format', () => {
  const d = device('2811'), entry = item(d, {interfaces: [access()], interfacesConfirmed: true});
  entry.modules = [{moduleId: 2, quantity: 1}];
  for (const format of ['txt', 'cfg']) {
    const result = succeeds(entry, d, context('9', format));
    assert(!/^vlan\s/m.test(result.text));
    assert.match(result.verificationText, /^show vlan-switch brief$/m);
    assert(!/^show vlan brief$/m.test(result.verificationText));
    fails({...entry, config: {...entry.config, vlans: [{id: 10, name: 'Users'}]}}, d, /Router VLAN creation/, context('9', format));
  }
});
check('module limits and required-module features use selected-version evidence only', () => {
  const d = device('2811'), entry = item(d, {interfaces: [access()], interfacesConfirmed: true});
  d.modules.push({module_id: 999, model: 'HWIC-4ESW'});
  d.version_profiles['9'].modules = [{module_id: 999, model: 'HWIC-4ESW', compatible: 1, verification_status: 'Verified', max_quantity: 1, major_version: 9}];
  d.version_profiles['9'].features = [{slug: 'vlan', support_mode: 'module_required', required_module_id: 999, verification_status: 'Verified', major_version: 9}];
  entry.modules = [{moduleId: 998, quantity: 1}]; fails(entry, d, /documented module/);
  entry.modules = [{moduleId: 999, quantity: 2}]; fails(entry, d, /compatibility limit/);
  entry.modules = [{moduleId: 999, quantity: 1}]; succeeds(entry, d);
  d.version_profiles['9'].modules[0].compatible = 0; fails(entry, d, /incompatible/);
  d.version_profiles['9'].modules[0].major_version = 8;
  succeeds(entry, d);
});
check('hostnames, interface names, VLAN names, descriptions and numeric fields reject injection', () => {
  const d = device('2960-24TT'), base = {interfaces: [access()], interfacesConfirmed: true, vlans: [{id: 10, name: 'Users'}]};
  for (const hostname of ['R1\nreload', 'R1;reload', 'a b', '-R1', 'R1-', 'x'.repeat(64), 'R1\u2028end']) fails(item(d, {...base, hostname}), d, /Hostname/);
  for (const name of ['FastEthernet0/1\nend', 'FastEthernet0/1\n', 'range FastEthernet0/1-24', 'GigabitEthernet0/9999', 'Fa0/1;reload']) fails(item(d, {...base, interfaces: [{...access(), name}]}), d, /concrete/);
  for (const description of ['text\rreload', 'text\nend', 'text\x00', 'text\x1b', 'text\u2029']) fails(item(d, {...base, interfaces: [{...access(), description}]}), d, /description/);
  for (const name of ['Users\nend', 'Users;reload', 'Users Room', 'x'.repeat(33)]) fails(item(d, {...base, vlans: [{id: 10, name}]}), d, /VLAN names/);
  for (const id of ['10\nend', '10\n', '10;reload', '1e1', true, 10.1]) fails(item(d, {...base, vlans: [{id, name: 'Users'}]}), d, /VLAN 1/);
  fails({...item(d, base), modules: [{moduleId: '1\nend', quantity: '1;reload'}]}, d, /whole numbers/);
});
check('continuous masks, host address boundaries and static network host bits are checked', () => {
  const d = device('2911'), base = {interfaces: [routed()], interfacesConfirmed: true};
  for (const mask of ['255.0.255.0', '255.255.255.1', '256.255.0.0', '0.0.0.0', '255.255.255.0\nend', '255.255.255.0\n']) fails(item(d, {...base, interfaces: [{...routed(), mask}]}), d, /mask/);
  for (const address of ['0.0.0.0', '127.0.0.1', '224.0.0.1', '255.255.255.255', '192.168.10.0', '192.168.10.255', '256.1.1.1', '192.168.10.1\n']) fails(item(d, {...base, interfaces: [{...routed(), address}]}), d, /address/);
  fails(item(d, {routes: [{network: '10.0.0.1', mask: '255.255.255.0', nextHop: '192.168.1.2'}]}), d, /host bits/);
  fails(item(d, {routes: [{network: '0.0.0.0', mask: '255.0.0.0', nextHop: '192.168.1.2'}]}), d, /default route/);
  fails(item(d, {routes: [{network: '10.0.0.0', mask: '255.0.0.0', nextHop: '127.0.0.1'}]}), d, /next-hop/);
  succeeds(item(d, {...base, interfaces: [{...routed(), mask: '255.255.255.254'}]}), d);
});
check('VLAN ranges, reserved and extended VLANs and duplicate concrete interfaces are rejected', () => {
  const d = device('2960-24TT'), base = {interfaces: [trunk()], interfacesConfirmed: true};
  for (const allowedVlans of ['22-20', '0', '4094', '4095', '1002', '1000-1006', '1001-1006', '10,10', '10-20,15-25', '10;end', '10\n20', '10,,20']) fails(item(d, {...base, interfaces: [{...trunk(), allowedVlans}]}), d, /allowed VLANs/);
  for (const id of [0, 4094, 4095, 1002, 1003, 1004, 1005, 1006]) {
    fails(item(d, {...base, vlans: [{id, name: 'Users'}]}), d, /VLAN 1/);
    fails(item(d, {...base, interfaces: [{...access(), vlan: id}]}), d, /access VLAN/);
    fails(item(d, {...base, interfaces: [{...trunk(), nativeVlan: id}]}), d, /native VLAN/);
    fails(item(d, {interfacesConfirmed: true, management: {enabled: true, vlan: id, address: '192.168.1.2', mask: '255.255.255.0', gateway: ''}}), d, /Management VLAN/);
  }
  fails(item(d, {...base, vlans: [{id: 10, name: 'Users'}, {id: '10', name: 'More'}]}), d, /VLAN IDs must be unique/);
  fails(item(d, {interfaces: [access('Fa0/1'), access('FastEthernet0/1')], interfacesConfirmed: true}), d, /Interface names must be unique/);
  succeeds(item(d, {...base, interfaces: [{...trunk(), allowedVlans: '10, 20-22'}]}), d);
  const boundary = succeeds(item(d, {...base, vlans: [{id: 1001, name: 'Boundary'}], interfaces: [{...trunk(), nativeVlan: 1001, allowedVlans: '1-1001'}]}), d);
  assert.match(boundary.text, /^vlan 1001$/m);
  assert.match(boundary.verificationText, /^show vlan brief$/m);
});
check('routed-interface subnets reject equal and nested overlaps but allow separate networks', () => {
  const d = device('2911'), first = routed('Gi0/0'), second = {...routed('Gi0/1'), address: '192.168.10.2'};
  fails(item(d, {interfaces: [first, second], interfacesConfirmed: true}), d, /subnets cannot overlap/);
  fails(item(d, {interfaces: [{...first, address: '10.0.0.1', mask: '255.0.0.0'}, {...second, address: '10.2.0.1', mask: '255.255.0.0'}], interfacesConfirmed: true}), d, /subnets cannot overlap/);
  succeeds(item(d, {interfaces: [first, {...second, address: '192.168.11.1'}], interfacesConfirmed: true}), d);
});
check('txt and cfg scripts start in configuration mode and finish with end without save reload or erase', () => {
  const d = device('2960-24TT'), entry = item(d, {interfaces: [access()], interfacesConfirmed: true, vlans: [{id: 10, name: 'Users'}]});
  const txt = succeeds(entry, d), cfg = succeeds(entry, d, context('9', 'cfg'));
  assert.equal(txt.text, cfg.text);
  assert.equal(txt.filename, 'SW1.txt'); assert.equal(cfg.filename, 'SW1.cfg');
  for (const result of [txt, cfg]) {
    const lines = result.text.trimEnd().split('\n');
    assert.deepEqual(Array.from(lines.slice(0, 2)), ['enable', 'configure terminal']);
    assert.equal(lines.at(-1), 'end');
    for (const wrapper of ['enable', 'configure terminal', 'end']) assert.equal(lines.filter(line => line === wrapper).length, 1);
    assert(!lines.some(line => line.startsWith('!')));
    assert(!/^\s*(?:write|copy|reload|erase|delete)\b/m.test(result.text));
    assert(!result.text.includes('show running-config')); assert.match(result.verificationText, /show running-config/);
  }
});
check('all CLI adapters wrap both file formats with exactly one enable configure terminal and end', () => {
  for (const d of catalogue.devices.filter(row => builder.describe(row, context()).cli)) {
    for (const format of ['txt', 'cfg']) {
      const result = succeeds(item(d), d, context('9', format));
      const lines = result.text.trimEnd().split('\n');
      assert.deepEqual(Array.from(lines.slice(0, 2)), ['enable', 'configure terminal'], d.pt_name + ' ' + format);
      assert.equal(lines.at(-1), 'end', d.pt_name + ' ' + format);
      for (const wrapper of ['enable', 'configure terminal', 'end']) assert.equal(lines.filter(line => line === wrapper).length, 1);
      assert.equal(lines[2], 'hostname ' + builder.createConfig(d).hostname);
    }
  }
});
check('multi-section S1 and S2 VLAN scripts keep commands between the default wrappers', () => {
  const d = device('2960-24TT');
  const vlans = [10, 20, 30].map(id => ({id, name: 'VLAN' + id}));
  const drafts = [
    item(d, {hostname: 'S1', vlans, interfacesConfirmed: true, interfaces: [1, 5, 4].map(port => ({...trunk('FastEthernet0/' + port), allowedVlans: '10,20,30'}))}),
    item(d, {hostname: 'S2', vlans, interfacesConfirmed: true, interfaces: [10, 20, 30].map((vlan, index) => ({...access('FastEthernet0/' + (11 + index)), vlan})).concat({...trunk('FastEthernet0/5'), allowedVlans: '10,20,30'})})
  ];
  for (const draft of drafts) {
    for (const format of ['txt', 'cfg']) {
      const lines = succeeds(draft, d, context('9', format)).text.trimEnd().split('\n').map(line => line.trim());
      assert.deepEqual(Array.from(lines.slice(0, 3)), ['enable', 'configure terminal', 'hostname ' + draft.config.hostname]);
      assert.equal(lines.at(-1), 'end');
      for (const vlan of vlans) assert(lines.includes('vlan ' + vlan.id) && lines.includes('name ' + vlan.name));
      for (const port of draft.config.interfaces) assert(lines.includes('interface ' + port.name));
      assert.equal(lines.filter(line => line === 'exit').length, vlans.length + draft.config.interfaces.length);
    }
  }
});
check('malformed rows and types fail without throwing', () => {
  const d = device('2911');
  for (const field of ['interfaces', 'vlans', 'routes']) fails(item(d, {[field]: 'bad'}), d, /must be a list/);
  fails(item(d, {interfaces: [null], interfacesConfirmed: true}), d, /concrete/);
  fails(item(d, {management: null}), d, /Management settings/);
  fails(item(d, {enableRouting: 'true'}), d, /checkbox/);
  fails({config: null}, d, /missing or invalid/);
});

check('new adapter defaults use meaningful hostnames without guessing hardware settings', () => {
  for (const [name, prefix] of [['ASA5505', 'FW'], ['AccessPoint-PT', 'AP'], ['WLC-2504', 'WLC'], ['HomeRouter', 'HR'], ['MX65W', 'MX'], ['Cloud-PT', 'CLOUD']]) assert.equal(builder.createConfig(device(name), 3).hostname, prefix + '3');
  for (const d of catalogue.devices) {
    if (builder.describe(d).cli) fails(item(d), d, /exact runtime-tested/, {major: '', format: 'txt'});
    else succeeds(item(d), d, {major: '', format: 'txt'});
  }
});
check('unknown availability suppresses technical facts and legacy version strings cannot leak across majors', () => {
  const d = device('2960-24TT'), entry = item(d, {interfaces: [trunk()], interfacesConfirmed: true});
  d.version_profiles['9'].features = [{slug: 'dot1q_trunk', support_mode: 'unsupported', verification_status: 'Verified', version: '8.2.2'}];
  succeeds(entry, d);
  d.version_profiles['9'].features[0].version = '9.0.1'; fails(entry, d, /unsupported/);
  d.version_profiles['9'].availability.available = null;
  succeeds(entry, d);
  assert(!builder.describe(d, {major: '9'}).coverage.some(row => row.status === 'Verified unsupported'));
  d.version_profiles['9'].availability.available = false;
  d.version_profiles['9'].features[0].support_mode = 'native';
  assert(builder.describe(d, {major: '9'}).coverage.every(row => !/^Verified/.test(row.status)));
  fails(entry, d, /unavailable/);
  const router = device('2811'), moduleEntry = item(router, {interfaces: [access()], interfacesConfirmed: true}); moduleEntry.modules = [{moduleId: 2, quantity: 2}];
  router.version_profiles['9'].modules = [{module_id: 2, model: 'HWIC-4ESW', compatible: 0, verification_status: 'Verified', version: '8.2.2', max_quantity: 1}];
  succeeds(moduleEntry, router);
  router.version_profiles['9'].modules[0].version = '9.0.1'; fails(moduleEntry, router, /incompatible/);
  router.version_profiles['9'].availability.available = null;
  assert(succeeds(moduleEntry, router).warnings.some(warning => /module compatibility.*not verified/i.test(warning)));
});
check('GUI presets match manual configuration roles and never emit IOS or CFG content', () => {
  for (const name of ['LAP-PT', '3702i']) assert(!builder.describe(device(name)).worksheetFields.some(field => field.label === 'SSID'));
  assert(builder.describe(device('MX65W')).worksheetFields.find(field => field.label === 'DHCP server settings').readOnly);
  const d = device('AccessPoint-PT'), entry = item(d, {settings: [{label: 'SSID', value: 'Lab-Network'}, {label: 'Authentication', value: 'WPA2-PSK'}, {label: 'Radio enabled', value: true}, {label: 'Wireless passphrase', value: 'Practice123'}]});
  const result = succeeds(entry, d, context('9', 'cfg'));
  assert.equal(result.outputKind, 'worksheet'); assert.equal(result.filename, 'AP1.txt');
  assert.match(result.text, /Not executable CLI/); assert.match(result.text, /SSID: Lab-Network/); assert(!/^enable$|^configure terminal$|^hostname /m.test(result.text));
  assert(result.warnings.some(warning => /plaintext/.test(warning)));
  fails(item(d, {settings: [{label: 'Authentication', value: 'WPA3'}]}), d, /documented choices/);
  const meraki = device('MX65W'); fails(item(meraki, {settings: [{label: 'DHCP server settings', value: 'change pool'}]}), meraki, /read-only/);
  fails(item(d, {settings: [{label: 'SSID\nend', value: 'bad'}]}), d, /single-line/);
});
check('IOS system credentials use explicit plaintext selectors and SSH has prerequisites', () => {
  const d = device('2911'), system = {domainName: 'lab.example', enableSecret: '5', users: [{name: 'admin', secret: '0', privilege: 15}], ssh: {enabled: true, version: 2, rsaBits: 2048, vtyStart: 0, vtyEnd: 4}};
  const result = succeeds(item(d, {system}), d);
  assert.match(result.text, /^enable secret 0 5$/m); assert.match(result.text, /^username admin privilege 15 secret 0 0$/m);
  assert.match(result.text, /crypto key generate rsa general-keys modulus 2048/); assert.match(result.text, /transport input ssh/);
  assert(result.warnings.some(warning => /plaintext credentials/.test(warning)));
  fails(item(d, {system: {...system, domainName: ''}}), d, /requires a domain/);
  fails(item(d, {system: {...system, users: []}}), d, /local user/);
  for (const secret of ['bad\nend', 'bad;reload', 'two words', '\x1bsecret']) fails(item(d, {system: {...system, enableSecret: secret}}), d, /Enable secret/);
  fails(item(d, {system: {...system, domainName: 'lab.example\nend'}}), d, /Domain/);
  fails(item(d, {system: {...system, users: [{name: 'admin\nend', secret: 'Good', privilege: 15}]}}), d, /username/);
});
check('IPv6 uses the bundled parser with routing prerequisites and canonical duplicate detection', () => {
  const d = device('2911'), config = {interfaces: [{...routed(), ipv6: '2001:0db8:1:0::1/64'}], interfacesConfirmed: true, ipv6Routing: true};
  const result = succeeds(item(d, config), d); assert.match(result.text, /ipv6 unicast-routing/); assert.match(result.text, /ipv6 address 2001:db8:1::1\/64/);
  fails(item(d, {...config, ipv6Routing: false}), d, /Enable IPv6 routing/);
  for (const ipv6 of ['fe80::1/64', '::1/128', '::/64', 'ff02::1/64', '2001:db8:::1/64', '2001:db8::1/129', '2001:db8::1/64\nend', '::ffff:192.0.2.1/128']) fails(item(d, {...config, interfaces: [{...routed(), ipv6}]}), d, /IPv6 address/);
  fails(item(d, {...config, interfaces: [config.interfaces[0], {...routed('Gi0/1'), address: '192.168.11.1', ipv6: '2001:db8:1::1/128'}]}), d, /IPv6.*unique/);
});
check('serial interfaces gate serial capability and DCE clocking separately from encapsulation', () => {
  const d = device('2911'), config = {interfaces: [{...routed('Serial0/0/0'), encapsulation: 'ppp', clockRate: 64000, dceConfirmed: true}], interfacesConfirmed: true};
  const result = succeeds(item(d, config), d); assert.match(result.text, /encapsulation ppp/); assert.match(result.text, /clock rate 64000/);
  fails(item(d, {...config, interfaces: [{...config.interfaces[0], dceConfirmed: false}]}), d, /DCE end/);
  fails(item(d, {...config, interfaces: [{...config.interfaces[0], encapsulation: 'frame-relay'}]}), d, /HDLC\/PPP/);
  d.version_profiles['9'].features = [{slug: 'serial_wan', support_mode: 'unsupported', verification_status: 'Verified', major_version: 9}];
  fails(item(d, {interfaces: [routed('Serial0/0/0')], interfacesConfirmed: true}), d, /Serial WAN.*unsupported/);
});
check('router subinterfaces have explicit tags and reject duplicate parent tags or native subinterfaces', () => {
  const d = device('2911'), first = {...routed('Gi0/0.10'), dot1qVlan: 10, native: true}, second = {...routed('Gi0/0.20'), address: '192.168.20.1', dot1qVlan: 20};
  const config = {interfaces: [first, second], interfacesConfirmed: true};
  assert.match(succeeds(item(d, config), d).text, /encapsulation dot1Q 10 native/);
  fails(item(d, {...config, interfaces: [{...first, dot1qVlan: ''}]}), d, /require.*VLAN/);
  fails(item(d, {...config, interfaces: [first, {...second, dot1qVlan: 10}]}), d, /reuse.*VLAN tag/);
  fails(item(d, {...config, interfaces: [first, {...second, native: true}]}), d, /only one native/);
  fails(item(d, {...config, interfaces: [{...first, name: 'Serial0/0/0.10'}]}), d, /Ethernet router ports/);
  fails(item(d, {...config, interfaces: [{...first, name: 'Port-channel0'}]}), d, /concrete/);
});
check('routed SVIs support IPv6 DHCP relay ACL and HSRP with switched hardware prerequisites', () => {
  const d = device('3650-24PS'), config = {enableRouting: true, ipv6Routing: true, interfacesConfirmed: true,
    svis: [{vlan: 10, address: '192.168.10.1', mask: '255.255.255.0', ipv6: '2001:db8:10::1/64', description: 'Users', helperAddress: '192.0.2.1', aclIn: 'MGMT', aclOut: '', hsrp: {enabled: true, group: 10, address: '192.168.10.254', priority: 110, preempt: true}}],
    acls: [{name: 'MGMT', type: 'standard', entries: [{action: 'permit', source: 'any'}]}]};
  const result = succeeds(item(d, config), d); for (const command of ['interface Vlan10', 'ip helper-address 192.0.2.1', 'ip access-group MGMT in', 'standby 10 ip 192.168.10.254', 'standby 10 preempt']) assert(result.text.includes(command));
  assert.match(result.verificationText, /show standby brief/);
  fails(item(d, {...config, enableRouting: false}), d, /IP routing enabled/);
  fails(item(d, {...config, routes: [{network: '10.0.0.0', mask: '255.0.0.0', nextHop: '192.168.10.1'}]}), d, /next hop.*SVI/);
  fails(item(d, {...config, svis: [{...config.svis[0], aclIn: 'MISSING'}]}), d, /ACL references/);
  fails(item(d, {...config, svis: [{...config.svis[0], hsrp: {...config.svis[0].hsrp, group: 256}}]}), d, /group 0-255/);
  d.version_profiles['9'].features = [{slug: 'hsrp', support_mode: 'unsupported', verification_status: 'Verified', major_version: 9}]; fails(item(d, config), d, /HSRP.*unsupported/);
  const router = device('2811'), entry = item(router, {svis: [{vlan: 10, address: '192.168.10.1', mask: '255.255.255.0'}], interfacesConfirmed: true});
  fails(entry, router, /Router SVIs require/); entry.modules = [{moduleId: 2, quantity: 1}]; succeeds(entry, router);
});
check('routed SVI and physical interface IPv4 and IPv6 duplicates are rejected', () => {
  const d = device('3650-24PS'), config = {enableRouting: true, ipv6Routing: true, interfacesConfirmed: true,
    interfaces: [{...routed(), ipv6: '2001:db8:1::1/64'}], svis: [{vlan: 10, address: '192.168.11.1', mask: '255.255.255.0', ipv6: '2001:0db8:1:0:0:0:0:1/128'}]};
  fails(item(d, config), d, /IPv6.*unique/);
  fails(item(d, {...config, svis: [{vlan: 10, address: '192.168.10.2', mask: '255.255.255.0'}]}), d, /subnets cannot overlap/);
});
check('HSRP validates virtual subnet and platform restrictions on routed ports', () => {
  const d = device('2911'), hsrp = {enabled: true, group: 1, address: '192.168.10.254', priority: 100, preempt: true}, config = {interfaces: [{...routed(), hsrp}], interfacesConfirmed: true};
  assert.match(succeeds(item(d, config), d).text, /standby 1 priority 100/);
  for (const address of ['192.168.11.254', '192.168.10.1', '192.168.10.255']) fails(item(d, {...config, interfaces: [{...routed(), hsrp: {...hsrp, address}}]}), d, /HSRP/);
});
check('STP EtherChannel voice VLAN and port security emit typed switch commands with mode checks', () => {
  const d = device('2960-24TT'), config = {interfacesConfirmed: true, interfaces: [access('Fa0/1'), access('Fa0/2')], switching: {stpMode: 'rapid-pvst', priorities: [{vlan: 10, priority: 4096}], channels: [{group: 1, mode: 'active', members: ['Fa0/1', 'Fa0/2']}]} };
  const result = succeeds(item(d, config), d); assert.match(result.text, /spanning-tree mode rapid-pvst/); assert.match(result.text, /channel-group 1 mode active/); assert.match(result.text, /interface Port-channel1/);
  fails(item(d, {...config, interfaces: [access('Fa0/1'), {...access('Fa0/2'), vlan: 20}]}), d, /VLAN settings must match/);
  fails(item(d, {...config, interfaces: [...config.interfaces, access('Port-channel1')]}), d, /manually configured Port-channel/);
  const secure = {interfacesConfirmed: true, interfaces: [{...access(), voiceVlan: 20, portfast: true, bpduguard: true, portSecurity: {enabled: true, maximum: 2, violation: 'restrict', sticky: true}}]};
  const secureText = succeeds(item(d, secure), d).text; assert.match(secureText, /switchport voice vlan 20/); assert.match(secureText, /port-security mac-address sticky/);
  fails(item(d, {interfacesConfirmed: true, interfaces: [{...trunk(), portfast: true}]}), d, /access-mode/);
  fails(item(d, {...secure, interfaces: [{...secure.interfaces[0], portfast: false}]}), d, /requires PortFast/);
});
check('a missing browser IPv6 dependency does not crash ordinary drafts and rejects IPv6 clearly', () => {
  const browser = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/config-builder.js'), 'utf8'), browser);
  const d = device('2911'), api = browser.window.PTConfigBuilder;
  assert.equal(api.generate(item(d), d, {major: '9', format: 'txt'}).ok, false);
  const result = api.generate(item(d, {interfacesConfirmed: true, ipv6Routing: true, interfaces: [{...routed(), ipv6: '2001:db8::1/64'}]}), d, {major: '9', format: 'txt'});
  assert.equal(result.ok, false); assert(result.errors.some(error => /bundled IP parser/.test(error)));
});
check('OSPF EIGRP RIP and BGP have typed networks and platform prerequisites', () => {
  const d = device('2911'), protocols = {ospf: {enabled: true, processId: 1, routerId: '1.1.1.1', networks: [{network: '192.168.10.0', wildcard: '0.0.0.255', area: 0}]},
    eigrp: {enabled: true, asn: 100, networks: [{network: '10.0.0.0', wildcard: '0.255.255.255'}]}, rip: {enabled: true, networks: [{network: '10.0.0.0'}]},
    bgp: {enabled: true, asn: 65001, networks: [{network: '198.51.100.0', mask: '255.255.255.0'}], neighbors: [{address: '192.0.2.2', remoteAs: 65002}]}};
  const result = succeeds(item(d, {protocols}), d); for (const command of ['router ospf 1', 'network 192.168.10.0 0.0.0.255 area 0', 'router eigrp 100', 'router rip', 'router bgp 65001', 'neighbor 192.0.2.2 remote-as 65002']) assert(result.text.includes(command));
  fails(item(d, {protocols: {...protocols, rip: {enabled: true, networks: [{network: '10.1.0.0'}]}}}), d, /classful network/);
  fails(item(device('2960-24TT'), {protocols}), device('2960-24TT'), /Dynamic routing requires/);
  d.version_profiles['9'].features = [{slug: 'ospf', support_mode: 'unsupported', verification_status: 'Verified', major_version: 9}]; fails(item(d, {protocols}), d, /OSPF.*unsupported/);
});
check('IOS ACL NAT and DHCP templates validate definitions dependencies and conflicts', () => {
  const d = device('2911'), config = {interfacesConfirmed: true, interfaces: [{...routed('Gi0/0'), natRole: 'inside', aclIn: 'WEB'}, {...routed('Gi0/1'), address: '203.0.113.1', natRole: 'outside'}],
    acls: [{name: 'NAT_INSIDE', type: 'standard', entries: [{action: 'permit', source: '192.168.10.0', sourceWildcard: '0.0.0.255'}]}, {name: 'WEB', type: 'extended', entries: [{action: 'permit', protocol: 'tcp', source: 'any', destination: '198.51.100.10', destinationPort: 443}]}],
    nat: {pat: [{acl: 'NAT_INSIDE', interface: 'Gi0/1'}], static: [{inside: '192.168.10.10', outside: '203.0.113.10'}]},
    dhcp: {pools: [{name: 'LAN', network: '192.168.10.0', mask: '255.255.255.0', gateway: '192.168.10.1', dns: '192.0.2.53', domain: 'lab.example'}], excluded: [{start: '192.168.10.1', end: '192.168.10.20'}]}};
  const result = succeeds(item(d, config), d); for (const command of ['ip access-list extended WEB', 'permit tcp any host 198.51.100.10 eq 443', 'ip nat inside source list NAT_INSIDE interface GigabitEthernet0/1 overload', 'ip dhcp pool LAN']) assert(result.text.includes(command));
  fails(item(d, {...config, nat: {...config.nat, pat: [...config.nat.pat, ...config.nat.pat]}}), d, /Duplicate PAT/);
  fails(item(d, {...config, nat: {...config.nat, static: [...config.nat.static, {inside: '192.168.10.11', outside: '203.0.113.10'}]}}), d, /addresses must be unique/);
  fails(item(d, {...config, dhcp: {pools: [{...config.dhcp.pools[0], gateway: '192.168.11.1'}]}}), d, /gateway.*pool network/);
  fails(item(d, {...config, acls: [{name: 'BAD', type: 'extended', entries: [{action: 'permit', protocol: 'ip', source: 'any', destination: 'any', destinationPort: 80}]}]}), d, /TCP\/UDP/);
});
check('ASA routed interfaces ACLs routes and object PAT use distinct ASA syntax', () => {
  const d = device('ASA5506-X'), asa = {interfaces: [{name: 'Gi1/1', nameif: 'inside', securityLevel: 100, address: '192.168.10.1', mask: '255.255.255.0', shutdown: false}, {name: 'Gi1/2', nameif: 'outside', securityLevel: 0, address: '203.0.113.1', mask: '255.255.255.0', shutdown: false}],
    routes: [{nameif: 'outside', network: '0.0.0.0', mask: '0.0.0.0', nextHop: '203.0.113.2'}], acls: [{name: 'OUTSIDE_IN', action: 'permit', protocol: 'tcp', source: 'any', destination: '192.168.10.10', destinationPort: 443}], bindings: [{acl: 'OUTSIDE_IN', direction: 'in', nameif: 'outside'}], objects: [{name: 'LAN', network: '192.168.10.0', mask: '255.255.255.0', inside: 'inside', outside: 'outside', dynamicInterface: true}]};
  const result = succeeds(item(d, {asa, interfacesConfirmed: true}), d); for (const command of ['nameif inside', 'security-level 100', 'route outside 0.0.0.0 0.0.0.0 203.0.113.2', 'access-group OUTSIDE_IN in interface outside', 'nat (inside,outside) dynamic interface']) assert(result.text.includes(command));
  assert(!result.text.includes('ip route ')); assert(!result.text.includes('ip nat inside'));
  assert.match(result.verificationText, /show interface ip brief/);
  for (const name of ['Serial0/0', 'Loopback1', 'Port-channel1']) fails(item(d, {asa: {...asa, interfaces: [{...asa.interfaces[0], name}]}, interfacesConfirmed: true}), d, /Ethernet-family/);
  fails(item(d, {asa: {...asa, interfaces: [asa.interfaces[0], {...asa.interfaces[1], address: '192.168.10.2'}]}, interfacesConfirmed: true}), d, /subnets cannot overlap/);
  const system = {users: [{name: 'admin', secret: 'Lab123', privilege: 1}]}; const userText = succeeds(item(d, {system}), d).text; assert.match(userText, /^username admin password Lab123$/m); assert(!userText.includes(' privilege '));
  fails(item(d, {system: {users: [{...system.users[0], privilege: 15}]}}), d, /ASA local users/);
});
check('ASA5505 separates switched physical ports from VLAN interfaces and respects feature gates', () => {
  const d = device('ASA5505'), config = {interfacesConfirmed: true, asa: {interfaces: [{name: 'Ethernet0/0', vlan: 10}, {name: 'Vlan10', nameif: 'inside', securityLevel: 100, address: '192.168.10.1', mask: '255.255.255.0'}]}};
  assert.match(succeeds(item(d, config), d).text, /interface Vlan10/);
  fails(item(d, {interfacesConfirmed: true, asa: {interfaces: [{name: 'Ethernet0/0', nameif: 'inside', address: '192.168.10.1', mask: '255.255.255.0'}]}}), d, /physical ports are switchports/);
  d.version_profiles['9'].features = [{slug: 'vlan', support_mode: 'unsupported', verification_status: 'Verified', major_version: 9}]; fails(item(d, config), d, /ASA.*unsupported/);
});
check('new typed inputs reject command injection and malformed objects without executing custom text', () => {
  const d = device('2911');
  for (const [key, value] of [['system', 'bad'], ['protocols', null], ['switching', []], ['dhcp', 'bad'], ['nat', true], ['asa', 'bad']]) fails(item(d, {[key]: value}), d, /must be an object/);
  for (const key of ['svis', 'acls', 'settings']) fails(item(d, {[key]: 'bad'}), d, /must be a list/);
  fails(item(d, {protocols: {ospf: {enabled: true, processId: '1\nend', networks: []}}}), d, /process ID/);
  fails(item(d, {dhcp: {pools: [{name: 'LAN\nend', network: '192.168.1.0', mask: '255.255.255.0', gateway: '192.168.1.1'}]}}), d, /pool name/);
  fails(item(d, {acls: [{name: 'ACL;reload', type: 'standard', entries: [{action: 'permit', source: 'any'}]}]}), d, /ACL name/);
  const asa = device('ASA5506-X'); fails(item(asa, {interfacesConfirmed: true, asa: {interfaces: [{name: 'Gi1/1', nameif: 'inside\nend', securityLevel: 100}]}}), asa, /nameif/);
});

check('empty production evidence blocks every CLI model and global family without exposing commands', () => {
  assert.equal(builder.templateRevision, '2.0.1');
  for (const d of catalogue.devices.filter(d => builder.describe(d).cli)) {
    for (const major of ['', '6', '7', '8', '9']) {
      const status = builder.verificationStatus(d, {major});
      assert.equal(status.status, 'Unknown'); assert.equal(status.observedRelease, null); assert.equal(status.recordCount, 0);
      assert.equal(status.scope, 'exact-tested-cases');
      const result = builder.generate(item(d), d, context(major));
      assert.equal(result.ok, false); assert.equal(result.text, ''); assert.equal(result.verificationText, '');
    }
  }
});
check('literal synthetic case verifies only its exact ordered commands and diagnostic sequence', () => {
  const d = device('2911'), entry = item(d), c = context(), record = syntheticRecord(d, '9', 'txt', [],
    [{rule_id: 'exec.enable', text: 'enable'}, {rule_id: 'exec.configure-terminal', text: 'configure terminal'}, {rule_id: 'global.hostname', text: 'hostname R1'}, {rule_id: 'exec.end', text: 'end'}],
    [{rule_id: 'show.running-config', text: 'show running-config'}, {rule_id: 'show.ios.interface-brief', text: 'show ip interface brief'}]);
  const api = loadEngine([record]), result = api.generate(entry, d, c), status = api.verificationStatus(d, c);
  assert.equal(status.status, 'Verified'); assert.match(status.reason, /changed commands/); assert.equal(status.recordCount, 1);
  assert.equal(result.ok, true); assert.equal(result.verification.recordId, 'TEST_ONLY_SYNTHETIC');
  assert.equal(result.verification.observedRelease, status.observedRelease);
  for (const modify of [row => row.commands.pop(), row => row.commands.reverse(), row => row.commands[2].rule_id = 'global.wrong-rule',
    row => row.commands[2].text = 'hostname R2', row => row.checks.pop(), row => row.checks[1].rule_id = 'show.wrong-rule']) {
    const changed = clone(record); modify(changed); const blocked = loadEngine([changed]).generate(entry, d, c);
    assert.equal(blocked.ok, false); assert.equal(blocked.text, ''); assert.equal(blocked.verificationText, '');
  }
});
check('tested model status does not approve new parameters formats modules majors or device models', () => {
  const d = device('2911'), entry = item(d, {interfaces: [routed()], interfacesConfirmed: true}), record = testedCase(entry, d), api = loadEngine([record]);
  assert.equal(api.verificationStatus(d, context()).status, 'Verified');
  const cases = [[{...entry, config: {...entry.config, hostname: 'R2'}}, d, context()],
    [{...entry, config: {...entry.config, interfaces: [{...routed(), address: '192.168.10.2'}]}}, d, context()],
    [{...entry, config: {...entry.config, interfaces: [{...routed(), shutdown: true}]}}, d, context()],
    [{...entry, modules: [{moduleId: 1, quantity: 1}]}, d, context()], [entry, d, context('9', 'cfg')], [entry, d, context('8')],
    [item(device('2901')), device('2901'), context()], [entry, d, context('')]];
  for (const [changed, model, target] of cases) {
    const result = api.generate(changed, model, target);
    assert.equal(result.ok, false); assert.equal(result.text, ''); assert.equal(result.verificationText, '');
  }
});
check('configuration-only CFG cases and previous template revisions cannot approve complete scripts', () => {
  const d = device('2911'), entry = item(d), c = context('9', 'cfg'), record = testedCase(entry, d, c);
  const withoutWrappers = clone(record);
  withoutWrappers.commands = withoutWrappers.commands.filter(row => !row.rule_id.startsWith('exec.'));
  const oldRevision = clone(record); oldRevision.template_revision = '2.0.0';
  for (const changed of [withoutWrappers, oldRevision]) {
    const result = loadEngine([changed]).generate(entry, d, c);
    assert.equal(result.ok, false); assert.equal(result.text, ''); assert.equal(result.verificationText, '');
  }
});
check('documentation URLs catalogue flags and incomplete runtime metadata cannot promote verification', () => {
  const d = device('2911'), entry = item(d), record = testedCase(entry, d);
  const modifications = [row => row.template_revision = '1.0.0', row => row.model = {toString: null}, row => row.observed_release = '8.2.2', row => row.evidence.method = 'documentation',
    row => row.evidence.transcript_path = 'https://tutorials.ptnetacad.net/help/default/CLI_routerIOS15.htm', row => row.evidence.transcript_sha256 = '',
    row => row.evidence.error_count = 1, row => row.evidence.checked_date = '2026-02-31', row => row.evidence.running_config_assertions = [],
    row => row.evidence.diagnostic_assertions = [], row => row.prerequisites = [], row => row.prerequisites = [' untrimmed '], row => row.commands[0].result = 'unknown', row => row.commands[0].text += '\nreload'];
  for (const modify of modifications) {
    const changed = clone(record); modify(changed); const api = loadEngine([changed]);
    assert.equal(api.verificationStatus(d, context()).status, 'Unknown'); assert.equal(api.generate(entry, d, context()).ok, false);
  }
  d.version_profiles['9'].availability.verification_status = 'Verified';
  d.version_profiles['9'].features = [{slug: 'ssh', verification_status: 'Verified', support_mode: 'native'}];
  assert.equal(builder.verificationStatus(d, context()).status, 'Unknown');
});
check('conflicting exact releases fail closed rather than silently choosing a global-family release', () => {
  const d = device('2911'), entry = item(d), first = testedCase(entry, d), second = clone(first);
  second.id = 'TEST_ONLY_OTHER_RELEASE'; second.observed_release = '9.0.2';
  const api = loadEngine([first, second]), status = api.verificationStatus(d, context());
  assert.equal(status.status, 'Unknown'); assert.equal(status.observedRelease, null); assert.match(status.reason, /Conflicting/);
  assert.equal(api.generate(entry, d, context()).ok, false);
  second.model = '2901';
  const crossModel = loadEngine([first, second]);
  assert.equal(crossModel.verificationStatus(d, context()).status, 'Unknown');
  assert.equal(crossModel.generate(entry, d, context()).ok, false);
});
check('manifest changes after initialization cannot mutate the trusted evidence snapshot', () => {
  const d = device('2911'), entry = item(d), record = testedCase(entry, d), browser = {window: {PT_COMMAND_VERIFICATION: {schema_version: 1, records: [record]}}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/vendor/ipaddr.js'), 'utf8'), browser);
  vm.runInNewContext(engineSource, browser); browser.window.PT_COMMAND_VERIFICATION.records[0].commands[2].text = 'hostname R2';
  assert.equal(browser.window.PTConfigBuilder.generate(entry, d, context()).ok, true);
});
check('missing browser runtime-evidence dependency fails closed without breaking manual worksheets', () => {
  const browser = {window: {}};
  vm.runInNewContext(engineSource, browser);
  const api = browser.window.PTConfigBuilder, router = device('2911'), ap = device('AccessPoint-PT');
  assert.equal(api.generate(item(router), router, context()).ok, false);
  assert.equal(api.verificationStatus(router, context()).status, 'Unknown');
  const worksheet = api.generate(item(ap), ap, context(''));
  assert.equal(worksheet.ok, true); assert.equal(worksheet.outputKind, 'worksheet'); assert.match(worksheet.text, /Not executable CLI/);
});
check('ASA physical names follow the documented model-specific CLI interface ranges', () => {
  for (const [model, names] of [['ASA5505', ['Ethernet0/8', 'Ethernet1/0', 'FastEthernet0/1', 'GigabitEthernet1/1']], ['ASA5506-X', ['Gi0/1', 'Gi1/0', 'Gi1/9', 'Ethernet0/1']], ['ISA3000', ['Gi0/1', 'Gi1/9', 'FastEthernet0/1']]]) {
    const d = device(model);
    for (const name of names) fails(item(d, {interfacesConfirmed: true, asa: {interfaces: [{name}]}}), d, /ASA model requires/);
  }
});
check('numeric IOS ACL identities respect documented ranges without restricting nonnumeric names', () => {
  const d = device('2911'), acl = (name, type) => ({name, type, entries: [{action: 'permit', source: 'any', destination: 'any', protocol: 'ip'}]});
  for (const [type, names] of [['standard', ['0', '100', '199', '1300', '999999999999999999999']], ['extended', ['0', '1', '99', '200', '2700']]]) {
    for (const name of names) fails(item(d, {acls: [acl(name, type)]}), d, /Numeric IOS ACL/);
  }
  for (const [name, type] of [['1', 'standard'], ['99', 'standard'], ['100', 'extended'], ['199', 'extended'], ['101_Users', 'standard'], ['Users.1', 'extended']]) succeeds(item(d, {acls: [acl(name, type)]}), d);
  fails(item(d, {acls: [acl('1', 'standard'), acl('001', 'standard')]}), d, /numeric aliases/);
});

console.log(passed + ' configuration-builder checks passed.');
