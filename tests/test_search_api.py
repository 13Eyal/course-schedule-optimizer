import json
import threading
from time import monotonic, sleep
import unittest
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import web_server as web
from src.course_parser import parse_course
from src.optimization_service import parse_constraints, parse_limits
from src.models import Course, CourseComponent, ComponentType, Group, Session, Day, PriorityType


PREFS = dict(preferred_start=510, study_days_weight=100, gaps_weight=70,
             start_time_weight=40, priority_weight=60, daily_span_weight=50)


class SearchAPI(unittest.TestCase):
    def test_stale_dataset_revision_is_rejected_before_applying_attendance_decisions(self):
        with self.assertRaises(web.InputError):
            web.optimize_payload(dict(dataset_id='sample', dataset_revision='old',
                                      course_ids=['ALG101'], preferences=PREFS))

    def test_unknown_links_and_unapproved_replacements_are_rejected(self):
        courses = web.get_dataset('sample')
        payload = dict(dataset_id='sample', course_ids=[c.course_id for c in courses], preferences=PREFS)
        with self.assertRaises(web.InputError):
            web.optimize_payload(payload)
        with self.assertRaises(ValueError):
            parse_constraints({'replacements': [{'source': 'a', 'target': 'b'}]}, set())
        for limits in ({'seconds': True}, {'top_k': 0}, {'nodes': 999999999}, {'exact_count': 'yes'}):
            with self.assertRaises(ValueError):
                parse_limits(limits)
        for blocked in ({'day': 1, 'start': 600, 'end': 500}, {'day': 6, 'start': 500, 'end': 600}):
            with self.assertRaises(ValueError):
                parse_constraints({'blocked': [blocked]}, set())

    def test_manual_course_links_and_full_group_fields(self):
        raw = dict(course_id='001', name='Test', credits=3, components=[dict(component_type=kind,
            groups=[dict(group_id='01', lecturer='A', priority='high', full=True,
                sessions=[dict(day=1, start='08:30', end='09:30', mandatory=False, part='one')])])
            for kind in ('lecture', 'tutorial')], allowed_combinations=[dict(lecture='01', tutorial='01')])
        parsed = parse_course(raw)
        self.assertEqual(parsed.course_id, '001')
        self.assertTrue(parsed.components[ComponentType.LECTURE].groups[0].full)
        self.assertEqual(parsed.allowed_combinations, ((('lecture','01'), ('tutorial','01')),))
        raw['allowed_combinations'][0]['lecture'] = 'missing'
        with self.assertRaises(ValueError):
            parse_course(raw)

    def test_async_completion_progress_cancel_and_slot_release(self):
        # Many distinct registrations with identical times: exact enumeration is deliberately large.
        courses = [Course(str(c), str(c), 3, {ComponentType.LECTURE: CourseComponent(ComponentType.LECTURE,
            [Group(str(g), 'A', PriorityType.HIGH, [Session(Day(c + 1), 510, 570, True)]) for g in range(18)])})
            for c in range(5)]
        dataset = web.save_dataset(courses)
        payload = dict(dataset_id=dataset['id'], course_ids=[c.course_id for c in courses], preferences=PREFS,
                       limits={'exact_count': True, 'seconds': 30})
        server = web.ThreadingHTTPServer(('127.0.0.1', 0), web.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        def post(path, value):
            with urlopen(Request(base + path, data=json.dumps(value).encode(), headers={'Content-Type':'application/json'})) as response:
                return json.load(response)
        def poll(identifier):
            with urlopen(base + '/api/jobs/' + identifier) as response:
                return json.load(response)
        try:
            job = post('/api/jobs', payload)
            deadline = monotonic() + 5
            snapshot = poll(job['id'])
            while monotonic() < deadline and not snapshot.get('result', {}).get('schedules'):
                sleep(0.05)
                snapshot = poll(job['id'])
            self.assertEqual(snapshot['state'], 'running')
            self.assertTrue(snapshot['result']['schedules'])
            self.assertFalse(snapshot['result']['optimal'])
            with self.assertRaises(HTTPError) as busy:
                post('/api/jobs', payload)
            self.assertEqual(busy.exception.code, 503)
            busy.exception.close()
            post('/api/jobs/' + job['id'] + '/cancel', {})
            while monotonic() < deadline and snapshot['state'] == 'running':
                sleep(0.02)
                snapshot = poll(job['id'])
            self.assertEqual(snapshot['result']['status'], 'cancelled')
            self.assertTrue(snapshot['result']['schedules'])
            self.assertFalse(snapshot['result']['total_exact'])
            payload['course_ids'] = ['0']
            next_job = post('/api/jobs', payload)
            snapshot = poll(next_job['id'])
            while snapshot['state'] == 'running' and monotonic() < deadline:
                sleep(0.02)
                snapshot = poll(next_job['id'])
            self.assertEqual(snapshot['state'], 'finished')
            self.assertEqual(snapshot['result']['total'], 18)
            self.assertTrue(snapshot['result']['optimal'])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
            with web.DATA_LOCK:
                web.DATASETS.pop(dataset['id'], None)

    def test_job_failure_releases_capacity(self):
        courses = web.get_dataset('sample')
        bad = dict(dataset_id='sample', course_ids=[c.course_id for c in courses], preferences=PREFS)
        job = web.start_job(bad)
        deadline = monotonic() + 2
        while monotonic() < deadline:
            snapshot = web.job_snapshot(job['id'])
            if snapshot['state'] == 'failed':
                break
            sleep(0.01)
        self.assertEqual(snapshot['state'], 'failed')
        self.assertTrue(snapshot['error'])
        self.assertTrue(web.SOLVE_LOCK.acquire(blocking=False))
        web.SOLVE_LOCK.release()
