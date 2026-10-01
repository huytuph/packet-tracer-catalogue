#!/usr/bin/env python3
"""Regression tests for major-version evidence and isolated browser profiles."""
from __future__ import annotations

import json
import runpy
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = runpy.run_path(str(ROOT / 'tools' / 'init_database.py'))
EXPORT = runpy.run_path(str(ROOT / 'tools' / 'export_browser_data.py'))


class EvidenceFile:
    def __init__(self, evidence):
        self.evidence = evidence

    def read_text(self, encoding):
        return json.dumps(self.evidence)


def evidence_fixture():
    sources = []
    for key, url in (
        ('existing', SEED['SOURCES'][0][3]),
        ('new-z', 'https://example.org/z'),
        ('new-a', 'https://example.org/a'),
        ('duplicate-a', 'https://example.org/a'),
    ):
        sources.append({'key': key, 'url': url, 'title': key, 'publisher': 'Test evidence',
                        'source_type': 'Version documentation', 'publication_date': None,
                        'source_tier': 4, 'notes': None})
    devices = []
    for device in SEED['DEVICES']:
        versions = {}
        for major, available in (('6', False), ('7', None), ('8', True), ('9', None)):
            versions[major] = {
                'available': available,
                'verification_status': 'Unknown' if available is None else 'Partial',
                'source_key': None if available is None else 'existing',
                'observed_release': None if available is None else f'{major}.x',
                'evidence_kind': 'unverified' if available is None else 'documentation',
                'notes': 'Synthetic test evidence.',
            }
        devices.append({'pt_name': device[0], 'versions': versions})
    return {'sources': sources, 'devices': devices}


class VersionEvidenceTests(unittest.TestCase):
    def test_complete_matrix_retains_false_and_unknown(self):
        _, _, records = SEED['load_version_evidence'](EvidenceFile(evidence_fixture()))
        self.assertEqual(len(records), 34)
        self.assertIs(records['1841']['6']['available'], False)
        self.assertIsNone(records['1841']['7']['available'])
        self.assertIs(records['1841']['8']['available'], True)

    def test_sources_deduplicate_and_keep_stable_ids(self):
        evidence = evidence_fixture()
        sources, ids, _ = SEED['load_version_evidence'](EvidenceFile(evidence))
        self.assertEqual(len(sources), 2)
        self.assertEqual(ids['existing'], 1)
        self.assertEqual(ids['new-a'], 26)
        self.assertEqual(ids['duplicate-a'], 26)
        self.assertEqual(ids['new-z'], 27)
        evidence['sources'].reverse()
        self.assertEqual(SEED['load_version_evidence'](EvidenceFile(evidence))[:2], (sources, ids))

    def test_incomplete_matrix_is_rejected(self):
        evidence = evidence_fixture()
        del evidence['devices'][0]['versions']['6']
        with self.assertRaisesRegex(ValueError, 'must cover families'):
            SEED['load_version_evidence'](EvidenceFile(evidence))
        evidence = evidence_fixture()
        evidence['devices'].pop()
        with self.assertRaisesRegex(ValueError, 'Missing version-evidence devices'):
            SEED['load_version_evidence'](EvidenceFile(evidence))

    def test_known_facts_require_sources_and_inference_stays_partial(self):
        evidence = evidence_fixture()
        evidence['devices'][0]['versions']['6']['source_key'] = None
        with self.assertRaisesRegex(ValueError, 'requires attributable evidence'):
            SEED['load_version_evidence'](EvidenceFile(evidence))
        evidence = evidence_fixture()
        record = evidence['devices'][0]['versions']['8']
        record.update(evidence_kind='inference', verification_status='Verified')
        with self.assertRaisesRegex(ValueError, 'cannot be marked Verified'):
            SEED['load_version_evidence'](EvidenceFile(evidence))

    def test_numeric_booleans_and_unknown_as_absent_are_rejected(self):
        evidence = evidence_fixture()
        evidence['devices'][0]['versions']['6']['available'] = 0
        with self.assertRaisesRegex(ValueError, 'true, false or null'):
            SEED['load_version_evidence'](EvidenceFile(evidence))
        evidence = evidence_fixture()
        evidence['devices'][0]['versions']['7']['verification_status'] = 'Partial'
        with self.assertRaisesRegex(ValueError, 'unknown availability must be marked Unknown'):
            SEED['load_version_evidence'](EvidenceFile(evidence))


