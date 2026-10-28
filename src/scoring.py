"""Stable, target-based penalties, independent of other candidate schedules."""
from src.bitmasks import TimeGrid, slot_range
from src.models import ScheduleMetrics, EvaluatedSchedule

WEIGHTS = ("study_days_weight", "gaps_weight", "start_time_weight", "priority_weight", "daily_span_weight")


def metrics_from_days(grid, days, priority, preferences):
    values = [grid.metrics(mask) for mask in days if mask]
    gaps = sum(gap for value in values for gap in value.gaps
               if not preferences.break_min <= gap <= preferences.break_max)
    return ScheduleMetrics(len(values), gaps,
        sum(max(0, preferences.preferred_start - value.start) for value in values),
        priority, max((value.span for value in values), default=0))


def penalties(metrics, preferences, group_count):
    return {
        "study_days": max(0, metrics.study_days - preferences.target_days) / 4,
        "gaps": max(0, metrics.total_gaps - preferences.target_gaps) / 120,
        "start_time": metrics.start_penalty / 120,
        "priority": max(0, 3 * group_count - metrics.priority_score) / max(1, 2 * group_count),
        "daily_span": max(0, metrics.max_daily_minutes - preferences.target_daily_span) / 480,
    }


def cost(metrics, preferences, group_count):
    weights = tuple(getattr(preferences, key) for key in WEIGHTS)
    if sum(weights) <= 0:
        raise ValueError("At least one preference weight must be greater than 0")
    return sum(w * p for w, p in zip(weights, penalties(metrics, preferences, group_count).values())) / sum(weights)


def score(metrics, preferences, group_count):
    return 1 / (1 + cost(metrics, preferences, group_count))


def calculate_schedule_metrics(schedule, preferences):
    sessions = [s for g in schedule.groups for s in g.sessions]
    grid = TimeGrid(14 if all(slot_range(s.start_minute, s.end_minute) for s in sessions) else 1440)
    mask = 0
    for s in sessions:
        mask |= grid.interval_mask(s.day.num - 1, s.start_minute, s.end_minute)
    return metrics_from_days(grid, grid.days(mask), calculate_priority_score(schedule), preferences)


def evaluate_schedules(schedules, preferences):
    results = []
    for schedule in schedules:
        metrics = calculate_schedule_metrics(schedule, preferences)
        results.append(EvaluatedSchedule(schedule, metrics, score(metrics, preferences, len(schedule.groups))))
    return sorted(results, key=lambda value: -value.score)


def calculate_priority_score(schedule):
    return sum(group.priority.int_val for group in schedule.groups)
