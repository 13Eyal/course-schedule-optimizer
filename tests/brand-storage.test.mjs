import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../web/scripts/brand-storage.js',import.meta.url),'utf8');
function open(values, canWrite=true) {
  const stored=new Map(Object.entries(values));
  const context={localStorage:{
    getItem:key=>stored.get(key)??null,
    setItem:(key,value)=>{if(!canWrite)throw new Error('storage full');stored.set(key,value);},
    removeItem:key=>stored.delete(key),
  }};
  runInNewContext(source,context);return {stored,storage:context.CarpedIOStorage};
}
test('rebranding migrates existing grades and preferences without changing their contents',()=>{
  const grades=JSON.stringify({version:1,actual:[{name:'Test',credits:4,grade:81}],planned:[],target:85});
  const {stored,storage}=open({'yael-grades-v1':grades,'forma-theme':'dark','forma-motion':'off','forma-calendar-view':'agenda'});
  assert.equal(storage.read('carpedio-grades-v1'),grades);
  assert.equal(storage.read('carpedio-theme'),'dark');
  assert.equal(storage.read('carpedio-motion'),'off');
  assert.equal(storage.read('carpedio-calendar-view'),'agenda');
  assert.equal(stored.has('yael-grades-v1'),false);
});
test('existing new data takes precedence and a subsequent save removes obsolete storage',()=>{
  const {stored,storage}=open({'yael-grades-v1':'old','carpedio-grades-v1':'new'});
  assert.equal(storage.read('carpedio-grades-v1'),'new');
  storage.write('carpedio-grades-v1','updated');
  assert.equal(stored.get('carpedio-grades-v1'),'updated');
  assert.equal(stored.has('yael-grades-v1'),false);
});
test('failed migration leaves old grades readable and optional storage never blocks initialization',()=>{
  const {stored,storage}=open({'yael-grades-v1':'saved'},false);
  assert.equal(storage.read('carpedio-grades-v1'),'saved');
  assert.equal(stored.get('yael-grades-v1'),'saved');
  assert.equal(stored.has('carpedio-grades-v1'),false);
  assert.throws(()=>storage.write('carpedio-grades-v1','new'));
  const context={};runInNewContext(source,context);
  assert.equal(typeof context.CarpedIOStorage.read,'function');
});
