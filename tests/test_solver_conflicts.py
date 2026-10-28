import unittest

from src.models import Day, Group, PriorityType, Session
from src.solver import groups_conflict, groups_overlap


class ConflictRegressionTests(unittest.TestCase):
    def group(self, *meetings):
        return Group('test', 'test', PriorityType.MEDIUM,
                     [Session(Day.SUNDAY, start, end, mandatory)
                      for start, end, mandatory in meetings])

    def test_required_overlap_and_touching_boundaries(self):
        a = self.group((540, 600, True))
        self.assertTrue(groups_conflict(a, self.group((570, 630, True))))
        self.assertFalse(groups_conflict(a, self.group((600, 660, True))))

    def test_optional_meetings_do_not_hide_later_required_conflict(self):
        a = self.group((480, 530, False), (540, 610, True))
        b = self.group((480, 500, False), (570, 630, True))
        self.assertTrue(groups_conflict(a, b))
        self.assertTrue(groups_conflict(a, self.group((540, 630, False))))
        self.assertTrue(groups_conflict(self.group((540, 630, False)), a))
        self.assertTrue(groups_overlap(a, self.group((540, 630, False))))

    def test_all_optional_and_empty_groups_terminate(self):
        a = self.group((540, 630, False))
        self.assertTrue(groups_conflict(a, a))
        self.assertFalse(groups_conflict(a, self.group()))

    def test_numeric_weekday_order_and_unsorted_input(self):
        a = Group('a', '', PriorityType.MEDIUM, [Session(Day.MONDAY, 540, 600, True), Session(Day.SUNDAY, 540, 600, True)])
        b = Group('b', '', PriorityType.MEDIUM, [Session(Day.MONDAY, 550, 590, False)])
        self.assertTrue(groups_conflict(a, b))
