"""Small exhaustive reference API. Production top-K search lives in src.search."""
from src.models import Course, Group, Day, CourseOption, Schedule, Session

def helper_for_conflict_overlap(group_a: Group, group_b: Group, mandatory_matters: bool) -> bool:
    sessions_a = sorted(group_a.sessions, key=lambda s: (s.day.num, s.start_minute))
    size_a: int = len(sessions_a)
    sessions_b = sorted(group_b.sessions, key=lambda s: (s.day.num, s.start_minute))
    size_b: int = len(sessions_b)
    
    i, j = 0, 0
    while i < size_a and j < size_b:
        
        if mandatory_matters and not sessions_a[i].mandatory:
            i += 1
            continue
        if mandatory_matters and not sessions_b[j].mandatory:
            j += 1
            continue
        
        if sessions_a[i].day == sessions_b[j].day:
            if Session.overlaps_with(sessions_a[i], sessions_b[j]): 
                return True
    
            if sessions_a[i].end_minute < sessions_b[j].end_minute:
                i += 1
            else:
                j += 1
            
        elif sessions_a[i].day.num < sessions_b[j].day.num:
            i += 1
                
        else:
            j += 1
    
    return False
        
"""================================================================================================"""

def groups_overlap(group_a: Group, group_b: Group) -> bool:
    return helper_for_conflict_overlap(group_a, group_b, False)

"""================================================================================================"""

def groups_conflict(group_a: Group, group_b: Group) -> bool:
    # Optional attendance is not an implicit permission to overlap.
    return groups_overlap(group_a, group_b)

"""================================================================================================"""

def option_conflicts_with_schedule(option: list[Group], selected_groups: list[Group]) -> bool:
    for group in option:
        for s_group in selected_groups:
            if groups_conflict(group, s_group):
                return True
    return False

"""================================================================================================"""

def generate_course_options(course: Course) -> list[CourseOption]:
    components = list(course.components.values())
    course_options: list[CourseOption] = []

    def backtrack(
        index: int,
        current_groups: list[Group],
        current_days: set[Day]
    ):
        if index == len(components):
            course_options.append(
                CourseOption(
                    groups = current_groups.copy(),
                    study_days = current_days.copy()
                )
            )
            return

        current_component = components[index]

        for group in current_component.groups:
            if not option_conflicts_with_schedule([group], current_groups):

                group_days = {session.day for session in group.sessions}

                current_groups.append(group)

                backtrack(
                    index + 1,
                    current_groups,
                    current_days | group_days
                )

                current_groups.pop()

    backtrack(0, [], set())

    return course_options

"""================================================================================================"""

def generate_schedules(courses: list[Course]) -> list[Schedule]:
    courses_options = [ 
        generate_course_options(course) 
        for course in courses 
    ]
    schedules: list[Schedule] = []
    
    def backtrack(
        index: int,
        selected_groups: list[Group],
        current_days: set[Day]
    ):
        if index == len(courses):
            schedules.append(
                Schedule(
                    groups = selected_groups.copy(),
                    study_days = current_days.copy()
                )
            )
            return
    
        current_course_options = courses_options[index]
    
        for option in current_course_options:
            if option_conflicts_with_schedule(
                option.groups, 
                selected_groups
            ):
                continue

            old_size = len(selected_groups)

            # choose
            selected_groups.extend(option.groups)

            # explore
            backtrack(
                index + 1,
                selected_groups,
                current_days | option.study_days
            )

            # unchoose
            del selected_groups[old_size:]
    
    backtrack(0, [], set())
    
    return schedules

"""================================================================================================"""
