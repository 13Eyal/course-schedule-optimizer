import {api} from './api.js';
import {MAX_RECORDS, normalizeRecord, summarize, scenario, retake, detectHeader, detectColumns, importRows} from './grade-math.js';

const $ = selector => document.querySelector(selector);
const KEY = 'carpedio-grades-v1';
const state = {version:1, actual:[], planned:[], target:85, focusId:null};
let undo = null, editing = null, workbook = null, preview = [], importSelected = new Set();
let storageAvailable = true;
const fmt = value => value === null ? '—' : value.toLocaleString('he-IL',{maximumFractionDigits:2,minimumFractionDigits:0});
const averageText = value => value === null ? '—' : value.toLocaleString('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2});
const deltaText = value => value === null ? '' : `\u2066${value > 0 ? '+' : ''}${averageText(value)}\u2069 נקודות בממוצע`;
const id = () => crypto.randomUUID();

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function message(text = '', error = false) {
  const el = $('#grade-notice'); el.textContent = text; el.hidden = !text;
  el.classList.toggle('grade-error', error); el.setAttribute('role',error ? 'alert' : 'status');
}
function showError(selector, text = '') { const el = $(selector); el.textContent = text; el.hidden = !text; }
function button(text, action) { const el=node('button',text,'text-button'); el.type='button'; el.addEventListener('click',action); return el; }
function persist() {
  try { globalThis.CarpedIOStorage.write(KEY,JSON.stringify(state)); storageAvailable = true; }
  catch { storageAvailable = false; }
  $('#grade-storage').textContent = storageAvailable
    ? 'הנתונים נשמרים אוטומטית בדפדפן הזה. לייבוא ולגיבוי משתמשים בקובץ ציונים נפרד מקובץ מערכת השעות.'
    : 'לא ניתן לשמור בדפדפן הזה. אפשר לייצא ל־Excel כדי לשמור את הנתונים לפני סגירת הדף.';
}
function change(action) {
  undo = structuredClone(state); action(); persist(); render(); $('#grade-undo-bar').hidden = false;
}
function restore() {
  try {
    const saved = JSON.parse(globalThis.CarpedIOStorage.read(KEY) || 'null');
    if (!saved) return;
    if (saved.version !== 1 || !Array.isArray(saved.actual) || !Array.isArray(saved.planned) ||
        saved.actual.length+saved.planned.length > MAX_RECORDS || !Number.isFinite(saved.target) || saved.target<0 || saved.target>100)
      throw new Error('invalid');
    const used = new Set();
    const rows = (list,planned) => list.map(raw => {
      const identifier = typeof raw.id === 'string' && !used.has(raw.id) ? raw.id : id(); used.add(identifier);
      return {...normalizeRecord(raw,planned),id:identifier};
    });
    const actual=rows(saved.actual,false), planned=rows(saved.planned,true);
    Object.assign(state,{actual,planned,target:saved.target,focusId:saved.focusId});
    $('#grade-target').value = state.target;
  } catch {
    storageAvailable = false;
    $('#grade-storage').textContent='לא שוחזרו נתונים שמורים. לאחר ההזנה אפשר לייצא ל־Excel לגיבוי.';
    message('לא ניתן לשחזר את הנתונים השמורים. אפשר לייבא את קובץ הגיבוי או להתחיל רשימה חדשה.',true);
  }
}
function ensureCapacity(add, replaceKind = null) {
  const current = state.actual.length+state.planned.length-(replaceKind ? state[replaceKind].length : 0);
  if (current+add > MAX_RECORDS) throw new Error(`אפשר לשמור עד ${MAX_RECORDS} קורסים בסך הכול.`);
}

function openEditor(kind, record = null) {
  const form = $('#grade-record-form'); form.reset(); editing={kind,id:record?.id};
  $('#grade-editor-title').textContent = record ? 'עריכת קורס' : kind === 'planned' ? 'הוספת קורס עתידי' : 'הוספת ציון';
  $('#editor-grade-label').textContent = kind === 'planned' ? 'ציון צפוי' : 'ציון';
  $('#editor-included-label').textContent = kind === 'planned' ? 'נכלל בתרחיש' : 'נכלל בממוצע';
  $('#editor-grade-help').hidden = kind === 'planned';
  form.elements.grade.required = kind === 'planned';
  form.elements.credits.min = kind === 'planned' ? '0.01' : '0';
  if (record) {
    for (const name of ['name','code','credits','grade']) form.elements[name].value=record[name] ?? '';
    form.elements.included.checked=record.included;
  }
  showError('#grade-editor-error'); $('#grade-editor').showModal(); form.elements.name.focus();
}
$('#add-grade').addEventListener('click',()=>openEditor('actual'));
$('#add-future').addEventListener('click',()=>openEditor('planned'));
// Empty states carry the action that fills them.
document.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>$('#'+button.dataset.open).click()));
$('#close-grade-editor').addEventListener('click',()=>$('#grade-editor').close());
$('#grade-record-form').addEventListener('submit',event=>{
  event.preventDefault(); const form=event.currentTarget;
  try {
    const raw=Object.fromEntries(['name','code','credits','grade'].map(key=>[key,form.elements[key].value]));
    raw.included=form.elements.included.checked;
    const record={...normalizeRecord(raw,editing.kind==='planned'),id:editing.id || id()};
    if (!editing.id) ensureCapacity(1);
    change(()=>{
      state[editing.kind]=editing.id ? state[editing.kind].map(old=>old.id===editing.id ? record : old) : [...state[editing.kind],record];
      if (editing.kind==='planned') state.focusId=record.id;
    });
    $('#grade-editor').close(); message('הקורס נשמר. החישובים עודכנו.');
  } catch (error) { showError('#grade-editor-error',error.message); }
});

