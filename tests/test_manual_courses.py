import json
import threading
import unittest
from urllib.request import Request, urlopen
from copy import deepcopy

import web_server as web
from src.bitmasks import SLOTS


def raw_course(identifier='001', day=1):
    return dict(course_id=identifier, name='קורס ידני', credits=3.5, components=[
        dict(component_type='lecture', groups=[dict(group_id='01', lecturer='דנה לוי',
             priority='medium', full=False, sessions=[dict(day=day, start='08:30', end='09:30', mandatory=True)])])])


class ManualCourses(unittest.TestCase):
    def save(self, payload):
        data = web.save_manual_course(json.dumps(payload).encode())
        self.addCleanup(lambda: web.DATASETS.pop(data['id'], None))
        return data

    def test_append_is_immutable_and_combined_dataset_optimizes(self):
        source = self.save(raw_course())
        payload = dict(**raw_course('002', 3), dataset_id=source['id'], dataset_revision=source['revision'])
        added = self.save(payload)
        self.assertNotEqual(added['id'], source['id'])
        self.assertNotEqual(added['revision'], source['revision'])
        self.assertEqual([c.course_id for c in web.get_dataset(source['id'])], ['001'])
        self.assertEqual(added['details'][0], source['details'][0])
        self.assertEqual([c['id'] for c in added['courses']], ['001', '002'])
        result = web.optimize_payload(dict(dataset_id=added['id'], dataset_revision=added['revision'],
            course_ids=['001','002'], preferences=dict(preferred_start=510, study_days_weight=100,
                gaps_weight=70, start_time_weight=40, priority_weight=60, daily_span_weight=50)))
        self.assertEqual(result['total'], 1)
        self.assertEqual({s['course_id'] for s in result['schedules'][0]['sessions']}, {'001','002'})

    def test_duplicate_stale_invalid_or_expired_source_never_creates_partial_dataset(self):
        source = self.save(raw_course())
        payload = dict(**raw_course('002'), dataset_id=source['id'], dataset_revision=source['revision'])
        before = set(web.DATASETS)
        for overrides in ({'course_id':'001'}, {'dataset_revision':'old'}, {'dataset_id':[]}, {'dataset_id':'missing'}):
            with self.subTest(overrides=overrides), self.assertRaises(web.InputError):
                self.save({**payload, **overrides})
            self.assertEqual(set(web.DATASETS), before)
        invalid = deepcopy(payload)
        invalid['components'][0]['groups'][0]['sessions'][0]['end'] = '08:00'
        with self.assertRaises(web.InputError):
            self.save(invalid)
        self.assertEqual(set(web.DATASETS), before)

    def test_append_enforces_combined_dataset_limit(self):
        source = web.save_dataset([web.parse_course(raw_course(str(i))) for i in range(40)])
        self.addCleanup(lambda: web.DATASETS.pop(source['id'], None))
        with self.assertRaisesRegex(web.InputError, '40'):
            self.save(dict(**raw_course('extra'), dataset_id=source['id'], dataset_revision=source['revision']))
        self.assertEqual(len(web.get_dataset(source['id'])), 40)

    def test_http_uses_engine_slots_and_appends_to_sample_without_modifying_it(self):
        server = web.ThreadingHTTPServer(('127.0.0.1', 0), web.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(base + '/api/course-options') as response:
                self.assertEqual(json.load(response)['slots'], [list(slot) for slot in SLOTS])
            sample = web.dataset_response(web.get_dataset('sample'), 'sample')
            payload = dict(**raw_course('00001'), dataset_id='sample', dataset_revision=sample['revision'])
            with urlopen(Request(base + '/api/courses/manual', data=json.dumps(payload).encode(),
                                headers={'Content-Type':'application/json'})) as response:
                added = json.load(response)
            self.addCleanup(lambda: web.DATASETS.pop(added['id'], None))
            self.assertEqual(len(added['courses']), len(sample['courses']) + 1)
            self.assertEqual(web.dataset_response(web.get_dataset('sample'), 'sample'), sample)
        finally:
            server.shutdown(); server.server_close(); thread.join()
