from dataclasses import dataclass, field
from typing import Any, List
from enum import Enum

"""================================================================================================"""

class ComponentType(Enum):
    LECTURE = "lecture"
    TUTORIAL = "tutorial"
    LAB = "lab"

"""================================================================================================"""

class PriorityType(Enum):
    LOW = ("low", 1)
    HIGH = ("high", 3)
    MEDIUM = ("medium", 2)

    def __init__(self, str_val: str, int_val: int):
            self.str_val = str_val
            self.int_val = int_val
        
    @classmethod
    def _missing_(cls, value: object) -> Any:
        if isinstance(value, str):
            value = value.strip().lower()
    
        for priority in cls:
            if value in (priority.str_val.lower(), priority.int_val):
                return priority
        return None

"""================================================================================================"""

class Day(Enum):
    SUNDAY = ("Sunday", "ראשון", 1)
    MONDAY = ("Monday", "שני", 2)
    TUESDAY = ("Tuesday", "שלישי", 3)
    WEDNESDAY = ("Wednesday", "רביעי", 4)
    THURSDAY = ("Thursday", "חמישי", 5)

    def __init__(self, en_name: str, he_name: str, num: int):
        self.en_name = en_name
        self.he_name = he_name
        self.num = num

    @classmethod
    def _missing_(cls, value: object) -> Any:
        if isinstance(value, str):
            value = value.strip().lower()

        for day in cls:
            if value in (day.en_name.lower(), day.he_name.lower(), day.num):
                return day
        return None

"""================================================================================================"""

@dataclass(frozen=True, slots=True)
class Session:
    day: Day
    start_minute: int
    end_minute: int
    mandatory: bool 
    part: str = ""

    def __post_init__(self):
        if self.start_minute >= self.end_minute:
            raise ValueError("Session start time must be before end time.")

    @property
    def duration_minutes(self) -> int:
        return self.end_minute - self.start_minute

    def overlaps_with(self, other: "Session") -> bool:
        """Checks whether two sessions overlap in time."""
        if self.day != other.day:
            return False

        return (max(self.start_minute, other.start_minute) 
                < min(self.end_minute, other.end_minute)
        )

"""================================================================================================"""

@dataclass(slots=True)
class Group:
    group_id: str
    lecturer: str
    priority: PriorityType
    sessions: list[Session]
    full: bool = False

"""================================================================================================"""

@dataclass(slots=True)
class CourseComponent:
    component_type: ComponentType
    groups: list[Group]

"""================================================================================================"""

@dataclass(slots=True)
class Course:
    course_id: str
    name: str
    credits: float
    components: dict[ComponentType, CourseComponent]
    # None: links are unknown; each row explicitly selects one group per component.
    allowed_combinations: tuple[tuple[tuple[str, str], ...], ...] | None = None
    
    #*  components = {
    #*      ComponentType.LECTURE: LectureComponent,
    #*      ComponentType.TUTORIAL: TutorialComponent,
    #*      ComponentType.LAB: LabComponent
    #*  }

"""================================================================================================"""

@dataclass(slots=True)
class CourseOption:
    groups: list[Group]
    study_days: set[Day]

"""================================================================================================"""

@dataclass(slots=True)
class Schedule:
    groups: list[Group]
    study_days: set[Day]
#    total_gaps: int
#    score: float

"""================================================================================================"""

@dataclass(frozen=True, slots=True)
class Preferences:
    preferred_start: int
    study_days_weight: int
    gaps_weight: int
    start_time_weight: int
    priority_weight: int
    daily_span_weight: int
    target_days: int = 1
    target_gaps: int = 0
    target_daily_span: int = 0
    break_min: int = 0
    break_max: int = 0

"""================================================================================================"""

@dataclass(frozen=True, slots=True)
class ScheduleMetrics:
    study_days: int
    total_gaps: int
    start_penalty: int
    priority_score: float
    max_daily_minutes: int

"""================================================================================================"""

@dataclass(slots=True)
class EvaluatedSchedule:
    schedule: Schedule
    metrics: ScheduleMetrics
    score: float = 0.0
