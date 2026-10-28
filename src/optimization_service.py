"""Validation shared by synchronous and asynchronous optimization requests."""
from src.search_model import Constraints, Limits


def integer(value, name, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{name}: נדרש מספר שלם בין {low} ל־{high}.")
    return value


def parse_constraints(raw, course_ids):
    if raw is None:
        return Constraints()
    if not isinstance(raw, dict):
        raise ValueError("האילוצים חייבים להיות אובייקט.")
    def identifiers(name):
        values = raw.get(name, [])
        if not isinstance(values, list) or len(values) > 20000 or not all(isinstance(v, str) for v in values):
            raise ValueError(f"{name}: רשימת מזהים אינה תקינה.")
        return frozenset(values)
    independent = identifiers("independent_courses")
    if not independent <= course_ids:
        raise ValueError("אישור קשרי הרישום מתייחס לקורס שלא נבחר.")
    blocked = raw.get("blocked", [])
    if not isinstance(blocked, list) or len(blocked) > 100:
        raise ValueError("רשימת הזמנים החסומים אינה תקינה.")
    intervals = []
    for interval in blocked:
        if not isinstance(interval, dict):
            raise ValueError("זמן חסום אינו תקין.")
        day = integer(interval.get("day"), "יום", 1, 5) - 1
        start = integer(interval.get("start"), "תחילת חסימה", 0, 1439)
        end = integer(interval.get("end"), "סיום חסימה", 1, 1440)
        if start >= end:
            raise ValueError("תחילת חסימה חייבת להיות לפני סופה.")
        intervals.append((day, start, end))
    replacements = raw.get("replacements", [])
    if not isinstance(replacements, list) or len(replacements) > 1000:
        raise ValueError("רשימת ההחלפות אינה תקינה.")
    pairs = []
    for replacement in replacements:
        if (not isinstance(replacement, dict) or replacement.get("approved") is not True
                or not isinstance(replacement.get("source"), str) or not isinstance(replacement.get("target"), str)):
            raise ValueError("החלפת מפגש דורשת אישור מפורש לשקילות ולרשות להשתתף.")
        pairs.append((replacement["source"], replacement["target"]))
    for name in ("include_full", "allow_registration_overlaps"):
        if type(raw.get(name, False)) is not bool:
            raise ValueError(f"{name}: נדרש ערך בוליאני.")
    links = raw.get("allowed_combinations", {})
    if not isinstance(links, dict) or not links.keys() <= course_ids:
        raise ValueError("שילובי הרישום מתייחסים לקורס שלא נבחר.")
    normalized = []
    for identifier, combinations in sorted(links.items()):
        if not isinstance(combinations, list) or len(combinations) > 5000:
            raise ValueError("רשימת שילובי הרישום אינה תקינה.")
        rows = []
        for row in combinations:
            if not isinstance(row, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in row.items()):
                raise ValueError("שילוב רישום אינו תקין.")
            rows.append(tuple(sorted(row.items())))
        normalized.append((identifier, tuple(sorted(set(rows)))))
    return Constraints(tuple(sorted(set(intervals))), identifiers("skipped"), tuple(sorted(set(pairs))),
                       independent, raw.get("include_full", False), raw.get("allow_registration_overlaps", False), tuple(normalized))


def parse_limits(raw):
    if raw is None:
        return Limits()
    if not isinstance(raw, dict):
        raise ValueError("מגבלות החיפוש אינן תקינות.")
    values = {}
    for key, default, low, high in (("seconds", 15, 1, 120), ("nodes", 500000, 100, 5000000),
            ("memory_bytes", 67108864, 1048576, 134217728), ("choices", 20000, 1, 50000),
            ("top_k", 60, 1, 200)):
        values[key] = integer(raw.get(key, default), key, low, high)
    if type(raw.get("exact_count", False)) is not bool:
        raise ValueError("exact_count: נדרש ערך בוליאני.")
    return Limits(**values, exact_count=raw.get("exact_count", False))
