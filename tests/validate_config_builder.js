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
let passed = 0;

function check(name, test) {
  test(); passed++;
  console.log('PASS ' + name);
}
function context(major = '9', format = 'txt') {
  return {major, release: {'6': '6.3', '7': '7.3.1', '8': '8.2.2', '9': '9.0.1'}[major], format};
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
  const result = builder.generate(entry, d, c);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert(result.warnings.some(warning => /untested/i.test(warning)));
  assert.match(result.text, /! Untested/);
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
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/config-builder.js'), 'utf8'), browser);
  assert.deepEqual(Object.keys(browser.window.PTConfigBuilder), Object.keys(builder));
  assert(Object.isFrozen(builder));
});
check('allowlist includes twelve actual classic IOS models and excludes generic, industrial, GUI and ASA devices', () => {
  const expected = ['1841', '2811', '1941', '2901', '2911', 'ISR4321', 'ISR4331', '2950-24', '2950T-24', '2960-24TT', '3560-24PS', '3650-24PS'];
  assert.deepEqual(catalogue.devices.filter(builder.supportsDevice).map(row => row.pt_name).sort(), expected.sort());
  for (const name of ['C8200', 'IR1101', 'IR8340', 'ASA5505', 'ASA5506-X', 'IE-3400', 'Router-PT', 'Switch-PT', 'HomeRouter']) {
    const d = device(name); fails(item(d), d, /allowlist/);
  }
  assert.equal(builder.supportsDevice(null), false);
});
check('default configurations contain no guessed ports and do not share mutable arrays', () => {
  const d = device('2911'), first = builder.createConfig(d, 2), second = builder.createConfig(d, 2);
  assert.equal(first.hostname, 'R2'); assert.equal(builder.createConfig(device('2960-24TT')).hostname, 'SW1');
  assert.deepEqual(first.interfaces, []); assert.equal(first.interfacesConfirmed, false);
  first.interfaces.push(routed()); assert.deepEqual(second.interfaces, []);
});
check('valid router templates generate for each 6/7/8/9 family without mutating inputs', () => {
  for (const major of ['6', '7', '8', '9']) {
    const d = device('2911'), entry = item(d, {interfaces: [routed()], interfacesConfirmed: true,
      routes: [{network: '0.0.0.0', mask: '0.0.0.0', nextHop: '192.168.10.2'}]});
    const before = JSON.stringify({d, entry});
    const result = succeeds(entry, d, context(major));
    assert.match(result.text, /ip route 0\.0\.0\.0 0\.0\.0\.0 192\.168\.10\.2/);
    assert.equal(JSON.stringify({d, entry}), before);
  }
});
check('major selection and matching exact numeric release are mandatory', () => {
  const d = device('1841'), entry = item(d);
  for (const c of [{major: '', release: '9.0.1', format: 'txt'}, {major: 9, release: '9.0.1', format: 'txt'}, {major: '9', release: '9.x', format: 'txt'},
    {major: '9', release: '8.2.2', format: 'txt'}, {major: '9', release: '9.0.1\nreload', format: 'txt'},
    {major: '9', release: '9.0.1\n', format: 'txt'}]) fails(entry, d, /major|release/, c);
  fails(entry, d, /output/, {...context(), format: 'zip'});
  fails({...entry, deviceId: 12345}, d, /device ID/);
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
  for (const name of ['FastEthernet0/1\nend', 'FastEthernet0/1\n', 'range FastEthernet0/1-24', 'Gi0/0.10', 'GigabitEthernet0/9999', 'Fa0/1;reload']) fails(item(d, {...base, interfaces: [{...access(), name}]}), d, /concrete/);
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
check('txt command mode and cfg configuration-only outputs never save reload or erase', () => {
  const d = device('2960-24TT'), entry = item(d, {interfaces: [access()], interfacesConfirmed: true, vlans: [{id: 10, name: 'Users'}]});
  const txt = succeeds(entry, d), cfg = succeeds(entry, d, context('9', 'cfg'));
  assert.match(txt.text, /^enable$/m); assert.match(txt.text, /^configure terminal$/m); assert.match(txt.text, /^end$/m);
  assert(!/^enable$|^configure terminal$|^end$/m.test(cfg.text));
  assert.equal(txt.filename, 'SW1.txt'); assert.equal(cfg.filename, 'SW1.cfg');
  for (const result of [txt, cfg]) {
    assert(!/^\s*(?:write|copy|reload|erase|delete)\b/m.test(result.text));
    assert(!result.text.includes('show running-config')); assert.match(result.verificationText, /show running-config/);
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

console.log(passed + ' configuration-builder checks passed.');
