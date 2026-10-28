"""Exact timetable encoding. Bit indices follow the user's institutional grid.

Packed grid meeting: [0:14) occupancy, [14:18) weekday (zero based),
bit 18 mandatory, [19:22) component. Python ints are not fixed-width words.
Legacy off-grid datasets use an exact 1,440-bit day, never rounded slots.
"""
from dataclasses import dataclass
from functools import lru_cache

SLOTS = ((510, 570), (570, 630), (630, 690), (690, 740),
         (770, 830), (830, 890), (890, 950), (950, 1010),
         (1010, 1070), (1070, 1130), (1130, 1190), (1190, 1250),
         (1250, 1310), (1310, 1370))
SLOT_COUNT = 14
TIME_MASK = (1 << SLOT_COUNT) - 1
DAY_SHIFT = 14
MANDATORY_SHIFT = 18
TYPE_SHIFT = 19
TYPES = ("lecture", "tutorial", "lab")


def encode_session(day: int, start_slot: int, slot_count: int,
                   mandatory: bool, component: int = 0) -> int:
    if type(day) is not int or not 0 <= day < 5:
        raise ValueError("Invalid day")
    if (type(start_slot) is not int or type(slot_count) is not int
            or not 0 <= start_slot < 14 or not 1 <= slot_count <= 14 - start_slot):
        raise ValueError("Invalid slot range")
    if type(mandatory) is not bool or type(component) is not int or not 0 <= component < 3:
        raise ValueError("Invalid mandatory flag or component")
    return (((1 << slot_count) - 1) << start_slot
            | day << DAY_SHIFT | int(mandatory) << MANDATORY_SHIFT | component << TYPE_SHIFT)


def decode_session(value: int) -> tuple[int, int, bool, int]:
    if type(value) is not int or not 0 <= value < (1 << 22):
        raise ValueError("Invalid encoded session")
    mask, day, component = value & TIME_MASK, (value >> 14) & 15, (value >> 19) & 7
    compact = mask >> ((mask & -mask).bit_length() - 1) if mask else 0
    if not mask or day >= 5 or component >= 3 or compact & (compact + 1):
        raise ValueError("Invalid encoded session fields")
    return mask, day, bool(value & (1 << 18)), component


def weekly_mask(value: int) -> int:
    mask, day, _, _ = decode_session(value)
    return mask << (day * 14)


def slot_range(start: int, end: int) -> tuple[int, int] | None:
    for first, (slot_start, _) in enumerate(SLOTS):
        if start == slot_start:
            for last in range(first, 14):
                if end == SLOTS[last][1]:
                    return first, last - first + 1
    return None


@dataclass(frozen=True, slots=True)
class DayMetrics:
    start: int = 0
    end: int = 0
    occupied: int = 0
    gaps: tuple[int, ...] = ()

    @property
    def span(self):
        return self.end - self.start


def _metrics(intervals) -> DayMetrics:
    start = end = occupied = 0
    gaps = []
    for first, last in intervals:
        if not occupied:
            start = first
        elif first > end:
            gaps.append(first - end)
        occupied += max(0, last - max(first, end))
        end = max(end, last)
    return DayMetrics(start, end, occupied, tuple(gaps))


# A small, shared table; padding/empty days are represented by entry zero.
DAY_TABLE = tuple(_metrics(SLOTS[i] for i in range(14) if mask & (1 << i))
                  for mask in range(1 << 14))


@lru_cache(maxsize=16384)
def minute_metrics(mask: int) -> DayMetrics:
    intervals = []
    while mask:
        first = (mask & -mask).bit_length() - 1
        shifted = mask >> first
        length = ((shifted ^ (shifted + 1)).bit_length() - 1)
        intervals.append((first, first + length))
        mask &= ~(((1 << length) - 1) << first)
    return _metrics(intervals)


@dataclass(frozen=True, slots=True)
class TimeGrid:
    width: int = 14

    @property
    def day_mask(self):
        return (1 << self.width) - 1

    def interval_mask(self, day: int, start: int, end: int) -> int:
        if not 0 <= day < 5 or not 0 <= start < end <= 1440:
            raise ValueError("Invalid meeting time")
        if self.width == 14:
            slots = slot_range(start, end)
            if slots is None:
                raise ValueError("Meeting does not match the institutional grid")
            first, length = slots
            mask = ((1 << length) - 1) << first
        else:
            slots = slot_range(start, end)
            if slots:
                first, length = slots
                mask = sum(((1 << (b - a)) - 1) << a for a, b in SLOTS[first:first + length])
            else:
                mask = ((1 << (end - start)) - 1) << start
        return mask << (day * self.width)

    def blocked_mask(self, intervals) -> int:
        result = 0
        for day, start, end in intervals:
            if self.width == 14:
                mask = sum(1 << i for i, (a, b) in enumerate(SLOTS) if a < end and start < b)
                result |= mask << (day * 14)
            else:
                result |= (((1 << (end - start)) - 1) << start) << (day * self.width)
        return result

    def pack(self, day, start, end, mandatory, component):
        mask = self.interval_mask(day, start, end) >> (day * self.width)
        return mask | day << self.width | int(mandatory) << (self.width + 4) | component << (self.width + 5)

    def metrics(self, mask: int) -> DayMetrics:
        return DAY_TABLE[mask] if self.width == 14 else minute_metrics(mask)

    def days(self, mask: int) -> tuple[int, ...]:
        return tuple((mask >> (day * self.width)) & self.day_mask for day in range(5))

    def update_days(self, current: tuple[int, ...], added: int) -> tuple[int, ...]:
        return tuple(old | new for old, new in zip(current, self.days(added)))
