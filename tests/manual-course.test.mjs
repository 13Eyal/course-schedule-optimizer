import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCourseDraft} from '../web/scripts/manual-course.js';

const slots = [[510,570],[570,630],[630,690],[690,740],[770,830],[830,890],
  [890,950],[950,1010],[1010,1070],[1070,1130],[1130,1190],[1190,1250],[1250,1310],[1310,1370]];
const meeting = (day = '1', first = '0', last = '1') => ({day,first,last,mandatory:true,part:''});
const group = (type = 'lecture', id = '01') => ({type,group_id:id,lecturer:'דנה לוי',
  priority:'medium',full:false,sessions:[meeting()]});
const draft = () => ({course_id:'00368',name:' מבוא למדעי המחשב ',credits:'3.5',groups:[group()]});

test('manual draft preserves string IDs and assembles multiple groups and weekly meetings', () => {
  const input = draft();
  input.groups[0].sessions.push({...meeting('3','3','4'),mandatory:false,part:' חלק ב׳ '});
  input.groups.push({...group('lecture','02'),full:true}, group('tutorial'));
  const result = buildCourseDraft(input, slots);
  assert.equal(result.course_id, '00368');
  assert.equal(result.name, 'מבוא למדעי המחשב');
  assert.equal(result.credits, 3.5);
  assert.deepEqual(result.components.map(c => [c.component_type,c.groups.map(g=>g.group_id)]),
    [['lecture',['01','02']],['tutorial',['01']]]);
  assert.deepEqual(result.components[0].groups[0].sessions[1],
    {day:3,start:'11:30',end:'13:50',mandatory:false,part:'חלק ב׳'});
  assert.equal(result.components[0].groups[1].full,true);
  assert.equal(result.allowed_combinations,undefined); // Never assume all registrations are compatible.
});

test('last legal slot and back-to-back meetings remain valid', () => {
  const input = draft();
  input.groups[0].sessions = [meeting('5','12','12'),meeting('5','13','13')];
  assert.deepEqual(buildCourseDraft(input, slots).components[0].groups[0].sessions.map(s=>[s.start,s.end]),
    [['20:50','21:50'],['21:50','22:50']]);
});

test('invalid IDs, credits, time ranges and within-group collisions are actionable', () => {
  assert.throws(()=>buildCourseDraft(draft(),slots,['00368']),/כבר קיים/);
  for (const credits of ['', '-1', 'Infinity'])
    assert.throws(()=>buildCourseDraft({...draft(),credits},slots),/נקודות זכות/);
  for (const sessions of [[meeting('1','4','2')],[meeting('1','0','14')]])
    assert.throws(()=>buildCourseDraft({...draft(),groups:[{...group(),sessions}]},slots),/סיום/);
  assert.throws(()=>buildCourseDraft({...draft(),groups:[{...group(),sessions:[meeting(),meeting('1','1','2')]}]},slots),/חופפים/);
  assert.throws(()=>buildCourseDraft({...draft(),groups:[group(),group()]},slots),/יותר מפעם אחת/);
  assert.throws(()=>buildCourseDraft({...draft(),groups:[{...group(),lecturer:'  '}]},slots),/שם מרצה/);
});
