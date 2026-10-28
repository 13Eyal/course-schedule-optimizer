"""שרת מקומי שמחבר בין האתר למנוע בניית המערכות. הפעלה: python web_server.py.

GET מחזירה קבצי אתר או נתוני דוגמה; POST מקבלת Excel, קורס ידני או בקשת חישוב.
זרימת הקורס הידני: גוף JSON ← פענוח לקורס ← אימות ← שמירה בזיכרון ← תשובת JSON.
"""
from __future__ import annotations

# ספריות מובנות: תקשורת HTTP, המרת JSON, קבצים ותיאום בין בקשות מקבילות.
import argparse
from hashlib import sha256
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
import logging
from math import isfinite
from pathlib import Path
from threading import Lock, BoundedSemaphore, Thread, Event
from time import monotonic
from urllib.parse import urlsplit
from uuid import uuid4
from zipfile import ZipFile, BadZipFile

# קוד הפרויקט: קריאת נתונים, מודלים, יצירת מערכות ודירוגן.
from src.data_loader import load_courses_from_excel
from src.models import Preferences, Course
from src.search import optimize
from src.search_model import freeze_courses, meeting_id
from src.optimization_service import parse_constraints, parse_limits, integer
from src.course_parser import parse_course
from src.bitmasks import SLOTS
from src.grades_io import read_grades_workbook, export_grades_workbook, XLSX_MIME

