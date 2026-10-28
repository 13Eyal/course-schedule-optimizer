"""Independent exhaustive oracles: optimized pruning must preserve exact top-K."""
from dataclasses import replace
from itertools import product
import random
from threading import Event
import unittest

from src.bitmasks import SLOTS, DAY_TABLE, TimeGrid, encode_session, decode_session, weekly_mask, slot_range
from src.models import Course, CourseComponent, ComponentType, Group, Session, Day, PriorityType, Preferences
from src.search import optimize, Search
from src.search_model import Constraints, Limits, Control, meeting_id, clear_preparation_cache, prepare


PREFS = Preferences(600, 100, 70, 40, 60, 50)


def course(identifier, groups):
    return Course(identifier, identifier, 3, {ComponentType.LECTURE: CourseComponent(ComponentType.LECTURE, groups)})


def group(identifier, day, first, count=1, priority=PriorityType.MEDIUM, mandatory=True):
    return Group(identifier, identifier, priority,
                 [Session(Day(day + 1), SLOTS[first][0], SLOTS[first + count - 1][1], mandatory)])


def occupied_minutes(session):
    slots = slot_range(session.start_minute, session.end_minute)
    if slots is None:
        return set(range(session.start_minute, session.end_minute))
    first, count = slots
    return {minute for a, b in SLOTS[first:first + count] for minute in range(a, b)}


def oracle(courses, preferences):
    """No masks, solver, lookup table, or production score function."""
    variables = [sorted(component.groups, key=lambda g: g.group_id)
                 for c in sorted(courses, key=lambda c: c.course_id)
                 for _, component in sorted(c.components.items(), key=lambda item: item[0].value)]
    results = []
    for indices in product(*(range(len(groups)) for groups in variables)):
        groups = [values[i] for values, i in zip(variables, indices)]
        days = [set() for _ in range(5)]
        valid = True
        for g in groups:
            for session in g.sessions:
                minutes = occupied_minutes(session)
                day = days[session.day.num - 1]
                if day & minutes:
                    valid = False
                day.update(minutes)
        if not valid:
            continue
        spans, gaps, early = [], 0, 0
        for day in days:
            if not day:
                continue
            ordered = sorted(day)
            spans.append(ordered[-1] + 1 - ordered[0])
            early += max(0, preferences.preferred_start - ordered[0])
            for a, b in zip(ordered, ordered[1:]):
                gap = b - a - 1
                if gap and not preferences.break_min <= gap <= preferences.break_max:
                    gaps += gap
        priority = sum(g.priority.int_val for g in groups)
        metrics = dict(study_days=len(spans), total_gaps=gaps, start_penalty=early,
                       priority_score=priority, max_daily_minutes=max(spans, default=0))
        weights = [preferences.study_days_weight, preferences.gaps_weight, preferences.start_time_weight,
                   preferences.priority_weight, preferences.daily_span_weight]
        penalties = [max(0, len(spans) - preferences.target_days) / 4,
                     max(0, gaps - preferences.target_gaps) / 120, early / 120,
                     (3 * len(groups) - priority) / max(1, 2 * len(groups)),
                     max(0, max(spans, default=0) - preferences.target_daily_span) / 480]
        cost = sum(w * p for w, p in zip(weights, penalties)) / sum(weights)
        results.append((cost, indices, metrics))
    return sorted(results, key=lambda x: (x[0], x[1]))


class BitmaskTests(unittest.TestCase):
    def test_packing_roundtrip_and_field_isolation(self):
        for day, first, mandatory, kind in product(range(5), range(14), (True, False), range(3)):
            for count in range(1, 15 - first):
                value = encode_session(day, first, count, mandatory, kind)
                self.assertLess(value, 1 << 22)
                mask, unpacked_day, required, component = decode_session(value)
                self.assertEqual((unpacked_day, required, component), (day, mandatory, kind))
                self.assertEqual(mask, sum(1 << i for i in range(first, first + count)))
                self.assertEqual(weekly_mask(value), mask << (day * 14))
        self.assertFalse(weekly_mask(encode_session(0, 0, 1, True)) & weekly_mask(encode_session(1, 0, 1, True)))
        for value in (0, -1, 1 << 22, 0b101, 1 | 7 << 14):
            with self.assertRaises(ValueError):
                decode_session(value)

    def test_all_day_table_entries_against_interval_oracle(self):
        for mask, metrics in enumerate(DAY_TABLE):
            intervals = [SLOTS[i] for i in range(14) if mask & (1 << i)]
            if not intervals:
                self.assertEqual(metrics.occupied, 0)
                continue
            self.assertEqual(metrics.occupied, sum(b - a for a, b in intervals))
            self.assertEqual(metrics.span, intervals[-1][1] - intervals[0][0])
            self.assertEqual(metrics.gaps, tuple(b[0] - a[1] for a, b in zip(intervals, intervals[1:]) if b[0] > a[1]))
        self.assertEqual(DAY_TABLE[(1 << 3) | (1 << 4)].gaps, (30,))


