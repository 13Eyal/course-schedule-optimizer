from src.data_loader import load_courses_from_excel
from src.solver import generate_schedules
from src.scoring import evaluate_schedules
from src.models import Preferences


def print_top_schedules(title, evaluated_schedules, amount=5):
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)

    for i, evaluated in enumerate(evaluated_schedules[:amount], start=1):
        metrics = evaluated.metrics

        print(f"\n#{i}  Score: {evaluated.score:.4f}")
        print(f"Study days:       {metrics.study_days}")
        print(f"Total gaps:       {metrics.total_gaps} min")
        print(f"Start penalty:    {metrics.start_penalty} min")
        print(f"Priority score:   {metrics.priority_score}")
        print(f"Max daily span:   {metrics.max_daily_minutes} min")


def run_test(
    name: str,
    schedules,
    preferences: Preferences
):
    evaluated = evaluate_schedules(schedules, preferences)
    print_top_schedules(name, evaluated)

    return evaluated


def main():
    courses = load_courses_from_excel("data/courses_sample.xlsx")
    schedules = generate_schedules(courses)

    print(f"Courses loaded: {len(courses)}")
    print(f"Valid schedules: {len(schedules)}")

    # -------------------------------------------------------------------------
    # Test 1: Only study days matter
    # -------------------------------------------------------------------------

    few_days_preferences = Preferences(
        preferred_start=10 * 60,
        study_days_weight=100,
        gaps_weight=0,
        start_time_weight=0,
        priority_weight=0,
        daily_span_weight=0
    )

    few_days_results = run_test(
        "TEST 1 - FEWEST STUDY DAYS",
        schedules,
        few_days_preferences
    )

    expected_min_days = min(
        len(schedule.study_days)
        for schedule in schedules
    )

    assert (
        few_days_results[0].metrics.study_days == expected_min_days
    ), "Study-days ranking failed"

    # -------------------------------------------------------------------------
    # Test 2: Only gaps matter
    # -------------------------------------------------------------------------

    gaps_preferences = Preferences(
        preferred_start=10 * 60,
        study_days_weight=0,
        gaps_weight=100,
        start_time_weight=0,
        priority_weight=0,
        daily_span_weight=0
    )

    gaps_results = run_test(
        "TEST 2 - FEWEST GAPS",
        schedules,
        gaps_preferences
    )

    min_gaps = min(
        evaluated.metrics.total_gaps
        for evaluated in gaps_results
    )

    assert (
        gaps_results[0].metrics.total_gaps == min_gaps
    ), "Gaps ranking failed"

    # -------------------------------------------------------------------------
    # Test 3: Only preferred start time matters
    # -------------------------------------------------------------------------

    start_preferences = Preferences(
        preferred_start=10 * 60,
        study_days_weight=0,
        gaps_weight=0,
        start_time_weight=100,
        priority_weight=0,
        daily_span_weight=0
    )

    start_results = run_test(
        "TEST 3 - PREFERRED START TIME",
        schedules,
        start_preferences
    )

    min_start_penalty = min(
        evaluated.metrics.start_penalty
        for evaluated in start_results
    )

    assert (
        start_results[0].metrics.start_penalty == min_start_penalty
    ), "Start-time ranking failed"

    # -------------------------------------------------------------------------
    # Test 4: Only group priority matters
    # -------------------------------------------------------------------------

    priority_preferences = Preferences(
        preferred_start=10 * 60,
        study_days_weight=0,
        gaps_weight=0,
        start_time_weight=0,
        priority_weight=100,
        daily_span_weight=0
    )

    priority_results = run_test(
        "TEST 4 - HIGHEST PRIORITY",
        schedules,
        priority_preferences
    )

    max_priority = max(
        evaluated.metrics.priority_score
        for evaluated in priority_results
    )

    assert (
        priority_results[0].metrics.priority_score == max_priority
    ), "Priority ranking failed"

    # -------------------------------------------------------------------------
    # Test 5: Only maximum daily span matters
    # -------------------------------------------------------------------------

    daily_span_preferences = Preferences(
        preferred_start=10 * 60,
        study_days_weight=0,
        gaps_weight=0,
        start_time_weight=0,
        priority_weight=0,
        daily_span_weight=100
    )

    daily_span_results = run_test(
        "TEST 5 - SHORTEST MAX DAILY SPAN",
        schedules,
        daily_span_preferences
    )

    min_daily_span = min(
        evaluated.metrics.max_daily_minutes
        for evaluated in daily_span_results
    )

    assert (
        daily_span_results[0].metrics.max_daily_minutes == min_daily_span
    ), "Daily-span ranking failed"

    # -------------------------------------------------------------------------
    # Test 6: Balanced preferences
    # -------------------------------------------------------------------------

    balanced_preferences = Preferences(
        preferred_start=10 * 60,
        study_days_weight=100,
        gaps_weight=70,
        start_time_weight=40,
        priority_weight=60,
        daily_span_weight=50
    )

    balanced_results = run_test(
        "TEST 6 - BALANCED PREFERENCES",
        schedules,
        balanced_preferences
    )

    # -------------------------------------------------------------------------
    # General score sanity check
    # -------------------------------------------------------------------------

    assert all(
        0.0 <= evaluated.score <= 1.0
        for evaluated in balanced_results
    ), "Score outside [0, 1]"

    assert all(
        balanced_results[i].score >= balanced_results[i + 1].score
        for i in range(len(balanced_results) - 1)
    ), "Results are not sorted by descending score"

    print("\n" + "=" * 80)
    print("ALL SCORING TESTS PASSED")
    print("=" * 80)


if __name__ == "__main__":
    main()