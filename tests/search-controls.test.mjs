import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchStatus } from '../web/scripts/search-controls.js';

test('partial results never claim optimality or absence of a solution', () => {
  for (const status of ['cancelled', 'time_limit', 'node_limit', 'memory_limit', 'running']) {
    const message = searchStatus({status, optimal:false, total:null, schedules:[]});
    assert.ok(message.length);
    assert.ok(!message.includes('אין מערכת'));
    assert.ok(!message.includes('אומתו'));
  }
});
test('count and proof status distinguish bounded top-K from enumeration', () => {
  assert.match(searchStatus({status:'complete', optimal:true, total_exact:false, total:null, schedules:[{}]}), /אומתו/);
  assert.match(searchStatus({status:'complete', optimal:true, total_exact:true, total:42, schedules:[{}]}), /42/);
  assert.match(searchStatus({status:'complete', optimal:true, total_exact:true, total:0, schedules:[]}), /אין מערכת/);
});
