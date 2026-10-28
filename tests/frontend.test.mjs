import { test } from "node:test";
import assert from "node:assert/strict";
import {
  layoutSessions,
  toCSV,
  formatTime,
  weekLoad,
} from "../web/scripts/api.js";

test('week previews merge overlapping optional meetings and preserve free days', () => {
  assert.deepEqual(weekLoad([
    {day: 1, start: 540, end: 660},
    {day: 1, start: 600, end: 690},
    {day: 3, start: 600, end: 630},
    {day: 3, start: 660, end: 720},
  ]), [150, 0, 90, 0, 0]);
});

test("overlapping optional sessions occupy separate lanes; touching sessions share one", () => {
  const sessions = [
    { start: 540, end: 600 },
    { start: 570, end: 630 },
    { start: 630, end: 690 },
  ];
  const result = layoutSessions(sessions);
  assert.deepEqual(
    result.map((s) => [s.lane, s.lanes]),
    [
      [0, 2],
      [1, 2],
      [0, 1],
    ],
  );
  assert.equal(sessions[0].lane, undefined);
});
test("nested overlaps and independent clusters retain correct lane counts", () => {
  const result = layoutSessions([
    { start: 540, end: 780 },
    { start: 600, end: 660 },
    { start: 660, end: 720 },
    { start: 800, end: 820 },
  ]);
  assert.deepEqual(
    result.map((s) => [s.lane, s.lanes]),
    [
      [0, 2],
      [1, 2],
      [1, 2],
      [0, 1],
    ],
  );
  assert.deepEqual(layoutSessions([]), []);
});
test("CSV quotes imported text, preserves Hebrew and neutralizes formulas", () => {
  const csv = toCSV({
    sessions: [
      {
        name: "=SUM(1,2)",
        course_id: "001",
        type: "lecture",
        group_id: "A",
        lecturer: 'אדם "כהן"',
        day: 1,
        start: 510,
        end: 600,
        mandatory: true,
      },
    ],
  });
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(csv.includes('"אדם ""כהן"""'));
  assert.ok(csv.includes('"08:30"'));
  assert.equal(formatTime(0), "00:00");
});
