from src.models import ComponentType, PriorityType, Day, Course, CourseComponent, Group, Session
from typing import Type, TypeVar, List, IO
from datetime import time
from enum import Enum 
import pandas as pd

E = TypeVar("E", bound=Enum)

def time_to_minutes(time_val) -> int:
    """
    Converts a time value (the string '08:30' or a datetime.time object)
    to minutes from the start of the day.
    """
    if isinstance(time_val, time):
        return time_val.hour * 60 + time_val.minute

    if isinstance(time_val, str):
        parts = time_val.strip().split(":")
        hours = int(parts[0])
        minutes = int(parts[1]) if len(parts) > 1 else 0
        if not 0 <= hours <= 23:
            raise ValueError(f"invalid hour: {hours}")
        if not 0 <= minutes <= 59:
            raise ValueError(f"invalid minutes: {minutes}")
        return hours * 60 + minutes

    raise ValueError(f"error ~ illegal time value: {time_val}")

"""================================================================================================"""

def str_to_enum(text: object, enum_cls: Type[E]) -> E:
    cleaned = str(text).strip().lower()
    try:
        return enum_cls(cleaned)
    except ValueError:
        valid_options = [e.value for e in enum_cls]
        raise ValueError(f"invalid input '{cleaned}'. valid options are: {valid_options}")

"""================================================================================================"""

def str_to_bool(text) -> bool:
    cleaned = str(text).strip().lower()

    true_values = {"true", "1", "כן", "yes", "אמת"}
    false_values = {"false", "0", "לא", "no", "שקר"}

    if cleaned in true_values:
        return True

    if cleaned in false_values:
        return False

    raise ValueError(f"invalid boolean value: '{text}'")

"""================================================================================================"""

def load_courses_from_excel(source: str | IO[bytes]) -> List[Course]:
    """
    Loads an Excel file, validates its data,
    and returns a list of Course objects.
    """

    df = pd.read_excel(source, dtype={"CourseID": str, "Group": str})
    
    # Ensure that all required columns are present.
    required_columns = {
        "CourseID", "Name", "Credits", "Type", "Group", "Lecturer",
        "Day", "Start", "End", "Mandatory", "Priority"
    }
    missing_cols = required_columns - set(df.columns)
    if missing_cols:
        raise ValueError(f"file missing columns: {missing_cols}")

    df['Credits'] = pd.to_numeric(df['Credits'])
    for column in required_columns:
        if df[column].isna().any():
            raise ValueError(f"missing value in {column}")

    courses: List[Course] = []

    for course_id, course_df in df.groupby("CourseID"):
        components: dict[ComponentType, CourseComponent] = {}

        if course_df["Name"].nunique() != 1:
            raise ValueError(f"inconsistent Name value for course {course_id}")
        if course_df["Credits"].nunique() != 1:
            raise ValueError(f"inconsistent Credits value for course {course_id}")
        
        for component_type, component_df in course_df.groupby("Type"):
            component_type_enum = str_to_enum(component_type, ComponentType)

            groups: List[Group] = []
    
            for group_id, group_df in component_df.groupby("Group"):
         
                if group_df["Lecturer"].nunique() != 1:
                    raise ValueError(f"inconsistent Lecturer value for group {group_id}")
                if group_df["Priority"].nunique() != 1:
                    raise ValueError(f"inconsistent Priority value for group {group_id}")
                if "Full" in group_df and group_df["Full"].map(str_to_bool).nunique() != 1:
                    raise ValueError(f"inconsistent Full value for group {group_id}")
                
                try:
                    sessions: List[Session] = []

                    for _, row in group_df.iterrows():
                        
                        start_min = time_to_minutes(row["Start"])
                        end_min = time_to_minutes(row["End"])
                        if end_min <= start_min:
                            raise ValueError(f"the end time must be after the start time in {course_id, component_type, group_id}")
                        
                        session = Session(
                            day = str_to_enum(row["Day"], Day),
                            start_minute = start_min,
                            end_minute = end_min,
                            mandatory = str_to_bool(row["Mandatory"])
                        )
                        sessions.append(session)

                except Exception as err:
                    raise ValueError(f"error processing line {course_id, component_type, group_id}: {err}")

                sessions.sort(
                    key=lambda session: (
                        session.day.num,
                        session.start_minute
                    )
                )

                group = Group(
                    group_id = str(group_id).strip(),
                    lecturer = str(group_df.iloc[0]["Lecturer"]).strip(),
                    priority = str_to_enum(group_df.iloc[0]["Priority"], PriorityType),
                    sessions = sessions,
                    full = str_to_bool(group_df.iloc[0]["Full"]) if "Full" in group_df else False,
                )
                groups.append(group)

            component = CourseComponent(
                component_type=component_type_enum,
                groups=groups
            )
            components[component_type_enum] = component

        course = Course(
            course_id = str(course_id).strip(),
            name = str(course_df.iloc[0]["Name"]).strip(),
            credits = float(course_df.iloc[0]["Credits"]),
            components = components
        )
        courses.append(course)
                
    return courses
