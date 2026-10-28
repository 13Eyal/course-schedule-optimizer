"""Exact top-K search with domains, arc consistency, MRV and safe cost bounds."""
from collections import OrderedDict
from dataclasses import dataclass, asdict
from heapq import heappush, heapreplace
from sys import getsizeof
from time import monotonic

from src.models import ScheduleMetrics
from src.bitmasks import SLOTS, slot_range
from src.scoring import cost, metrics_from_days, penalties
from src.search_model import Constraints, Limits, Control, Interrupted, prepare


def bits(mask):
    while mask:
        bit = mask & -mask
        yield bit.bit_length() - 1
        mask ^= bit


@dataclass(frozen=True, slots=True)
class Candidate:
    selections: tuple[int, ...]
    metrics: ScheduleMetrics
    cost: float


class Search:
    def __init__(self, problem, preferences, control, strict=True, progress=None):
        self.problem, self.preferences, self.control = problem, preferences, control
        self.strict, self.progress = strict, progress
        self.variables = problem.variables
        self.n = len(self.variables)
        self.heap, self.compatibility, self.dead = [], OrderedDict(), OrderedDict()
        self.cache_bytes = 0
        self.dead_bytes = 0
        self.cache_budget = max(0, control.limits.memory_bytes - problem.bytes_estimate) // 2
        self.stats = dict(nodes=0, leaves=0, bound_prunes=0, domain_prunes=0, dead_hits=0, compatibility_hits=0)
        self.last_progress = 0.0
        self.status = "complete"
        self.diagnostic = list(problem.issues)
        self.neighbors = []
        unions = []
        for var in self.variables:
            attendance = registration = 0
            for c in var.choices:
                attendance |= c.attendance_mask
                registration |= c.registration_mask
            unions.append((attendance, registration))
        for i, (a, r) in enumerate(unions):
            self.neighbors.append(tuple(j for j, (b, s) in enumerate(unions)
                                        if i != j and (a & b or (strict and r & s))))

    def compatible(self, i, a, j):
        key = i, a, j
        if key in self.compatibility:
            self.stats["compatibility_hits"] += 1
            self.compatibility.move_to_end(key)
            return self.compatibility[key]
        chosen = self.variables[i].choices[a]
        mask = 0
        for b, other in enumerate(self.variables[j].choices):
            self.control.check()
            if not (chosen.attendance_mask & other.attendance_mask or
                    (self.strict and chosen.registration_mask & other.registration_mask)):
                mask |= 1 << b
        size = 160 + getsizeof(mask)
        if size <= self.cache_budget:
            while self.compatibility and self.cache_bytes + size > self.cache_budget:
                _, old = self.compatibility.popitem(last=False)
                self.cache_bytes -= 160 + getsizeof(old)
            self.compatibility[key] = mask
            self.cache_bytes += size
        return mask

    def propagate(self, domains):
        """Maintain pairwise consistency plus full (not merely pairwise) registration tables."""
        changed = True
        while changed:
            changed = False
            for table in self.problem.tables:
                supports = [0] * len(table.variables)
                for row in table.rows:
                    self.control.check()
                    if all(domains[v] & allowed for v, allowed in zip(table.variables, row)):
                        for k, allowed in enumerate(row):
                            supports[k] |= allowed
                for v, supported in zip(table.variables, supports):
                    new = domains[v] & supported
                    if not new:
                        self.diagnostic = [f"קשרי הרישום בקורס {self.variables[v].course_id} אינם מאפשרים את הבחירה עם האילוצים הנוכחיים."]
                        return False
                    if new != domains[v]:
                        domains[v] = new
                        changed = True
            for i in range(self.n):
                if not domains[i]:
                    return False
                for j in self.neighbors[i]:
                    new = 0
                    for a in bits(domains[i]):
                        if self.compatible(i, a, j) & domains[j]:
                            new |= 1 << a
                    if not new:
                        self.diagnostic = [f"לא נותר שילוב תואם בין {self.variables[i].course_id} ({self.variables[i].component}) לבין {self.variables[j].course_id} ({self.variables[j].component}), תחת האילוצים הנוכחיים."]
                        return False
                    if new != domains[i]:
                        domains[i] = new
                        changed = True
        return True

    def optimistic_cost(self, days, priority, remaining, domains):
        # Days, early-start penalty and span cannot decrease on addition.
        # Gaps CAN decrease, so their safe lower bound is zero.
        maximum_priority = priority + sum(max(self.variables[i].choices[a].priority for a in bits(domains[i]))
                                          for i in bits(remaining))
        metrics = metrics_from_days(self.problem.grid, days, maximum_priority, self.preferences)
        optimistic = ScheduleMetrics(metrics.study_days, 0, metrics.start_penalty,
                                     maximum_priority, metrics.max_daily_minutes)
        return cost(optimistic, self.preferences, self.n)

    def candidates(self):
        return sorted((entry[2] for entry in self.heap), key=lambda c: (c.cost, c.selections))

    def dead_key(self, domains, remaining):
        # Assigned choices need not be identical, provided every future constraint is.
        # Remaining unary domains alone are insufficient for n-ary registration tables.
        rows = []
        for table in self.problem.tables:
            support = 0
            for index, row in enumerate(table.rows):
                self.control.check()
                if all(domains[v] & allowed for v, allowed in zip(table.variables, row)):
                    support |= 1 << index
            rows.append(support)
        return remaining, tuple(domains[i] for i in bits(remaining)), tuple(rows)

    def report(self, force=False):
        if self.progress and (force or monotonic() - self.last_progress >= 0.4):
            self.last_progress = monotonic()
            self.progress(self)

    def visit(self, domains, remaining, selections, days, priority):
        self.control.check()
        self.stats["nodes"] += 1
        self.report()
        if not remaining:
            self.stats["leaves"] += 1
            metrics = metrics_from_days(self.problem.grid, days, priority, self.preferences)
            value = cost(metrics, self.preferences, self.n)
            candidate = Candidate(tuple(selections), metrics, value)
            entry = (-value, tuple(-i for i in selections), candidate)
            if len(self.heap) < self.control.limits.top_k:
                heappush(self.heap, entry)
            elif entry[:2] > self.heap[0][:2]:
                heapreplace(self.heap, entry)
            return True
        if not self.control.limits.exact_count and len(self.heap) == self.control.limits.top_k:
            if self.optimistic_cost(days, priority, remaining, domains) > -self.heap[0][0] + 1e-12:
                self.stats["bound_prunes"] += 1
                return None  # Unknown feasibility, NEVER memoize as a dead state.
        key = self.dead_key(domains, remaining)
        if key in self.dead:
            self.stats["dead_hits"] += 1
            return False
        var_index = min(bits(remaining), key=lambda i: (domains[i].bit_count(), -len(self.neighbors[i]), i))
        next_remaining = remaining & ~(1 << var_index)
        ranked = []
        for a in bits(domains[var_index]):
            self.control.check()
            choice = self.variables[var_index].choices[a]
            updated = self.problem.grid.update_days(days, choice.attendance_mask)
            ranked.append((self.optimistic_cost(updated, priority + choice.priority, next_remaining, domains), a, updated))
        found, unknown = False, False
        for _, a, updated in sorted(ranked):
            choice = self.variables[var_index].choices[a]
            next_domains = domains.copy()
            next_domains[var_index] = 1 << a
            if not self.propagate(next_domains):
                self.stats["domain_prunes"] += 1
                continue
            selections[var_index] = a
            result = self.visit(next_domains, next_remaining, selections, updated, priority + choice.priority)
            found |= result is True
            unknown |= result is None
        selections[var_index] = -1
        if not found and not unknown:
            # Domains encode every remaining pairwise/n-ary feasibility restriction.
            size = 192 + getsizeof(key[1]) + getsizeof(key[2]) + sum(getsizeof(x) for x in (*key[1], *key[2]))
            if size <= self.cache_budget:
                while self.dead and (self.dead_bytes + size > self.cache_budget or len(self.dead) >= 20000):
                    _, old_size = self.dead.popitem(last=False)
                    self.dead_bytes -= old_size
                self.dead[key] = size
                self.dead_bytes += size
        return True if found else None if unknown else False

    def run(self):
        domains = [sum(1 << i for i, c in enumerate(v.choices) if not self.strict or c.registration_valid)
                   for v in self.variables]
        try:
            if self.propagate(domains):
                self.visit(domains, (1 << self.n) - 1, [-1] * self.n, (0,) * 5, 0)
                if not self.heap:
                    self.diagnostic = ["כל השילובים נבדקו או נפסלו באמצעות האילוצים. לא קיימת תוכנית מלאה; לא זוהתה קבוצת אילוצים מינימלית שאחראית לכך."]
        except Interrupted as error:
            self.status = str(error)
            self.diagnostic = []  # A failed branch is not a proof that the whole problem is infeasible.
        self.report(True)
        return self


