import json
from copy import deepcopy
from pathlib import Path
from html.parser import HTMLParser
import re
import threading
import unittest
from urllib.request import Request, urlopen, url2pathname
from urllib.parse import urljoin, urlsplit
from urllib.error import HTTPError
from unittest.mock import patch

import web_server as web
from src.models import Course, CourseComponent, ComponentType, Group, Session, Day, PriorityType
from src.solver import generate_schedules
from src.scoring import evaluate_schedules

PREFS = dict(preferred_start=510, study_days_weight=100, gaps_weight=70,
             start_time_weight=40, priority_weight=60, daily_span_weight=50)


class WebIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.courses = web.get_dataset("sample")
        self.payload = dict(dataset_id="sample", course_ids=[c.course_id for c in self.courses], preferences=PREFS)
        self.payload['constraints'] = {'independent_courses': self.payload['course_ids']}
        self.payload['limits'] = {'exact_count': True}

    def test_matches_existing_engine_and_preserves_metadata(self):
        result = web.optimize_payload(self.payload)
        expected = evaluate_schedules(generate_schedules(self.courses), web.parse_preferences(PREFS))
        self.assertEqual(result["total"], len(expected))
        self.assertAlmostEqual(result["schedules"][0]["score"], expected[0].score)
        self.assertEqual(result["schedules"][0]["metrics"]["total_gaps"], expected[0].metrics.total_gaps)
        self.assertTrue(all(s["name"] and s["type"] and s["group_id"] for s in result["schedules"][0]["sessions"]))
        self.assertEqual(set(s["course_id"] for s in result["schedules"][0]["sessions"]), set(self.payload["course_ids"]))

    def test_selection_and_bad_inputs(self):
        self.payload["course_ids"] = [self.courses[0].course_id]
        self.payload['constraints'] = {'independent_courses': self.payload['course_ids']}
        result = web.optimize_payload(self.payload)
        self.assertEqual({s["course_id"] for s in result["schedules"][0]["sessions"]}, set(self.payload["course_ids"]))
        for ids in ([], ["missing"], [1]):
            with self.subTest(ids=ids), self.assertRaises(web.InputError):
                web.optimize_payload({**self.payload, "course_ids": ids})
        for value in (-1, 101, True, "40"):
            with self.subTest(value=value), self.assertRaises(web.InputError):
                web.parse_preferences({**PREFS, "gaps_weight": value})
        with self.assertRaises(web.InputError):
            web.parse_preferences({**PREFS, **dict.fromkeys(web.WEIGHT_NAMES, 0)})

    def test_no_solution_is_normal_empty_response(self):
        courses = []
        for i in range(2):
            group = Group("same-id", "Lecturer", PriorityType.HIGH, [Session(Day.SUNDAY, 540, 600, True)])
            courses.append(Course(str(i), str(i), 3, {ComponentType.LECTURE: CourseComponent(ComponentType.LECTURE, [group])}))
        with patch.object(web, "get_dataset", return_value=courses):
            result = web.optimize_payload({**self.payload, "course_ids": ["0", "1"], "constraints": {}})
        self.assertEqual(result['total'], 0)
        self.assertEqual(result['schedules'], [])
        self.assertTrue(result['optimal'])
        self.assertTrue(result['diagnostics'])

    def test_upload_roundtrip_and_invalid_excel(self):
        courses = web.read_workbook((web.ROOT / "data/courses_sample.xlsx").read_bytes())
        saved = web.save_dataset(courses)
        self.assertEqual(len(web.get_dataset(saved["id"])), len(self.courses))
        with self.assertRaises(web.InputError):
            web.read_workbook(b"not excel")

    def test_http_routes_and_validation(self):
        server = web.ThreadingHTTPServer(("127.0.0.1", 0), web.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        try:
            with urlopen(base + "/") as response:
                page = response.read()
                self.assertEqual(response.url, base + "/web/index.html")
                self.assertIn(b'lang="he"', page)
                self.assertIn(b'data-design="cobalt"', page)
                self.assertIn("text/html", response.headers["Content-Type"])
            with urlopen(base + "/api/health") as response:
                self.assertEqual(json.load(response), {"app": "carpedio-schedule-optimizer", "project_id": web.PROJECT_ID})
            with urlopen(base + "/api/sample") as response:
                self.assertEqual(json.load(response)["id"], "sample")
            for path, (_, mime) in web.STATIC_FILES.items():
                with urlopen(base + path) as response:
                    self.assertIn(mime, response.headers["Content-Type"])
                    self.assertTrue(response.read())
            # Old bookmarks cannot bring back a removed design.
            with urlopen(base + "/?design=oak") as response:
                self.assertEqual(response.url, base + "/web/index.html?design=oak")
                self.assertIn(b'data-design="cobalt"', response.read())
            # Removed interfaces and design assets must remain unavailable.
            for path in ("/en", "/carpedio_english.js", "/assets/design/Melamine-wood-001.png"):
                with self.assertRaises(HTTPError) as failure:
                    urlopen(base + path)
                self.assertEqual(failure.exception.code, 404)
            request = Request(base + "/api/optimize", data=json.dumps(self.payload).encode(), headers={"Content-Type": "application/json"})
            with urlopen(request) as response:
                self.assertGreater(json.load(response)["total"], 0)
            with self.assertRaises(HTTPError) as failure:
                urlopen(base + "/web_server.py")
            self.assertEqual(failure.exception.code, 404)
            with self.assertRaises(HTTPError) as failure:
                urlopen(Request(base + "/api/optimize", data=b"{}", headers={"Origin": "https://example.org"}))
            self.assertEqual(failure.exception.code, 403)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_html_and_css_assets_resolve_from_disk_and_http(self):
        class AssetParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.paths = []

            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == "link" and attrs.get("rel") in ("stylesheet", "icon"):
                    self.paths.append(attrs["href"])
                elif tag == "img":
                    self.paths.append(attrs["src"])

        page = web.ROOT / "web/index.html"
        parser = AssetParser()
        parser.feed(page.read_text(encoding="utf-8"))
        assets = [(page, asset) for asset in parser.paths]
        for css in (web.ROOT / "web/styles").glob("*.css"):
            assets.extend((css, match.group(1)) for match in re.finditer(r"url\(['\"]?([^'\")]+)['\"]?\)", css.read_text(encoding="utf-8")))
        self.assertGreater(len(assets), 5)
        for source, asset in assets:
            if urlsplit(asset).scheme:
                continue
            with self.subTest(source=source.name, asset=asset):
                file_url = urljoin(source.as_uri(), asset)
                self.assertTrue(Path(url2pathname(urlsplit(file_url).path)).is_file(), file_url)
                http_url = urljoin("http://127.0.0.1/" + source.relative_to(web.ROOT).as_posix(), asset)
                self.assertIn(urlsplit(http_url).path, web.STATIC_FILES)

    def test_manual_course_http_roundtrip_and_invalid_inputs(self):
        raw = {
            "course_id": "0368", "name": "מבוא למדעי המחשב", "credits": 4,
            "components": [{
                "component_type": "lecture",
                "groups": [{
                    "group_id": "01", "lecturer": "דנה לוי", "priority": "medium",
                    "sessions": [{"day": 1, "start": "08:30", "end": "10:00", "mandatory": True}],
                }],
            }],
        }
        server = web.ThreadingHTTPServer(("127.0.0.1", 0), web.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        saved_id = None

        def post(path, body):
            return urlopen(Request(base + path, data=body, headers={"Content-Type": "application/json"}))

        try:
            with post("/api/courses/manual", json.dumps(raw).encode()) as response:
                self.assertEqual(response.status, 200)
                saved = json.load(response)
            saved_id = saved["id"]
            self.assertEqual(saved["courses"], [{
                "id": "0368", "name": raw["name"], "credits": 4.0, "components": 1,
            }])
            # The returned dataset must work with the existing optimization endpoint.
            payload = {"dataset_id": saved_id, "course_ids": ["0368"], "preferences": PREFS}
            with post("/api/optimize", json.dumps(payload).encode()) as response:
                result = json.load(response)
            self.assertEqual(result["total"], 1)
            session = result["schedules"][0]["sessions"][0]
            self.assertEqual((session["course_id"], session["group_id"], session["start"], session["end"]),
                             ("0368", "01", 510, 600))

            bad_time = deepcopy(raw)
            bad_time["components"][0]["groups"][0]["sessions"][0]["end"] = "08:00"
            bad_session = deepcopy(raw)
            bad_session["components"][0]["groups"][0]["sessions"] = [None]
            duplicate = deepcopy(raw)
            duplicate["components"].append(deepcopy(duplicate["components"][0]))
            invalid = [
                (b"{", "JSON"),
                (b"null", "must be an object"),
                (b"{}", "missing field"),
                (json.dumps({**raw, "components": []}).encode(), "components"),
                (json.dumps(bad_time).encode(), "start time must be before"),
                (json.dumps(bad_session).encode(), "must be an object"),
                (json.dumps(duplicate).encode(), "duplicate component_type"),
            ]
            for body, message in invalid:
                with self.subTest(body=body):
                    with self.assertRaises(HTTPError) as failure:
                        post("/api/courses/manual", body)
                    self.assertEqual(failure.exception.code, 400)
                    with failure.exception as response:
                        self.assertIn(message, json.load(response)["error"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
            if saved_id:
                with web.DATA_LOCK:
                    web.DATASETS.pop(saved_id, None)


if __name__ == "__main__":
    unittest.main()