class SearchTests(unittest.TestCase):
    def test_random_top_k_and_exact_counts_against_independent_oracle(self):
        rng = random.Random(73651)
        for case in range(100):
            courses = [course(str(c), [group(str(g), rng.randrange(3), rng.randrange(7), rng.randrange(1, 3),
                        rng.choice(list(PriorityType)), bool(rng.randrange(2))) for g in range(3)]) for c in range(4)]
            prefs = replace(PREFS, break_min=20 if case % 2 else 0, break_max=40 if case % 2 else 0)
            expected = oracle(courses, prefs)
            for exact_count in (False, True):
                with self.subTest(case=case, exact=exact_count):
                    actual = optimize(courses, prefs, limits=Limits(top_k=3, exact_count=exact_count))
                    self.assertTrue(actual['optimal'])
                    self.assertEqual(len(actual['schedules']), min(3, len(expected)))
                    for got, (cost, indices, metrics) in zip(actual['schedules'], expected):
                        self.assertAlmostEqual(got['score'], 1 / (1 + cost))
                        self.assertEqual(got['metrics'], metrics)
                        self.assertEqual(tuple(int(s[2]) for s in got['selection']), indices)
                    if exact_count:
                        self.assertEqual(actual['total'], len(expected))

    def test_optional_conflicts_require_explicit_attendance_decision(self):
        courses = [course('a', [group('0', 0, 0, mandatory=False)]), course('b', [group('0', 0, 0)])]
        self.assertEqual(optimize(courses, PREFS)['total'], 0)
        skipped = meeting_id('a', 'lecture', '0', 0)
        result = optimize(courses, PREFS, Constraints(skipped=frozenset([skipped])))
        self.assertEqual(result['mode'], 'approved_overlaps')
        self.assertEqual(len(result['schedules'][0]['sessions']), 1)
        self.assertEqual(len(result['schedules'][0]['registration_sessions']), 2)

    def test_full_groups_blocked_time_and_lunch_break(self):
        g = group('0', 0, 3, 2)
        c = [course('a', [g])]
        self.assertEqual(optimize(c, PREFS, Constraints(blocked=((0, 740, 770),)))['total'], 1)
        self.assertEqual(optimize(c, PREFS, Constraints(blocked=((0, 739, 741),)))['total'], 0)
        g.full = True
        self.assertEqual(optimize(c, PREFS)['total'], 0)
        self.assertEqual(optimize(c, PREFS, Constraints(include_full=True))['total'], 1)

    def test_three_component_links_are_not_reduced_to_pairwise_rules(self):
        c = Course('a', 'a', 3, {kind: CourseComponent(kind, [group(str(g), day, 0) for g in range(2)])
                               for day, kind in enumerate(ComponentType)})
        with self.assertRaises(ValueError):
            optimize([c], PREFS)
        c.allowed_combinations = tuple(tuple((kind.value, str(g)) for kind, g in zip(ComponentType, row))
                                       for row in ((0,0,0), (0,1,1), (1,0,1), (1,1,0)))
        result = optimize([c], PREFS, limits=Limits(exact_count=True))
        self.assertEqual(result['total'], 4)
        self.assertTrue(all(sum(int(s[2]) for s in r['selection']) % 2 == 0 for r in result['schedules']))

    def test_replacement_requires_valid_link_and_whole_attendance_check(self):
        source = group('0', 0, 0)
        source.sessions.append(Session(Day.TUESDAY, 510, 570, True))
        target = group('1', 1, 0)
        a = course('a', [source, target])
        b = course('b', [group('0', 0, 0), group('1', 1, 0)])
        link = (meeting_id('a', 'lecture', '0', 0), meeting_id('a', 'lecture', '1', 0))
        result = optimize([a, b], PREFS, Constraints(replacements=(link,), allow_registration_overlaps=True), Limits(exact_count=True))
        replaced = [r for r in result['schedules'] if r['changes']]
        self.assertTrue(replaced)
        self.assertTrue(all(r['selection'][1][2] == '0' for r in replaced))
        invalid = (meeting_id('a', 'lecture', '1', 0), meeting_id('a', 'lecture', '0', 0))
        with self.assertRaises(ValueError):
            optimize([a, b], PREFS, Constraints(replacements=(invalid,)))

    def test_minute_fallback_is_exact_and_touching_meetings_do_not_conflict(self):
        a = course('a', [Group('0', '', PriorityType.MEDIUM, [Session(Day.SUNDAY, 540, 600, True)])])
        b = course('b', [Group('0', '', PriorityType.MEDIUM, [Session(Day.SUNDAY, 600, 630, True)])])
        result = optimize([a, b], PREFS)
        self.assertEqual(result['encoding'], 'exact_minutes')
        self.assertEqual(result['total'], 1)
        b.components[ComponentType.LECTURE].groups[0].sessions[0] = Session(Day.SUNDAY, 599, 630, True)
        self.assertEqual(optimize([a, b], PREFS)['total'], 0)

    def test_cache_revision_and_weight_change_do_not_reuse_old_top_k(self):
        clear_preparation_cache()
        courses = [course('a', [group('0', 0, 0, priority=PriorityType.HIGH), group('1', 0, 5, priority=PriorityType.LOW)])]
        priority = Preferences(600, 0, 0, 0, 100, 0)
        first = optimize(courses, priority, limits=Limits(top_k=1))
        second = optimize(courses, replace(priority, priority_weight=0, start_time_weight=100), limits=Limits(top_k=1))
        self.assertTrue(second['cache_hit'])
        self.assertNotEqual(first['schedules'][0]['selection'], second['schedules'][0]['selection'])
        courses[0].components[ComponentType.LECTURE].groups[0].lecturer = 'changed'
        third = optimize(courses, priority)
        self.assertFalse(third['cache_hit'])
        self.assertNotEqual(first['revision'], third['revision'])

    def test_cancel_and_limits_never_claim_infeasibility_or_optimality(self):
        courses = [course('a', [group('0', 0, 0)])]
        cancel = Event()
        cancel.set()
        result = optimize(courses, PREFS, cancel=cancel)
        self.assertEqual(result['status'], 'cancelled')
        self.assertFalse(result['optimal'])
        self.assertIsNone(result['total'])
        result = optimize(courses, PREFS, limits=Limits(nodes=0))
        self.assertEqual(result['status'], 'node_limit')

    def test_large_product_with_early_contradiction_is_not_rejected_by_product_size(self):
        courses = [course(str(c), [group(str(g), 0, 0) for g in range(10)]) for c in range(8)]
        result = optimize(courses, PREFS)
        self.assertEqual(result['total'], 0)
        self.assertTrue(result['optimal'])
        self.assertLess(result['stats']['work'], 1000)

    def test_bound_pruning_does_not_report_an_exact_total(self):
        courses = [course(str(c), [group(str(g), c, g, priority=PriorityType.HIGH if g == 0 else PriorityType.LOW)
                                  for g in range(5)]) for c in range(4)]
        result = optimize(courses, Preferences(0, 0, 0, 0, 100, 0), limits=Limits(top_k=1))
        self.assertGreater(result['stats']['bound_prunes'], 0)
        self.assertTrue(result['optimal'])
        self.assertIsNone(result['total'])
        self.assertFalse(result['total_exact'])

    def test_gap_can_be_filled_later_and_must_not_be_used_as_a_bound(self):
        a = course('a', [group('0', 0, 0), group('1', 0, 6)])
        b = course('b', [group('0', 0, 2)])
        c = course('c', [group('0', 0, 1)])
        prefs = Preferences(0, 0, 100, 0, 0, 0)
        expected = oracle([a, b, c], prefs)
        result = optimize([a, b, c], prefs, limits=Limits(top_k=1))
        self.assertEqual(result['schedules'][0]['metrics']['total_gaps'], 0)
        self.assertAlmostEqual(result['schedules'][0]['score'], 1 / (1 + expected[0][0]))

    def test_mixed_grid_mode_preserves_lunch_break_semantics(self):
        legal = group('0', 0, 3, 2)
        legacy = Group('0', '', PriorityType.MEDIUM, [Session(Day.MONDAY, 545, 565, True)])
        courses = [course('a', [legal]), course('b', [legacy])]
        expected = oracle(courses, PREFS)
        result = optimize(courses, PREFS, Constraints(blocked=((0, 740, 770),)))
        self.assertEqual(result['schedules'][0]['metrics'], expected[0][2])
        self.assertEqual(result['schedules'][0]['metrics']['total_gaps'], 30)
        parts = [s for s in result['schedules'][0]['sessions'] if s['course_id'] == 'a']
        self.assertEqual([(s['start'], s['end']) for s in parts], [(690, 740), (770, 830)])
        self.assertEqual(len({s['session_id'] for s in parts}), 1)

    def test_memory_budget_and_cached_choice_limit_are_enforced(self):
        courses = [course('a', [group(str(i), 0, i) for i in range(3)])]
        optimize(courses, PREFS)
        self.assertEqual(optimize(courses, PREFS, limits=Limits(choices=1))['status'], 'memory_limit')
        self.assertEqual(optimize(courses, PREFS, limits=Limits(memory_bytes=1))['status'], 'memory_limit')

    def test_day_metric_lookup_cache_is_bounded(self):
        from src.bitmasks import minute_metrics
        self.assertEqual(minute_metrics((1 << 10) - 1).occupied, 10)
        self.assertLessEqual(minute_metrics.cache_info().currsize, 16384)

    def test_dead_state_key_preserves_remaining_nary_links(self):
        c = Course('a', 'a', 3, {kind: CourseComponent(kind, [group(str(g), day, 0) for g in range(2)])
                               for day, kind in enumerate(ComponentType)})
        c.allowed_combinations = tuple(tuple((kind.value, str(g)) for kind, g in zip(ComponentType, row))
                                       for row in ((0,0,0), (0,1,1), (1,0,1), (1,1,0)))
        control = Control(Limits())
        problem, _ = prepare([c], Constraints(), control)
        search = Search(problem, PREFS, control)
        self.assertNotEqual(search.dead_key([1,3,3], 6), search.dead_key([2,3,3], 6))