function renderRows(kind) {
  const body=$(`#${kind}-rows`); body.replaceChildren();
  const query=kind==='actual' ? $('#grade-filter').value.trim().toLocaleLowerCase() : '';
  const rows=state[kind].filter(row=>`${row.name} ${row.code}`.toLocaleLowerCase().includes(query));
  for (const row of rows) {
    const tr=node('tr'); if (!row.included || row.grade === null || row.credits===0) tr.className='grade-excluded';
    const included=node('input'); included.type='checkbox'; included.checked=row.included;
    included.disabled=row.grade===null; included.setAttribute('aria-label',`${kind==='actual' ? 'הכללת' : 'הכללה בתרחיש:'} ${row.name}`);
    included.addEventListener('change',()=>change(()=>{state[kind]=state[kind].map(old=>old.id===row.id ? {...old,included:included.checked} : old);}));
    const includeCell=node('td'); includeCell.append(included);
    const course=node('td'); course.append(node('span',row.name));
    if (row.code) course.append(node('small',row.code));
    if (row.grade===null) course.append(node('small','ללא ציון מספרי'));
    if (row.credits===0) course.append(node('small','ללא משקל בממוצע'));
    const actions=node('td');
    const edit=button('עריכה',()=>openEditor(kind,row)); edit.setAttribute('aria-label',`עריכת ${row.name}`);
    const remove=button('הסרה',()=>change(()=>{state[kind]=state[kind].filter(old=>old.id!==row.id);})); remove.setAttribute('aria-label',`הסרת ${row.name}`);
    actions.append(edit,remove);
    tr.append(includeCell,course,node('td',fmt(row.credits),'grade-numeric'),node('td',fmt(row.grade),'grade-numeric'),actions); body.append(tr);
  }
  const empty=$(kind==='actual' ? '#actual-empty' : '#future-empty'); empty.hidden=rows.length>0;
  if (kind==='actual') {
    empty.querySelector('span').textContent=state.actual.length ? 'לא נמצאו קורסים שמתאימים לחיפוש.' : 'עדיין אין ציונים. אפשר להוסיף קורס ידנית או לייבא קובץ Excel.';
    empty.querySelector('button').hidden=state.actual.length>0;
  }
}
function options(select, list, value) {
  const signature=JSON.stringify(list);
  if (select.dataset.signature!==signature) {
    select.replaceChildren();
    for (const [identifier,title] of list) {const option=node('option',title);option.value=identifier;select.append(option);}
    select.dataset.signature=signature;
  }
  if (value && list.some(([identifier])=>identifier===value)) select.value=value;
}
function requirementText(required, single = false) {
  if (!required) return 'הוסיפו קורסים עתידיים לחישוב הציון הדרוש.';
  if (required.status==='impossible') return 'היעד אינו אפשרי עם הנק״ז האלה, גם בציון 100.';
  if (required.status==='guaranteed') return 'היעד נשמר גם אם הציון העתידי יהיה 0.';
  const threshold=Math.ceil(required.raw*100-1e-9)/100;
  return single ? `בקורס הזה נדרש לפחות ${fmt(threshold)} — או ${required.minimum} בציון שלם.` : `נדרש ממוצע של לפחות ${fmt(threshold)} בקורסים העתידיים.`;
}
function svgNode(tag, attrs = {}, text) {
  const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
  if (text!==undefined) el.textContent=text;
  return el;
}
function drawChart(focus) {
  const host=$('#impact-chart');host.replaceChildren();
  if (!focus) return;
  const values=focus.points, low=Math.floor(values[0].average), high=Math.max(low+1,Math.ceil(values[100].average));
  const x=grade=>48+grade*3.6, y=average=>174-(average-low)/(high-low)*142;
  const svg=svgNode('svg',{viewBox:'0 0 440 215',role:'img','aria-label':`השפעת הציון בקורס ${focus.course.name} על הממוצע. טווח הממוצע: ${fmt(low)} עד ${fmt(high)}.`,dir:'ltr'});
  svg.append(svgNode('text',{x:48,y:16,class:'grade-chart-text'},'ממוצע צפוי'));
  svg.append(svgNode('text',{x:408,y:213,'text-anchor':'end',class:'grade-chart-text'},'ציון בקורס'));
  for (const value of [low,(low+high)/2,high]) {
    svg.append(svgNode('line',{x1:48,x2:408,y1:y(value),y2:y(value),class:'grade-chart-grid'}));
    svg.append(svgNode('text',{x:38,y:y(value)+4,'text-anchor':'end',class:'grade-chart-text'},fmt(value)));
  }
  for (const grade of [0,25,50,75,100]) svg.append(svgNode('text',{x:x(grade),y:196,'text-anchor':'middle',class:'grade-chart-text'},grade));
  if ($('#grade-target').value && $('#grade-target').validity.valid && state.target>=low && state.target<=high) svg.append(svgNode('line',{x1:48,x2:408,y1:y(state.target),y2:y(state.target),class:'grade-chart-target'}));
  svg.append(svgNode('polyline',{points:values.map(p=>`${x(p.grade)},${y(p.average)}`).join(' '),class:'grade-chart-line'}));
  const expected=focus.course.grade, projected=values[0].average+(values[100].average-values[0].average)*expected/100;
  svg.append(svgNode('circle',{cx:x(expected),cy:y(projected),r:6,class:'grade-chart-point'}));
  host.append(svg);
}
function renderAnalytics() {
  const eligible=state.planned.filter(row=>row.included && row.credits>0 && row.grade!==null);
  if (!eligible.some(row=>row.id===state.focusId)) state.focusId=eligible[0]?.id || null;
  const result=scenario(state.actual,state.planned,state.target,state.focusId);
  $('#actual-average').textContent=averageText(result.base.average);
  $('#actual-credits').textContent=fmt(result.base.credits);
  $('#actual-count').textContent=`${result.base.count} קורסים בחישוב · ${result.base.excluded} לא נכללים`;
  $('#projected-average').textContent=result.future.credits ? averageText(result.average) : '—';
  $('#projected-delta').textContent=result.future.credits ? (result.delta===null ? 'הממוצע של הקורסים העתידיים בלבד' : deltaText(result.delta)) : 'הוסיפו קורס עתידי לסימולציה';
  $('#target-result').textContent=requirementText(result.required);
  $('#target-result').classList.toggle('is-impossible',result.required?.status==='impossible');
  $('#target-detail').textContent=result.required?.status==='possible' ? `אם מכוונים לאותו ציון שלם בכל קורס עתידי: לפחות ${result.required.minimum}. היעד הוא ${fmt(state.target)} לאחר ${fmt(result.future.credits)} נק״ז נוספות.` : '';
  $('#target-maximum').textContent=result.future.credits ? `הממוצע המרבי עם 100 בכל הקורסים העתידיים: ${averageText(result.maximum)}.` : '';
  $('#impact-empty').hidden=!!result.focus; $('#impact-controls').hidden=!result.focus;
  options($('#focus-course'),eligible.map(row=>[row.id,`${row.name} · ${fmt(row.credits)} נק״ז`]),state.focusId);
  if (result.focus) {
    $('#scenario-grade').value=result.focus.course.grade; $('#scenario-value').value=fmt(result.focus.course.grade);
    $('#focus-target').textContent=requirementText(result.focus.required,true);
    $('#focus-target').classList.toggle('is-impossible',result.focus.required?.status==='impossible');
    drawChart(result.focus);
  }
  const retakable=state.actual.filter(row=>row.included && row.grade!==null && row.credits>0);
  options($('#retake-course'),retakable.map(row=>[row.id,`${row.name} · ציון ${fmt(row.grade)}`]),$('#retake-course').value);
  $('#retake-empty').hidden=retakable.length>0; $('#retake-controls').hidden=!retakable.length;
  renderRetake();
  if (!$('#grade-target').value || !$('#grade-target').validity.valid) {
    $('#target-result').textContent='יש להזין יעד בין 0 ל־100.';
    $('#target-detail').textContent='';$('#focus-target').textContent='יש להזין ממוצע יעד תקין לחישוב הציון הדרוש.';
  }
}
function renderRetake() {
  const input=$('#retake-grade');
  if (!input.value || !input.validity.valid) { $('#retake-result').textContent='יש להזין ציון בין 0 ל־100.'; return; }
  const result=retake(state.actual,$('#retake-course').value,Number(input.value),$('#retake-policy').value);
  $('#retake-result').textContent=result ? `הממוצע לאחר השיפור: ${averageText(result.average)} (${deltaText(result.delta)}).` : '';
}
function render() {
  renderRows('actual');renderRows('planned');renderAnalytics();
  // Panels appear as they gain something to show: grades first, then future courses.
  $('#grade-workspace').dataset.stage=state.planned.length?'future':state.actual.length?'actual':'empty';
  const codes=state.actual.filter(row=>row.included && row.code).map(row=>row.code);
  const duplicated=codes.length!==new Set(codes).size;
  $('#grade-duplicates').hidden=!duplicated;
  $('#grade-duplicates').textContent='יש קודי קורס חוזרים. כרגע כל שורה מסומנת נספרת בנפרד; הסירו מהחישוב ניסיונות שלא אמורים להיכלל.';
  $('#export-grades').disabled=!state.actual.length && !state.planned.length;
  $('#clear-grades').disabled=!state.actual.length;
}
$('#grade-filter').addEventListener('input',()=>renderRows('actual'));
$('#grade-target').addEventListener('input',event=>{
  if (!event.target.value || !event.target.validity.valid) {renderAnalytics();return;}
  undo=structuredClone(state);$('#grade-undo-bar').hidden=false;
  state.target=Number(event.target.value);renderAnalytics();persist();
});
$('#focus-course').addEventListener('change',event=>{state.focusId=event.target.value;renderAnalytics();persist();});
$('#scenario-grade').addEventListener('input',event=>{
  undo=structuredClone(state);$('#grade-undo-bar').hidden=false;
  state.planned=state.planned.map(row=>row.id===state.focusId ? {...row,grade:Number(event.target.value)} : row);
  renderRows('planned');renderAnalytics();persist();
});
for (const selector of ['#retake-course','#retake-grade','#retake-policy']) $(selector).addEventListener('input',renderRetake);
$('#clear-grades').addEventListener('click',()=>change(()=>{state.actual=[];}));
$('#undo-grades').addEventListener('click',()=>{
  if (!undo) return;Object.assign(state,undo);undo=null;$('#grade-target').value=state.target;
  persist();render();$('#grade-undo-bar').hidden=true;message('השינוי האחרון בוטל.');
});

