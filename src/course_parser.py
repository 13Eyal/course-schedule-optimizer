from src.models import ComponentType, PriorityType, Day, Course, CourseComponent, Group, Session
from typing import TypeVar
from src.data_loader import time_to_minutes
from enum import Enum
import math 

E = TypeVar("E", bound=Enum)

"""================================================================================================"""

def validate_text(field: str, raw: object) -> str:
    if not isinstance(raw, str):
        raise ValueError(f"{field}: must be a string")
    cleaned = raw.strip()
    if not cleaned:
        raise ValueError(f"{field}: must not be empty")
    return cleaned

"""================================================================================================"""

def validate_credits(raw: object) -> float:
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        raise ValueError("credits: must be a number")
    if not math.isfinite(raw) or raw < 0:
        raise ValueError("credits: must be a finite non-negative number")
    return float(raw)

"""================================================================================================"""

def validate_day(raw: object) -> Day:
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise ValueError("day: must be an integer")
    if not 1 <= raw <= 5:
        raise ValueError("day: must be between 1 and 5")
    return Day(raw)

"""================================================================================================"""
    
def validate_time(time_name: str, raw: object) -> int:
        return time_to_minutes(validate_text(time_name, raw))
    
"""================================================================================================"""

def validate_bool(raw: object) -> bool:
    if not isinstance(raw, bool):
        raise ValueError("mandatory: must be a boolean")
    return raw
    
"""================================================================================================"""

def validate_enum(field: str, raw: object, enum_cls: type[E]) -> E:
    cleaned = validate_text(field, raw).lower()

    try:
        return enum_cls(cleaned)
    except ValueError:
        valid_options = [member.value for member in enum_cls]
        raise ValueError(
            f"{field}: invalid value '{cleaned}'. "
            f"Valid options: {valid_options}"
        ) from None
        
"""================================================================================================"""

def validate_mandatory_fields(mandatory_fields: list[str], raw: dict) -> None:
    # JSON יכול להכיל גם רשימה או null; כל ישות כאן חייבת להגיע כמילון.
    if not isinstance(raw, dict):
        raise ValueError("input: must be an object")
    for field in mandatory_fields:
        if field not in raw:
            raise ValueError(f"missing field: {field}")
    
"""================================================================================================"""

def validate_non_empty_list(field: str, raw: object) -> list:
    if not isinstance(raw, list):
        raise ValueError(f"{field}: must be a list")
    if not raw:
        raise ValueError(f"{field}: must contain at least one item")
    return raw

"""================================================================================================"""

def parse_session(raw: dict) -> Session:
    validate_mandatory_fields(["day", "start", "end", "mandatory"], raw)
        
    return Session(
        day = validate_day(raw["day"]),
        start_minute = validate_time("start", raw["start"]),
        end_minute = validate_time("end", raw["end"]),
        mandatory = validate_bool(raw["mandatory"]),
        part = validate_text("part", raw["part"]) if raw.get("part") else "",
    )

"""================================================================================================"""

def parse_group(raw: dict) -> Group:
    validate_mandatory_fields(["group_id", "lecturer", "priority", "sessions"], raw)
    
    sessions: list[Session] = []
    
    raw_sessions = validate_non_empty_list("sessions", raw["sessions"])
    
    for session in raw_sessions:
        sessions.append(parse_session(session))
    
    sessions.sort(
        key=lambda session: (
            session.day.num,
            session.start_minute
        )
    ) 

    return Group( 
        group_id = validate_text("group_id", raw["group_id"]),
        lecturer = validate_text("lecturer", raw["lecturer"]),
        priority = validate_enum("priority", raw["priority"], PriorityType),
        sessions = sessions,
        full = validate_bool(raw["full"]) if "full" in raw else False,
    )

def parse_component(raw: dict) -> CourseComponent:
    validate_mandatory_fields(["component_type", "groups"], raw)
    
    groups: list[Group] = []
        
    raw_groups = validate_non_empty_list("groups", raw["groups"])
    
    seen_ids: set[str] = set()

    for raw_group in raw_groups:
        group = parse_group(raw_group)

        if group.group_id in seen_ids:
            raise ValueError(f"duplicate group_id: {group.group_id}")

        seen_ids.add(group.group_id)
        groups.append(group)
        
    return CourseComponent(
        component_type = validate_enum("component_type", raw["component_type"], ComponentType),
        groups = groups
    )

def parse_course(raw: dict) -> Course:
    validate_mandatory_fields(["course_id", "name", "credits", "components"], raw)
    
    components: dict[ComponentType, CourseComponent] = {}
            
    raw_components = validate_non_empty_list("components", raw["components"])
    
    for raw_component in raw_components:
        component = parse_component(raw_component)
        
        if component.component_type in components:
            raise ValueError(f"duplicate component_type: {component.component_type.value}")
        
        components[component.component_type] = component
            
    allowed = None
    if "allowed_combinations" in raw and raw["allowed_combinations"] is not None:
        if not isinstance(raw["allowed_combinations"], list):
            raise ValueError("allowed_combinations: must be a list")
        rows = []
        for combination in raw["allowed_combinations"]:
            if not isinstance(combination, dict) or set(combination) != {kind.value for kind in components}:
                raise ValueError("allowed_combinations: each row must name every component")
            for kind, identifier in combination.items():
                if identifier not in {g.group_id for g in components[ComponentType(kind)].groups}:
                    raise ValueError("allowed_combinations: unknown group")
            rows.append(tuple(sorted(combination.items())))
        allowed = tuple(sorted(set(rows)))
    return Course(
        course_id = validate_text("course_id", raw["course_id"]),
        name = validate_text("name", raw["name"]),
        credits = validate_credits(raw["credits"]),
        components = components,
        allowed_combinations = allowed,
    )


if __name__ == "__main__":
    raw_course = {
        "course_id": "0368",
        "name": "מבוא למדעי המחשב",
        "credits": 4,
        "components": [ {
            "component_type": "lecture",
            "groups": [ {
                "group_id": "01",
                "lecturer": "דנה לוי",
                "priority": "medium",
                "sessions": [ {
                    "day": 1,
                    "start": "08:30",
                    "end": "10:00",
                    "mandatory": True
                } ]
            } ]
        } ]
    }

    course = parse_course(raw_course)

    print(course.name)
    print(course.credits)

    lecture = course.components[ComponentType.LECTURE]
    group = lecture.groups[0]
    session = group.sessions[0]

    print(group.group_id)
    print(session.day)
    print(session.start_minute)
    print(session.end_minute)
