import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseMatches, agendaDays } from '../web/scripts/planner.js';

test('course search matches name and identifier without case or whitespace sensitivity', () => {
  const course={id:'CS-101',name:'מבוא למדעי המחשב'};
  assert.equal(courseMatches(course,'  מבוא cs-101  '),true);
  assert.equal(courseMatches(course,''),true);
  assert.equal(courseMatches(course,'מבוא פיזיקה'),false);
  assert.equal(courseMatches({id:'ＡＢＣ',name:'Test'},'abc test'),true);
});

test('agenda sorts meetings without mutating input and merges overlapping occupied time', () => {
  const sessions=[{day:1,start:600,end:690},{day:1,start:540,end:660},{day:3,start:600,end:630}];
  const original=structuredClone(sessions);
  const days=agendaDays(sessions);
  assert.equal(days.length,5);
  assert.deepEqual(days.map(d=>d.minutes),[150,0,30,0,0]);
  assert.deepEqual(days[0].sessions.map(s=>s.start),[540,600]);
  assert.deepEqual(days[1].sessions,[]);
  assert.deepEqual(sessions,original);
  assert.deepEqual(agendaDays([]).map(d=>d.minutes),[0,0,0,0,0]);
});
