"""Immutable search snapshots and bounded, revision-aware preparation cache."""
from collections import OrderedDict
from dataclasses import dataclass, field
from hashlib import sha256
from itertools import product
import json
from threading import Event, Lock
from time import monotonic

from src.bitmasks import TimeGrid, TYPES, slot_range


def meeting_id(course, component, group, index):
    return json.dumps([course, component, group, index], ensure_ascii=False, separators=(",", ":"))


@dataclass(frozen=True, slots=True)
class Constraints:
    blocked: tuple[tuple[int, int, int], ...] = ()
    skipped: frozenset[str] = frozenset()
    replacements: tuple[tuple[str, str], ...] = ()
    independent_courses: frozenset[str] = frozenset()
    include_full: bool = False
    allow_registration_overlaps: bool = False
    allowed_combinations: tuple[tuple[str, tuple], ...] = ()


@dataclass(frozen=True, slots=True)
class Limits:
    seconds: float = 15.0
    nodes: int = 500_000
    memory_bytes: int = 64 * 1024 * 1024
    choices: int = 20_000
    top_k: int = 60
    exact_count: bool = False


class Interrupted(Exception):
    pass


@dataclass(slots=True)
class Control:
    limits: Limits
    cancel: Event = field(default_factory=Event)
    started: float = field(default_factory=monotonic)
    work: int = 0

    def check(self, amount=1):
        self.work += amount
        if self.cancel.is_set():
            raise Interrupted("cancelled")
        if monotonic() - self.started >= self.limits.seconds:
            raise Interrupted("time_limit")
        if self.work > self.limits.nodes:
            raise Interrupted("node_limit")


@dataclass(frozen=True, slots=True)
class Meeting:
    id: str
    course_id: str
    course_name: str
    component: str
    group_id: str
    lecturer: str
    priority: str
    day: int
    start: int
    end: int
    mandatory: bool
    part: str
    packed: int
    mask: int


@dataclass(frozen=True, slots=True)
class Choice:
    group_id: str
    registered: tuple[int, ...]
    attended: tuple[int, ...]
    changes: tuple[tuple[str, str | None], ...]
    registration_mask: int
    attendance_mask: int
    priority: float
    registration_valid: bool


@dataclass(frozen=True, slots=True)
class Variable:
    course_id: str
    component: str
    choices: tuple[Choice, ...]


@dataclass(frozen=True, slots=True)
class LinkTable:
    variables: tuple[int, ...]
    rows: tuple[tuple[int, ...], ...]


@dataclass(frozen=True, slots=True)
class Problem:
    revision: str
    grid: TimeGrid
    meetings: tuple[Meeting, ...]
    variables: tuple[Variable, ...]
    tables: tuple[LinkTable, ...]
    issues: tuple[str, ...]
    bytes_estimate: int


def freeze_courses(courses):
    """Structural keys detect edits even when mutable domain objects are reused."""
    return tuple(sorted((c.course_id, c.name, c.credits,
        tuple(sorted((kind.value, tuple(sorted((g.group_id, g.lecturer, g.priority.str_val,
            g.priority.int_val, g.full,
            tuple(sorted((s.day.num - 1, s.start_minute, s.end_minute, s.mandatory, s.part)
                         for s in g.sessions))) for g in component.groups)))
                     for kind, component in c.components.items())),
        c.allowed_combinations) for c in courses))


_CACHE = OrderedDict()
_CACHE_LOCK = Lock()
_CACHE_BYTES = 0
_CACHE_MAX_BYTES = 32 * 1024 * 1024


def clear_preparation_cache():
    global _CACHE_BYTES
    with _CACHE_LOCK:
        _CACHE.clear()
        _CACHE_BYTES = 0


def prepare(courses, constraints: Constraints, control: Control) -> tuple[Problem, bool]:
    global _CACHE_BYTES
    frozen = freeze_courses(courses)
    key = (frozen, constraints)
    control.check(0)
    with _CACHE_LOCK:
        cached = _CACHE.get(key)
        if cached:
            if (cached.bytes_estimate > control.limits.memory_bytes
                    or sum(len(v.choices) for v in cached.variables) > control.limits.choices):
                raise Interrupted("memory_limit")
            _CACHE.move_to_end(key)
            return cached, True
    problem = _compile(frozen, constraints, control)
    with _CACHE_LOCK:
        if key not in _CACHE and problem.bytes_estimate <= _CACHE_MAX_BYTES:
            _CACHE[key] = problem
            _CACHE_BYTES += problem.bytes_estimate
            while len(_CACHE) > 4 or _CACHE_BYTES > _CACHE_MAX_BYTES:
                _, old = _CACHE.popitem(last=False)
                _CACHE_BYTES -= old.bytes_estimate
    return problem, False


