import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toCSV} from '../web/scripts/api.js';
test('English CSV localizes labels and preserves imported names with formula protection',()=>{
  const schedule={sessions:[{name:'=unsafe',course_id:'001',type:'lecture',group_id:'A',lecturer:'דנה',day:1,start:510,end:600,mandatory:true}]};
  const csv=toCSV(schedule,'en');
  assert.ok(csv.includes('"Course","Course ID","Type"'));
  assert.ok(csv.includes('"Lecture"'));
  assert.ok(csv.includes('"Sunday"'));
  assert.ok(csv.includes('"Yes"'));
  assert.ok(csv.includes('"דנה"'));
  assert.ok(csv.includes('"\'=unsafe"'));
  assert.ok(toCSV(schedule).includes('"קורס"'));
});
