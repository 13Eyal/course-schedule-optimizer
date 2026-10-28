import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRecord,summarize,scenario,requirement,retake,importRows,detectColumns,detectHeader} from '../web/scripts/grade-math.js';
const row=(grade,credits=3,extra={})=>({id:'a',name:'קורס',code:'',grade,credits,included:true,...extra});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('weighted average counts zero grades and excludes unchecked, ungraded and zero-credit courses',()=>{
  const result=summarize([row(80,4),row(90,2),row(0,2),row(100,2,{included:false}),row(null,3,{included:false}),row(100,0)]);
  near(result.average,62.5);assert.equal(result.credits,8);assert.equal(result.count,3);assert.equal(result.excluded,3);
  assert.equal(summarize([]).average,null);assert.equal(summarize([row(100,0)]).average,null);
});
test('future courses, fixed other grades and goal arithmetic use unrounded inputs',()=>{
  const actual=[row(80,4),row(90,2,{id:'b'})],planned=[row(90,3,{id:'f'}),row(70,1,{id:'g'})];
  const result=scenario(actual,planned,85,'f');
  near(result.average,84);near(result.base.average,500/6);near(result.required.raw,87.5);
  near(result.focus.required.raw,280/3);assert.equal(result.focus.required.minimum,94);
  near(result.maximum,90);near(result.focus.points[100].average,87);
  assert.equal(actual[0].grade,80);assert.equal(planned[0].grade,90);
});
test('already meeting a target does not mean any future grade preserves it',()=>{
  const result=scenario([row(85,60)],[row(85,3,{id:'f'})],85,'f');
  assert.equal(result.required.minimum,85);assert.equal(result.required.status,'possible');
  assert.equal(scenario([row(95,60)],[row(0,3,{id:'f'})],85,'f').required.status,'guaranteed');
});
test('impossible targets, empty plans and all-excluded data are explicit',()=>{
  const result=scenario([row(70,60)],[row(100,3,{id:'f'})],90,'f');
  assert.equal(result.required.status,'impossible');assert.equal(result.required.minimum,null);
  assert.equal(scenario([],[],85,null).average,null);
  assert.equal(scenario([row(50)],[],85,null).required,null);
  near(scenario([],[row(80,4,{id:'f'})],85,'f').required.raw,85);
  assert.equal(scenario([],[row(80,4,{id:'f',included:false})],85,'f').focus,null);
  assert.equal(requirement(0,1,1,100).minimum,100);
});
test('retakes replace weight rather than adding credits; highest policy never lowers a grade',()=>{
  const actual=[row(60,4),row(100,2,{id:'b'})];
  near(retake(actual,'a',90).average,560/6);
  near(retake(actual,'a',50,'highest').average,440/6);
  near(retake(actual,'a',50,'replace').average,400/6);
  assert.equal(retake(actual,'missing',90),null);
});
test('required integer score achieves the target and the preceding integer does not',()=>{
  for(let i=1;i<=100;i++){
    const actual=[row(i%101,1+i%17)],planned=[row(80,1+i%7,{id:'f'})],target=70+i%21;
    const result=scenario(actual,planned,target,'f'),req=result.required;
    if(req.status==='possible'){
      const achieved=scenario(actual,[{...planned[0],grade:req.minimum}],target,'f').average;
      assert.ok(achieved+1e-9>=target);
      if(req.minimum>0)assert.ok(scenario(actual,[{...planned[0],grade:req.minimum-1}],target,'f').average<target);
    }
  }
});
test('grade validation preserves IDs, decimal credits, explicit exclusions and boundaries',()=>{
  const parsed=normalizeRecord({name:' מבחן ',code:'00123',credits:'2,5',grade:'0'});
  assert.deepEqual(parsed,{name:'מבחן',code:'00123',credits:2.5,grade:0,included:true});
  assert.equal(normalizeRecord({name:'פטור',credits:3,grade:'עבר'}).included,false);
  for(const grade of [-1,101,Infinity,NaN,true,'90%'])assert.throws(()=>normalizeRecord({name:'x',credits:3,grade}));
  assert.throws(()=>normalizeRecord({name:'x',credits:3,grade:'',included:true}));
  assert.throws(()=>normalizeRecord({name:'x',credits:0,grade:80},true));
});
test('Excel header mapping and preview preserve row numbers and report invalid rows',()=>{
  const rows=[{number:1,cells:['גיליון ציונים']},{number:3,cells:['שם קורס','קוד קורס','נק״ז','ציון','נכלל בממוצע']},
    {number:4,cells:['א','001',4,0,'כן']},{number:7,cells:['ב','002',2,'פטור','לא']},{number:8,cells:['סך הכל',null,'oops',null]}];
  const header=detectHeader(rows);assert.equal(header,1);
  const mapping=detectColumns(rows[header].cells),result=importRows(rows,header,mapping);
  assert.equal(result.length,3);assert.equal(result[0].record.grade,0);assert.equal(result[0].record.code,'001');
  assert.equal(result[1].record.included,false);assert.equal(result[1].number,7);assert.match(result[2].error,/נק״ז/);
  assert.throws(()=>importRows(rows,1,{...mapping,grade:-1}),/עמודות/);
  assert.throws(()=>importRows(rows,1,{...mapping,grade:mapping.credits}),/שונה/);
});
