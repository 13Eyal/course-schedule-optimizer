"""Reproducible comparison with exhaustive enumeration under the same rules."""
import json
from pathlib import Path
from statistics import median
import sys
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.models import Course, CourseComponent, ComponentType, Group, Session, Day, PriorityType, Preferences
from src.bitmasks import SLOTS
from src.search import optimize
from src.search_model import Limits, clear_preparation_cache
from src.solver import generate_schedules
from src.scoring import evaluate_schedules


def main():
    courses = [Course(str(c), str(c), 3, {ComponentType.LECTURE: CourseComponent(ComponentType.LECTURE,
        [Group(str(g), 'Benchmark', PriorityType.HIGH if g == 0 else PriorityType.LOW,
               [Session(Day(c + 1), *SLOTS[g], True)]) for g in range(8)])}) for c in range(5)]
    prefs = Preferences(0, 0, 0, 0, 100, 0)
    records = []
    for _ in range(3):
        clear_preparation_cache()
        start = perf_counter()
        exhaustive = evaluate_schedules(generate_schedules(courses), prefs)
        baseline = perf_counter() - start
        start = perf_counter()
        result = optimize(courses, prefs, limits=Limits(top_k=1))
        improved = perf_counter() - start
        assert result['optimal'] and result['schedules'][0]['score'] == exhaustive[0].score
        records.append((baseline, improved))
    print(json.dumps({'case': '5 courses x 8 nonconflicting groups; one highest-priority group per course',
        'repetitions': len(records), 'valid_schedules': len(exhaustive),
        'exhaustive_median_seconds': round(median(r[0] for r in records), 6),
        'top1_median_seconds': round(median(r[1] for r in records), 6),
        'search': result['stats'], 'note': 'Synthetic favorable case, not a universal speedup estimate.'}, indent=2))


if __name__ == '__main__':
    main()