def _compile(courses, constraints, control):
    sessions = [s for c in courses for _, groups in c[3] for g in groups for s in g[5]]
    grid = TimeGrid(14 if all(slot_range(s[1], s[2]) is not None for s in sessions) else 1440)
    meetings, group_records, lookup = [], {}, {}
    estimated = 0
    for course_id, name, _, components, _ in courses:
        for component, groups in components:
            for group_id, lecturer, priority, priority_value, full, group_sessions in groups:
                refs = []
                for index, (day, start, end, mandatory, part) in enumerate(group_sessions):
                    control.check()
                    identifier = meeting_id(course_id, component, group_id, index)
                    refs.append(len(meetings))
                    lookup[identifier] = len(meetings)
                    meetings.append(Meeting(identifier, course_id, name, component, group_id,
                        lecturer, priority, day, start, end, mandatory, part,
                        grid.pack(day, start, end, mandatory, TYPES.index(component)),
                        grid.interval_mask(day, start, end)))
                    estimated += 1024 + grid.width * 5 // 4
                    if estimated > control.limits.memory_bytes:
                        raise Interrupted("memory_limit")
                group_records[(course_id, component, group_id)] = (tuple(refs), priority_value, full)
    if not constraints.skipped <= lookup.keys():
        raise ValueError("סימון ויתור מתייחס למפגש שאינו קיים בבחירה הנוכחית.")
    replacements = {}
    for source, target in constraints.replacements:
        if source not in lookup or target not in lookup:
            raise ValueError("קישור חלופי מתייחס למפגש שאינו קיים.")
        a, b = meetings[lookup[source]], meetings[lookup[target]]
        if (source in constraints.skipped or a.course_id != b.course_id or a.component != b.component
                or a.group_id == b.group_id or (a.part and b.part and a.part != b.part)
                or len(group_records[(a.course_id, a.component, a.group_id)][0]) < 2):
            raise ValueError("החלפה חייבת להיות מאותו קורס ורכיב, מקבוצה אחרת ולחלק שבועי מקביל; בקבוצת המקור נדרשים שני מפגשים לפחות.")
        replacements.setdefault(lookup[source], set()).add(lookup[target])
    blocked = grid.blocked_mask(constraints.blocked)
    variables, tables, issues = [], [], []
    choice_count = 0
    for course_id, _, _, components, allowed in courses:
        allowed = dict(constraints.allowed_combinations).get(course_id, allowed)
        indices = []
        if len(components) > 1 and allowed is None and course_id not in constraints.independent_courses:
            raise ValueError(f"בקורס {course_id} חסרים קשרי הרישום בין הרכיבים. יש להזין שילובים מותרים או לאשר במפורש שכל השילובים מותרים.")
        for component, groups in components:
            indices.append(len(variables))
            choices = []
            for group_id, *_ in groups:
                refs, priority, full = group_records[(course_id, component, group_id)]
                if full and not constraints.include_full:
                    continue
                registration_mask, registration_valid = 0, True
                for ref in refs:
                    mask = meetings[ref].mask
                    registration_valid &= not bool(registration_mask & mask)
                    registration_mask |= mask
                alternatives = [(-1,) if meetings[ref].id in constraints.skipped
                                else (ref, *sorted(replacements.get(ref, ()))) for ref in refs]
                for variant in product(*alternatives):
                    control.check()
                    mask = 0
                    valid = True
                    for ref in variant:
                        if ref < 0:
                            continue
                        if mask & meetings[ref].mask or blocked & meetings[ref].mask:
                            valid = False
                            break
                        mask |= meetings[ref].mask
                    if not valid:
                        continue
                    changes = tuple((meetings[a].id, meetings[b].id if b >= 0 else None)
                                    for a, b in zip(refs, variant) if a != b)
                    attended = tuple(r for r in variant if r >= 0)
                    # Rate the lecturers actually attended; skipped meetings incur no lecturer penalty.
                    attendance_priority = (sum({"low": 1, "medium": 2, "high": 3}[meetings[r].priority]
                                               for r in attended) / len(attended)) if attended else 3
                    choices.append(Choice(group_id, refs, attended,
                                          changes, registration_mask, mask, attendance_priority, registration_valid))
                    choice_count += 1
                    estimated += 512 + 32 * len(refs) + grid.width * 5 // 4
                    if choice_count > control.limits.choices or estimated > control.limits.memory_bytes:
                        raise Interrupted("memory_limit")
            variables.append(Variable(course_id, component, tuple(choices)))
            if not choices:
                issues.append(f"בקורס {course_id}, רכיב {component}, לא נותרה קבוצה לאחר בדיקת זמינות, תפוסה וחפיפות הגעה פנימיות.")
        if allowed is not None:
            rows = []
            for row in allowed:
                control.check()
                selected = dict(row)
                if set(selected) != {component for component, _ in components}:
                    raise ValueError(f"שילוב הרישום בקורס {course_id} אינו מכסה בדיוק את כל הרכיבים.")
                masks = []
                for variable_index in indices:
                    var = variables[variable_index]
                    if (course_id, var.component, selected[var.component]) not in group_records:
                        raise ValueError(f"שילוב הרישום בקורס {course_id} מפנה לקבוצה חסרה.")
                    masks.append(sum(1 << i for i, choice in enumerate(var.choices)
                                     if choice.group_id == selected[var.component]))
                if all(masks):
                    rows.append(tuple(masks))
            tables.append(LinkTable(tuple(indices), tuple(rows)))
    revision = sha256(repr(courses).encode()).hexdigest()[:20]
    return Problem(revision, grid, tuple(meetings), tuple(variables), tuple(tables), tuple(issues), estimated)