function currentSheet() { return workbook.sheets[Number($('#import-sheet').value)]; }
const mappingLabels={name:'שם קורס',code:'קוד קורס (אופציונלי)',credits:'נק״ז',grade:'ציון',included:'נכלל בממוצע (אופציונלי)'};
function changeSheet() {
  const rows=currentSheet().rows, selected=detectHeader(rows);
  options($('#import-header'),rows.slice(0,50).map((row,index)=>[String(index),`שורה ${row.number}: ${row.cells.filter(cell=>cell!==null).slice(0,3).join(' · ')}`]),String(selected));
  changeHeader();
}
function changeHeader() {
  const cells=currentSheet().rows[Number($('#import-header').value)].cells;
  const mapping=detectColumns(cells);$('#import-mapping').replaceChildren();
  for (const [key,label] of Object.entries(mappingLabels)) {
    const el=node('label',label),select=node('select');select.dataset.map=key;select.setAttribute('aria-label',label);
    options(select,[['-1',key==='code'||key==='included' ? 'ללא עמודה' : 'בחירת עמודה'],...cells.map((cell,index)=>[String(index),`${index+1} · ${cell ?? 'ללא כותרת'}`])],String(mapping[key]));
    select.addEventListener('change',updatePreview);el.append(select);$('#import-mapping').append(el);
  }
  updatePreview();
}
function importStatus() {
  const selected=preview.filter(row=>importSelected.has(row.number));
  const errors=selected.filter(row=>row.error).length;
  const excluded=selected.filter(row=>row.record && (!row.record.included || row.record.credits===0)).length;
  $('#import-status').textContent=`${selected.length} מתוך ${preview.length} שורות נבחרו · ${errors} שגויות · ${excluded} ללא משקל בממוצע`;
  $('#commit-import').disabled=!selected.length || errors>0;
  $('#import-select-all').checked=!!preview.length && selected.length===preview.length;
  $('#import-select-all').indeterminate=selected.length>0 && selected.length<preview.length;
}
function renderPreview() {
  const body=$('#import-preview');body.replaceChildren();
  for (const row of preview) {
    const tr=node('tr');if(row.error)tr.className='invalid-row';
    const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=importSelected.has(row.number);
    checkbox.setAttribute('aria-label',`ייבוא שורה ${row.number}`);
    checkbox.addEventListener('change',()=>{checkbox.checked?importSelected.add(row.number):importSelected.delete(row.number);importStatus();});
    const selection=node('td');selection.append(checkbox);const data=row.record||row.raw;
    tr.append(selection,node('td',row.number),node('td',String(data.name??'')),node('td',String(data.credits??'')),node('td',data.grade===null?'ללא ציון':String(data.grade??'')),
      node('td',row.error || (data.included && data.credits>0 ? 'נכלל בחישוב' : 'לא נכלל בחישוב')));body.append(tr);
  }
  importStatus();
}
function updatePreview() {
  showError('#import-error');
  try {
    const mapping=Object.fromEntries([...$('#import-mapping').querySelectorAll('select')].map(select=>[select.dataset.map,Number(select.value)]));
    preview=importRows(currentSheet().rows,Number($('#import-header').value),mapping,$('#import-destination').value==='planned');
    importSelected=new Set(preview.map(row=>row.number));renderPreview();
  } catch(error) {preview=[];importSelected.clear();renderPreview();showError('#import-error',error.message);}
}
$('#grade-file').addEventListener('change',async event=>{
  const file=event.target.files[0]; if(!file)return;
  if(!/\.xlsx$/i.test(file.name)||file.size>5*1024*1024||!file.size) {message('יש לבחור קובץ xlsx בגודל של עד 5 MB.',true);event.target.value='';return;}
  event.target.disabled=true;message('קוראים את קובץ הציונים…');
  try {
    workbook=await api.importGrades(file);
    $('#grade-import-file').textContent=file.name;
    options($('#import-sheet'),workbook.sheets.map((sheet,index)=>[String(index),sheet.name]),'0');
    $('#import-destination').value='actual';$('#import-mode').value='append';
    changeSheet();$('#grade-import-dialog').showModal();message();
  } catch(error) {message(error.message,true);}
  finally {event.target.disabled=false;event.target.value='';}
});
$('#import-sheet').addEventListener('change',changeSheet);
$('#import-header').addEventListener('change',changeHeader);
$('#import-destination').addEventListener('change',updatePreview);
$('#import-select-all').addEventListener('change',event=>{importSelected=new Set(event.target.checked?preview.map(row=>row.number):[]);renderPreview();});
$('#exclude-import-errors').addEventListener('click',()=>{for(const row of preview)if(row.error)importSelected.delete(row.number);renderPreview();});
$('#close-grade-import').addEventListener('click',()=>$('#grade-import-dialog').close());
$('#commit-import').addEventListener('click',()=>{
  const selected=preview.filter(row=>importSelected.has(row.number));
  if(!selected.length||selected.some(row=>row.error))return;
  const kind=$('#import-destination').value,replace=$('#import-mode').value==='replace';
  try {
    ensureCapacity(selected.length,replace?kind:null);
    const records=selected.map(row=>({...row.record,id:id()}));
    change(()=>{state[kind]=replace?records:[...state[kind],...records];});
    $('#grade-import-dialog').close();message(`${records.length} קורסים יובאו. אפשר לערוך כל שורה או לבטל את הייבוא.`);
  } catch(error) {showError('#import-error',error.message);}
});
$('#export-grades').addEventListener('click',async event=>{
  event.target.disabled=true;
  try {
    const blob=await api.exportGrades({actual:state.actual,planned:state.planned});
    const url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download='carpedio-grades.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    message('קובץ ה־Excel כולל גיליון ציונים וגיליון נפרד לתרחיש העתידי.');
  } catch(error) {message(error.message,true);}
  finally {event.target.disabled=!state.actual.length&&!state.planned.length;}
});
function syncTheme() {
  // Same icon button as the schedule page: the label says what a click will do.
  const dark=document.documentElement.dataset.theme==='dark', button=$('#grades-theme');
  button.setAttribute('aria-pressed',String(dark));
  button.setAttribute('aria-label',dark?'הפעלת מצב בהיר':'הפעלת מצב כהה');
  button.title=dark?'מעבר למצב בהיר':'מעבר למצב כהה';
}
$('#grades-theme').addEventListener('click',()=>{
  document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';
  try {localStorage.setItem('carpedio-theme',document.documentElement.dataset.theme);}catch{}syncTheme();
});
restore();render();syncTheme();
if(location.protocol==='file:')message('כדי לייבא ולייצא Excel יש לפתוח את האתר דרך start.bat. חישוב ידני זמין כאן.',true);