class VersionProfileTests(unittest.TestCase):
    def setUp(self):
        self.device = {
            'versions': [{'major_version': major, 'is_family': True, 'available': available}
                         for major, available in ((6, False), (7, None), (8, True), (9, True))],
            'interfaces': [
                {'slug': 'gigabitethernet', 'quantity': 1, 'major_version': None, 'verification_status': 'Partial'},
                {'slug': 'fastethernet', 'quantity': 2, 'major_version': 8, 'verification_status': 'Partial'},
                {'slug': 'serial', 'quantity': 4, 'major_version': 9, 'verification_status': 'Verified'},
            ],
            'features': [{'slug': 'nat', 'major_version': 8}, {'slug': 'hsrp', 'major_version': 9}],
            'modules': [
                {'model': 'HWIC-2T', 'major_version': 8, 'max_quantity': 2,
                 'interfaces': [{'slug': 'serial', 'quantity': 2}]},
                {'model': 'NIM-2T', 'major_version': 9, 'max_quantity': 1,
                 'interfaces': [{'slug': 'serial', 'quantity': 2}]},
            ],
            'limitations': [{'title': 'PT 7 observation', 'major_version': 7}],
        }

    def test_major_versions_do_not_inherit_specific_evidence(self):
        six = EXPORT['version_profile'](self.device, 6)
        self.assertEqual(six['port_totals'], {'gigabitethernet': 1})
        self.assertEqual(six['features'], [])
        self.assertEqual(six['modules'], [])
        self.assertEqual(six['limitations'], [])
        self.assertEqual(six['max_module_total_ports'], 0)
        self.assertEqual(six['interface_verification_status'], 'Partial')
        eight = EXPORT['version_profile'](self.device, 8)
        self.assertEqual(eight['port_totals'], {'gigabitethernet': 1, 'fastethernet': 2})
        self.assertEqual(set(eight['feature_map']), {'nat'})
        self.assertEqual([row['model'] for row in eight['modules']], ['HWIC-2T'])
        self.assertEqual(eight['max_module_port_additions'], {'serial': 4})
        nine = EXPORT['version_profile'](self.device, 9)
        self.assertEqual(nine['port_totals'], {'gigabitethernet': 1, 'serial': 4})
        self.assertEqual(set(nine['feature_map']), {'hsrp'})
        self.assertEqual(nine['max_module_port_additions'], {'serial': 2})

    def test_missing_availability_is_unknown(self):
        self.device['versions'] = []
        profile = EXPORT['version_profile'](self.device, 7)
        self.assertIsNone(profile['availability']['available'])
        self.assertEqual(profile['availability']['verification_status'], 'Unknown')
        self.assertEqual(profile['availability']['evidence_kind'], 'unverified')

    def test_interface_certainty_respects_partial_and_missing_evidence(self):
        self.device['interfaces'] = []
        profile = EXPORT['version_profile'](self.device, 6)
        self.assertEqual(profile['interface_verification_status'], 'Unknown')
        self.device['interfaces'] = [{'slug': 'serial', 'quantity': 2, 'major_version': 9,
                                     'verification_status': 'Verified'}]
        profile = EXPORT['version_profile'](self.device, 9)
        self.assertEqual(profile['interface_verification_status'], 'Verified')
        self.device['interfaces'].append({'slug': 'gigabitethernet', 'quantity': 1, 'major_version': None,
                                          'verification_status': 'Partial'})
        profile = EXPORT['version_profile'](self.device, 9)
        self.assertEqual(profile['interface_verification_status'], 'Partial')


class IndustrialRouterTests(unittest.TestCase):
    def test_ir1101_counts_combo_once_and_retains_two_cellular_slots(self):
        rows = SEED['DEVICE_INTERFACES']['IR1101']
        counts = {slug: sum(row[1] for row in rows if row[0] == slug) for slug in {row[0] for row in rows}}
        self.assertEqual(counts, {'fastethernet': 4, 'gigabitethernet': 1})
        self.assertEqual(sum(counts.values()), 5)
        self.assertEqual({row[0]: row[1] for row in SEED['DEVICE_SLOTS']['IR1101']}, {'pim': 2})

    def test_ir8340_retains_dedicated_fiber_and_both_slot_types(self):
        rows = SEED['DEVICE_INTERFACES']['IR8340']
        counts = {slug: sum(row[1] for row in rows if row[0] == slug) for slug in {row[0] for row in rows}}
        self.assertEqual(counts, {'gigabitethernet': 10, 'gigabit_sfp': 4})
        self.assertEqual(sum(counts.values()), 14)
        self.assertEqual({row[0]: row[1] for row in SEED['DEVICE_SLOTS']['IR8340']}, {'nim': 2, 'pim': 2})

    def test_corrected_interfaces_and_slots_cite_official_help(self):
        for pt in ('IR1101', 'IR8340'):
            self.assertTrue(all(row[-1] == 'pt9_routers_official' for row in SEED['DEVICE_INTERFACES'][pt]))
            self.assertTrue(all(row[-1] == 'pt9_routers_official' for row in SEED['DEVICE_SLOTS'][pt]))

    def test_pt8200_alias_maps_to_catalogue_c8200(self):
        self.assertIn('PT8200', SEED['ALIASES']['C8200'])


if __name__ == '__main__':
    unittest.main()