# הנתיבים נבנים ביחס לקובץ השרת, גם אם מפעילים אותו מתיקייה אחרת.
ROOT = Path(__file__).resolve().parent
PROJECT_ID = sha256(str(ROOT).casefold().encode("utf-8")).hexdigest()
# מגבלות על גודל העלאה ועל מספר הצירופים כדי להגביל את צריכת המשאבים.
MAX_UPLOAD = 5 * 1024 * 1024
MAX_GROUPS = 5000
MAX_SESSIONS = 20000
WEIGHT_NAMES = ("study_days_weight", "gaps_weight", "start_time_weight", "priority_weight", "daily_span_weight")
# כל כתובת ציבורית ממופה לקובץ ולסוג התוכן שלו; רק הקבצים שברשימה נגישים.
STATIC_FILES = {
    "/web/index.html": ("web/index.html", "text/html; charset=utf-8"),
    "/web/grades.html": ("web/grades.html", "text/html; charset=utf-8"),
    "/web/styles/grades.css": ("web/styles/grades.css", "text/css; charset=utf-8"),
    "/web/styles/brand.css": ("web/styles/brand.css", "text/css; charset=utf-8"),
    "/web/scripts/brand-storage.js": ("web/scripts/brand-storage.js", "text/javascript; charset=utf-8"),
    "/web/scripts/i18n.js": ("web/scripts/i18n.js", "text/javascript; charset=utf-8"),
    "/web/scripts/grades.js": ("web/scripts/grades.js", "text/javascript; charset=utf-8"),
    "/web/scripts/grade-math.js": ("web/scripts/grade-math.js", "text/javascript; charset=utf-8"),
    "/web/styles/base.css": ("web/styles/base.css", "text/css; charset=utf-8"),
    "/web/styles/layout.css": ("web/styles/layout.css", "text/css; charset=utf-8"),
    "/web/styles/planner.css": ("web/styles/planner.css", "text/css; charset=utf-8"),
    "/web/styles/cobalt.css": ("web/styles/cobalt.css", "text/css; charset=utf-8"),
    "/web/styles/sketch.css": ("web/styles/sketch.css", "text/css; charset=utf-8"),
    "/web/scripts/app.js": ("web/scripts/app.js", "text/javascript; charset=utf-8"),
    "/web/scripts/api.js": ("web/scripts/api.js", "text/javascript; charset=utf-8"),
    "/web/scripts/search-controls.js": ("web/scripts/search-controls.js", "text/javascript; charset=utf-8"),
    "/web/scripts/manual-course.js": ("web/scripts/manual-course.js", "text/javascript; charset=utf-8"),
    "/web/scripts/shell.js": ("web/scripts/shell.js", "text/javascript; charset=utf-8"),
    "/web/scripts/planner.js": ("web/scripts/planner.js", "text/javascript; charset=utf-8"),
    "/web/scripts/effects.js": ("web/scripts/effects.js", "text/javascript; charset=utf-8"),
    "/web/scripts/motion.js": ("web/scripts/motion.js", "text/javascript; charset=utf-8"),
    "/assets/brand/carpedio-symbol.svg": ("assets/brand/carpedio-symbol.svg", "image/svg+xml"),
    "/assets/brand/favicon.svg": ("assets/brand/favicon.svg", "image/svg+xml"),
    "/assets/design/sand-sea-watercolor-texture-background.jpg": ("assets/design/sand-sea-watercolor-texture-background.jpg", "image/jpeg"),
    "/sample.xlsx": ("data/courses_sample.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
}
# כל מזהה מפנה לזמן יצירה ולרשימת קורסים. השמירה זמנית ונמחקת בסגירת השרת.
DATASETS: dict[str, tuple[float, list]] = {}
# מנעול מונע שינוי בו־זמני במאגרים; סמפור מאפשר חישוב כבד אחד בכל פעם.
DATA_LOCK = Lock()
SOLVE_LOCK = BoundedSemaphore(1)
JOBS = {}
JOB_LOCK = Lock()
SAMPLE_CACHE = None


class InputError(ValueError):
    """שגיאת קלט שההודעה שלה מיועדת להצגה למשתמש בתשובת HTTP 400."""
    pass


def validate_courses(courses):
    """בדיקות משותפות לקורסים שהגיעו מ־Excel או מהזנה ידנית."""
    if not courses:
        raise InputError("הקובץ אינו מכיל קורסים.")
    if len(courses) > 40:
        raise InputError("ניתן לטעון עד 40 קורסים בכל קובץ.")
    # עוברים בהיררכיה: קורס, רכיב, קבוצה ומפגש, ובודקים מגבלות לפני השמירה.
    if len({course.course_id for course in courses}) != len(courses):
        raise InputError("מזהי קורסים חייבים להיות ייחודיים.")
    groups = [g for c in courses for component in c.components.values() for g in component.groups]
    if len(groups) > MAX_GROUPS or sum(len(g.sessions) for g in groups) > MAX_SESSIONS:
        raise InputError("מערך הנתונים מכיל יותר מדי קבוצות או מפגשים.")
    for course in courses:
        if not course.components or any(not c.groups for c in course.components.values()):
            raise InputError("לכל קורס נדרשים רכיבים וקבוצות.")
        if not isfinite(course.credits) or course.credits < 0:
            raise InputError("נקודות הזכות חייבות להיות מספר תקין ולא שלילי.")
        for component in course.components.values():
            if len({g.group_id for g in component.groups}) != len(component.groups):
                raise InputError("מזהי קבוצות חייבים להיות ייחודיים בתוך כל רכיב.")
            for group in component.groups:
                if not group.sessions:
                    raise InputError("לכל קבוצה חייב להיות לפחות מפגש אחד.")
                for session in group.sessions:
                    if not 0 <= session.start_minute < session.end_minute < 1440:
                        raise InputError("שעות המפגשים חייבות להיות באותו יום, בין 00:00 ל־23:59.")
    return courses


def read_workbook(data):
    """קוראת את בתי קובץ ה־Excel ומחזירה רשימת אובייקטי Course מאומתים."""
    try:
        # XLSX הוא ארכיון ZIP. בודקים גם את גודלו לאחר פתיחה, לפני טעינת הנתונים.
        with ZipFile(BytesIO(data)) as archive:
            if sum(item.file_size for item in archive.infolist()) > 25 * 1024 * 1024:
                raise InputError("קובץ ה־Excel גדול מדי לאחר פתיחה. נסו קובץ קטן יותר.")
        return validate_courses(load_courses_from_excel(BytesIO(data)))
    except InputError:
        # הודעה שכבר נוסחה למשתמש מועברת הלאה ללא שינוי.
        raise
    except (BadZipFile, ValueError, KeyError, TypeError, OSError) as error:
        # מסתירים פרטי מימוש של קורא ה־Excel ומחזירים הסבר שימושי.
        raise InputError("לא ניתן לקרוא את הקובץ. בדקו את שמות העמודות, הימים, השעות וסוגי הקבוצות לפי קובץ הדוגמה.") from error


def read_manual_course(data: bytes) -> Course:
    """מפענחת גוף בקשת JSON ובונה ממנו קורס אחד, כולל כל הרכיבים והמפגשים."""
    try:
        # json.loads ממירה את בתי הבקשה למבני פייתון; parse_course מאמתת ובונה אובייקטים.
        raw = json.loads(data)
        return parse_course(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise InputError("גוף הבקשה חייב להכיל JSON תקין.") from error
    except ValueError as error:
        # שומרים את הודעת האימות, למשל שדה חסר או שעת סיום שאינה תקינה.
        raise InputError(str(error)) from error
    except (TypeError, OverflowError) as error:
        raise InputError("מבנה נתוני הקורס או הערכים שנשלחו אינם תקינים.") from error


def dataset_response(courses, dataset_id):
    details = []
    frozen = freeze_courses(courses)
    for identifier, name, credits, components, allowed in frozen:
        groups = []
        for component, component_groups in components:
            for group_id, lecturer, priority, _, full, sessions in component_groups:
                groups.append({"id": group_id, "type": component, "lecturer": lecturer,
                    "priority": priority, "full": full,
                    "sessions": [{"id": meeting_id(identifier, component, group_id, i),
                        "day": day + 1, "start": start, "end": end, "mandatory": mandatory, "part": part}
                        for i, (day, start, end, mandatory, part) in enumerate(sessions)]})
        details.append({"id": identifier, "name": name, "groups": groups,
                        "links_known": len(components) == 1 or allowed is not None})
    return {"id": dataset_id, "courses": [
        {"id": c.course_id, "name": c.name, "credits": c.credits, "components": len(c.components)}
        for c in courses], "details": details,
        "revision": sha256(repr(frozen).encode()).hexdigest()[:20]}


def save_manual_course(data):
    """Append to a validated snapshot, leaving the source dataset untouched."""
    course = read_manual_course(data)
    payload = json.loads(data)
    existing = []
    if "dataset_id" in payload:
        identifier = payload["dataset_id"]
        if not isinstance(identifier, str) or not identifier:
            raise InputError("מזהה רשימת הקורסים אינו תקין.")
        existing = get_dataset(identifier)
        if payload.get("dataset_revision") != dataset_response(existing, identifier)["revision"]:
            raise InputError("רשימת הקורסים השתנתה. יש לטעון אותה מחדש לפני ההוספה.")
        if any(item.course_id == course.course_id for item in existing):
            raise InputError("מספר הקורס כבר קיים ברשימה. יש להזין מספר קורס אחר.")
    return save_dataset(validate_courses([*existing, course]))


def save_dataset(courses):
    """יוצרת מאגר חדש בזיכרון ומחזירה את התקציר שלו לדפדפן."""
    with DATA_LOCK:
        # monotonic מודד זמן שחלף ואינו תלוי בשינויים בשעון המחשב.
        now = monotonic()
        # פינוי מאגרים בני יותר משעתיים. list מאפשרת למחוק מהמילון בזמן הלולאה.
        for key, (created, _) in list(DATASETS.items()):
            if now - created > 7200:
                DATASETS.pop(key)
        # שומרים לכל היותר 16 מאגרים; בעת הצורך מפנים את הישן ביותר לפני ההוספה.
        while len(DATASETS) >= 16:
            DATASETS.pop(next(iter(DATASETS)))
        # מזהה אקראי מקשר בין הנתונים השמורים לבקשות החישוב הבאות.
        dataset_id = uuid4().hex
        DATASETS[dataset_id] = (now, courses)
    return dataset_response(courses, dataset_id)


def get_dataset(dataset_id):
    """מחזירה קורסים לפי מזהה, או טוענת מחדש את קובץ הדוגמה עבור sample."""
    if dataset_id == "sample":
        global SAMPLE_CACHE
        path = ROOT / "data/courses_sample.xlsx"
        stamp = (path.stat().st_mtime_ns, path.stat().st_size)
        with DATA_LOCK:
            if SAMPLE_CACHE is None or SAMPLE_CACHE[0] != stamp:
                SAMPLE_CACHE = (stamp, validate_courses(load_courses_from_excel(path)))
            return SAMPLE_CACHE[1]
    with DATA_LOCK:
        entry = DATASETS.get(dataset_id)
        # גם לפני שפונו בפועל, מאגרים בני יותר משעתיים אינם זמינים לחישוב.
        if entry and monotonic() - entry[0] <= 7200:
            return entry[1]
    raise InputError("תוקף נתוני הקורסים פג. יש להעלות שוב את הקובץ.")


def parse_preferences(raw):
    """מאמתת את העדפות המשתמש וממירה את המילון לאובייקט Preferences."""
    if not isinstance(raw, dict):
        raise InputError("לא התקבלו העדפות תקינות.")
    values = {}
    for name in ("preferred_start", *WEIGHT_NAMES):
        value = raw.get(name)
        # שעת התחלה נמדדת בדקות מחצות; שאר השדות הם משקלים בטווח 0–100.
        maximum = 1439 if name == "preferred_start" else 100
        # בדיקת type מדויקת דוחה גם bool, שבפייתון נחשב תת־סוג של int.
        if type(value) is not int or not 0 <= value <= maximum:
            raise InputError("המשקלים חייבים להיות בין 0 ל־100 ושעת ההתחלה חייבת להיות תקינה.")
        values[name] = value
    if not any(values[name] for name in WEIGHT_NAMES):
        raise InputError("לפחות העדפה אחת צריכה לקבל משקל גדול מאפס.")
    # ** פורש את המילון לארגומנטים בעלי שמות בבנאי של Preferences.
    for name, default, low, high in (("target_days", 1, 0, 5), ("target_gaps", 0, 0, 1440),
            ("target_daily_span", 0, 0, 1440), ("break_min", 0, 0, 240), ("break_max", 0, 0, 240)):
        try:
            values[name] = integer(raw.get(name, default), name, low, high)
        except ValueError as error:
            raise InputError(str(error)) from error
    if values["break_min"] > values["break_max"]:
        raise InputError("טווח ההפסקה הרצויה אינו תקין.")
    return Preferences(**values)


def optimization_request(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("dataset_id"), str):
        raise InputError("בקשת החישוב אינה תקינה.")
    courses = get_dataset(payload["dataset_id"])
    if "dataset_revision" in payload:
        revision = sha256(repr(freeze_courses(courses)).encode()).hexdigest()[:20]
        if payload["dataset_revision"] != revision:
            raise InputError("נתוני הקורסים השתנו מאז טעינת המסך. יש לטעון אותם מחדש ולבדוק את החלטות ההגעה וקשרי הרישום.")
    ids = payload.get("course_ids")
    if not isinstance(ids, list) or not ids or not all(isinstance(value, str) for value in ids):
        raise InputError("יש לבחור לפחות קורס אחד.")
    selected_ids = set(ids)
    if not selected_ids <= {c.course_id for c in courses}:
        raise InputError("הבחירה מכילה קורס שאינו נמצא בקובץ.")
    selected = [c for c in courses if c.course_id in selected_ids]
    try:
        constraints = parse_constraints(payload.get("constraints"), selected_ids)
        limits = parse_limits(payload.get("limits"))
    except ValueError as error:
        raise InputError(str(error)) from error
    return selected, parse_preferences(payload.get("preferences")), constraints, limits


def optimize_payload(payload, cancel=None, progress=None):
    request = optimization_request(payload)
    try:
        return optimize(*request, cancel=cancel, progress=progress)
    except ValueError as error:
        raise InputError(str(error)) from error


def start_job(payload):
    request = optimization_request(payload)
    if not SOLVE_LOCK.acquire(blocking=False):
        return None
    identifier = uuid4().hex
    job = {"created": monotonic(), "state": "running", "cancel": Event(), "result": None, "error": None}
    with JOB_LOCK:
        expired = [key for key, value in JOBS.items() if value["state"] != "running" and monotonic() - value["created"] > 600]
        for key in expired:
            JOBS.pop(key, None)
        while len(JOBS) >= 8:
            old = next((key for key, value in JOBS.items() if value["state"] != "running"), None)
            if old is None:
                SOLVE_LOCK.release()
                raise InputError("יש יותר מדי חיפושים פעילים.")
            JOBS.pop(old)
        JOBS[identifier] = job
    def progress(result):
        with JOB_LOCK:
            job["result"] = result
    def run():
        try:
            result = optimize(*request, cancel=job["cancel"], progress=progress)
            with JOB_LOCK:
                job.update(result=result, state="finished")
        except ValueError as error:
            with JOB_LOCK:
                job.update(error=str(error), state="failed")
        except Exception:
            logging.exception("Search job failed")
            with JOB_LOCK:
                job.update(error="החיפוש נכשל. ניתן לנסות שוב.", state="failed")
        finally:
            SOLVE_LOCK.release()
    try:
        Thread(target=run, daemon=True).start()
    except Exception:
        SOLVE_LOCK.release()
        with JOB_LOCK:
            JOBS.pop(identifier, None)
        raise
    return {"id": identifier, "state": "running"}


def job_snapshot(identifier, cancel=False):
    with JOB_LOCK:
        job = JOBS.get(identifier)
        if job is None:
            return None
        if cancel:
            job["cancel"].set()
        return {"id": identifier, "state": job["state"], "result": job["result"], "error": job["error"]}


class Handler(BaseHTTPRequestHandler):
    """מטפלת בבקשה אחת; ספריית HTTP מפעילה do_GET או do_POST לפי סוג הבקשה."""
    server_version = "CarpedIOLocal/1.0"

    def respond(self, status, data, content_type="application/json; charset=utf-8"):
        """שולחת קוד מצב, כותרות וגוף תשובה; מילונים מומרים אוטומטית ל־JSON."""
        # קבצים מגיעים כבתים מוכנים לשליחה; נתונים אחרים מקודדים כ־JSON ב־UTF-8.
        if not isinstance(data, bytes):
            data = json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        # לא שומרים תשובות במטמון, לא מנחשים סוג תוכן ולא שולחים מידע על כתובת המקור.
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        # לאחר הכותרות נשלח גוף התשובה. ניתוק הדפדפן באמצע אינו כשל של החישוב.
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def local_request(self):
        """מאפשרת בקשות לשרת המקומי ודוחה Origin של אתר אחר, אם נשלח כזה."""
        host = self.headers.get("Host", "")
        accepted = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        origin = self.headers.get("Origin")
        if host not in accepted or (origin and origin not in {f"http://{item}" for item in accepted}):
            self.respond(403, {"error": "השרת זמין דרך הכתובת המקומית בלבד."})
            return False
        return True

    def do_GET(self):
        """מטפלת בטעינת דפי האתר, קובצי העיצוב והסקריפטים, או תקציר נתוני הדוגמה."""
        if not self.local_request():
            return
        # שולפים את הנתיב ללא פרמטרים כמו ?edition=grove.
        path = urlsplit(self.path).path
        try:
            if path == "/":
                # Keep one document URL so relative assets work over HTTP and file://.
                query = urlsplit(self.path).query
                self.send_response(302)
                self.send_header("Location", "/web/index.html" + ("?" + query if query else ""))
                self.send_header("Content-Length", "0")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
            elif path == "/api/health":
                self.respond(200, {"app": "carpedio-schedule-optimizer", "project_id": PROJECT_ID})
            elif path == "/api/sample":
                self.respond(200, dataset_response(get_dataset("sample"), "sample"))
            elif path == "/api/course-options":
                self.respond(200, {"slots": SLOTS})
            elif path == "/api/grades/template":
                self.respond(200, export_grades_workbook(), XLSX_MIME)
            elif path.startswith("/api/jobs/"):
                snapshot = job_snapshot(path.removeprefix("/api/jobs/"))
                self.respond(200 if snapshot else 404, snapshot or {"error": "החיפוש אינו קיים או שפג תוקפו."})
            elif path in STATIC_FILES:
                # קוראים רק קובץ שמופיע ברשימה המותרת ושולחים את סוג התוכן המתאים.
                filename, content_type = STATIC_FILES[path]
                self.respond(200, (ROOT / filename).read_bytes(), content_type)
            else:
                self.respond(404, {"error": "הכתובת לא נמצאה."})
        except Exception:
            # פרטי התקלה נרשמים בטרמינל; הדפדפן מקבל הודעה כללית.
            logging.exception("GET failed")
            self.respond(500, {"error": "טעינת הנתונים נכשלה. בדקו שקובץ הדוגמה והתלויות מותקנים."})

    def do_POST(self):
        """מקבלת נתונים: העלאת Excel, קורס ידני כ־JSON, או בקשת יצירת מערכות."""
        if not self.local_request():
            return
        path = urlsplit(self.path).path
        # דוחים כתובות לא מוכרות לפני קריאת גוף הבקשה.
        cancel_job = path.startswith("/api/jobs/") and path.endswith("/cancel")
        if path not in ("/api/courses", "/api/courses/manual", "/api/optimize", "/api/jobs",
                        "/api/grades/import", "/api/grades/export") and not cancel_job:
            self.respond(404, {"error": "הכתובת לא נמצאה."})
            return
        try:
            # Content-Length הוא מספר הבתים שהלקוח שולח. לבקשות JSON יש מגבלה קטנה יותר.
            size = int(self.headers.get("Content-Length", "0"))
            limit = MAX_UPLOAD if path in ("/api/courses", "/api/grades/import") else (2 * 1024 * 1024 if path == "/api/grades/export" else 32_768)
            if size <= 0 or size > limit:
                self.respond(413, {"error": f"גודל הבקשה אינו תקין. הגודל המרבי במסלול זה הוא {limit} בתים."})
                return
            # מגבילים את זמן ההמתנה וקוראים את מספר הבתים שהוצהר בכותרת.
            self.connection.settimeout(30)
            data = self.rfile.read(size)
            if len(data) != size:
                raise InputError("העלאת הקובץ לא הושלמה.")
            if path in ("/api/grades/import", "/api/grades/export"):
                try:
                    if path.endswith('/import'):
                        self.respond(200, read_grades_workbook(data))
                    else:
                        self.respond(200, export_grades_workbook(json.loads(data)), XLSX_MIME)
                except ValueError as error:
                    raise InputError(str(error)) from error
            elif cancel_job:
                snapshot = job_snapshot(path[len("/api/jobs/"):-len("/cancel")], cancel=True)
                self.respond(200 if snapshot else 404, snapshot or {"error": "החיפוש אינו קיים."})
            elif path == "/api/jobs":
                job = start_job(json.loads(data))
                self.respond(202 if job else 503, job or {"error": "חיפוש אחר עדיין מתבצע. נסו שוב בעוד רגע."})
            elif path == "/api/courses":
                # במסלול הקיים הגוף הוא קובץ Excel, והקורא מחזיר רשימת קורסים.
                self.respond(200, save_dataset(read_workbook(data)))
            elif path == "/api/courses/manual":
                self.respond(200, save_manual_course(data))
            else:
                # מסלול החישוב: מחזירים מיד 503 אם חישוב אחר כבר מחזיק בסמפור.
                if not SOLVE_LOCK.acquire(blocking=False):
                    self.respond(503, {"error": "חישוב אחר מתבצע כרגע. נסו שוב בעוד רגע."})
                    return
                try:
                    self.respond(200, optimize_payload(json.loads(data)))
                finally:
                    # משחררים את הסמפור גם אם החישוב נכשל, כדי לא לחסום בקשות עתידיות.
                    SOLVE_LOCK.release()
        except (InputError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            # שגיאת קלט מחזירה 400; רק הודעות מסוג InputError נחשפות במלואן למשתמש.
            self.respond(400, {"error": str(error) if isinstance(error, InputError) else "הבקשה אינה תקינה."})
        except Exception:
            # כשל לא צפוי מחזיר 500 ונרשם עם פרטי השגיאה בטרמינל לצורך איתור התקלה.
            logging.exception("POST failed")
            self.respond(500, {"error": "לא ניתן להשלים את הפעולה. בדקו את הקובץ ונסו שוב."})


def main():
    """קוראת אפשרויות מהטרמינל ומפעילה את השרת עד לעצירה באמצעות Ctrl+C."""
    parser = argparse.ArgumentParser(description=__doc__)
    # אפשר לבחור פורט, למשל: python web_server.py --port 8080.
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    # השרת מאזין רק במחשב הזה ומטפל בבקשות בחוטי ביצוע נפרדים.
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"CarpedIO is ready at http://127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        # משחררים את שקע הרשת גם בזמן עצירה או תקלה.
        server.server_close()


if __name__ == "__main__":
    # ייבוא הקובץ ממקום אחר אינו מפעיל שרת; רק הרצה ישירה מפעילה את main.
    main()