def serialize_meeting(meeting):
    return {"session_id": meeting.id, "course_id": meeting.course_id, "name": meeting.course_name,
            "type": meeting.component, "group_id": meeting.group_id, "lecturer": meeting.lecturer,
            "priority": meeting.priority, "day": meeting.day + 1, "start": meeting.start,
            "end": meeting.end, "mandatory": meeting.mandatory}


def serialize_meeting_parts(meeting):
    """Do not paint/count the institutional lunch break as attendance in the UI."""
    value = serialize_meeting(meeting)
    slots = slot_range(meeting.start, meeting.end)
    if slots is None:
        return [value]
    first, count = slots
    runs = []
    for start, end in SLOTS[first:first + count]:
        if runs and runs[-1][1] == start:
            runs[-1] = (runs[-1][0], end)
        else:
            runs.append((start, end))
    return [dict(value, start=start, end=end, meeting_start=meeting.start, meeting_end=meeting.end)
            for start, end in runs]


def serialize_result(search, cache_hit=False, running=False):
    schedules = []
    problem = search.problem
    for candidate in search.candidates():
        choices = [v.choices[a] for v, a in zip(problem.variables, candidate.selections)]
        def meetings(refs):
            return sorted((part for r in refs for part in serialize_meeting_parts(problem.meetings[r])),
                          key=lambda s: (s["day"], s["start"], s["session_id"]))
        schedules.append({"score": 1 / (1 + candidate.cost), "metrics": asdict(candidate.metrics),
            "penalties": penalties(candidate.metrics, search.preferences, search.n),
            "sessions": meetings(r for c in choices for r in c.attended),
            "registration_sessions": meetings(r for c in choices for r in c.registered),
            "changes": [{"source": a, "replacement": b} for c in choices for a, b in c.changes],
            "selection": [[v.course_id, v.component, c.group_id] for v, c in zip(problem.variables, choices)]})
    complete = search.status == "complete" and not running
    exact = complete and not search.stats["bound_prunes"]
    return {"total": search.stats["leaves"] if exact else None, "total_exact": exact,
            "found": search.stats["leaves"], "schedules": schedules,
            "status": "running" if running else search.status,
            "optimal": complete, "mode": "strict" if search.strict else "approved_overlaps",
            "encoding": "slots14" if problem.grid.width == 14 else "exact_minutes",
            "revision": problem.revision, "cache_hit": cache_hit,
            "stats": dict(search.stats, work=search.control.work,
                          elapsed_seconds=round(monotonic() - search.control.started, 3)),
            "diagnostics": search.diagnostic if not schedules else []}


def optimize(courses, preferences, constraints=None, limits=None, cancel=None, progress=None):
    constraints, limits = constraints or Constraints(), limits or Limits()
    control = Control(limits)
    if cancel is not None:
        control.cancel = cancel
    try:
        problem, hit = prepare(courses, constraints, control)
    except Interrupted as error:
        return {"total": None, "total_exact": False, "found": 0, "schedules": [],
                "status": str(error), "optimal": False, "diagnostics": [], "stats": {"work": control.work}}
    def report(search):
        if progress:
            progress(serialize_result(search, hit, running=True))
    search = Search(problem, preferences, control, not constraints.allow_registration_overlaps, report).run()
    if search.strict and search.status == "complete" and not search.heap and (constraints.skipped or constraints.replacements):
        search = Search(problem, preferences, control, False, report).run()
    return serialize_result(search, hit)
