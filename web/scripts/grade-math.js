/** Pure grade arithmetic and import validation. No timetable or DOM dependencies. */
export const MAX_RECORDS = 5000;
const EPS = 1e-9;
const blank = value => value === null || value === undefined || String(value).trim() === '';
const normalizeHeader = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s"'״׳_.\-()]/g, '');
const HEADERS = {
  name:['שם קורס','שם הקורס','קורס','מקצוע','course','course name','name'],
  code:['קוד קורס','מספר קורס','מספר הקורס','קוד','course id','course code','code','courseid'],
  credits:['נקז','נז','נקודות זכות','credits','credit','credit points'],
  grade:['ציון','ציון סופי','grade','score','final grade','mark'],
  included:['נכלל בממוצע','כלול בממוצע','included','include'],
};

export function detectColumns(cells) {
  return Object.fromEntries(Object.entries(HEADERS).map(([key, aliases]) => [key,
    cells.findIndex(cell => aliases.some(alias => normalizeHeader(alias) === normalizeHeader(cell)))]));
}
export function detectHeader(rows) {
  let best = 0, score = -1;
  rows.slice(0, 50).forEach((row, index) => {
    const mapping = detectColumns(row.cells);
    const found = ['name','credits','grade'].filter(key => mapping[key] >= 0).length;
    if (found > score) { best = index; score = found; }
  });
  return best;
}
function number(value, label, max) {
  const cleaned = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  if (blank(value) || typeof value === 'boolean' || !['string','number'].includes(typeof value) ||
      (typeof cleaned === 'string' && !/^\d+(?:\.\d+)?$/.test(cleaned))) throw new Error(`${label}: יש להזין מספר.`);
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) throw new Error(`${label}: הערך חייב להיות בין 0 ל־${max}.`);
  return parsed;
}
export function normalizeRecord(raw, planned = false) {
  const name = String(raw.name ?? '').trim(), code = String(raw.code ?? '').trim();
  if (!name || name.length > 200) throw new Error('יש להזין שם קורס באורך של עד 200 תווים.');
  if (code.length > 80) throw new Error('קוד הקורס ארוך מדי (עד 80 תווים).');
  const credits = number(raw.credits, 'נק״ז', 1000);
  const nonNumericGrade = blank(raw.grade) || ['עבר','עובר','פטור','זיכוי','pass','passed','exempt'].includes(String(raw.grade).trim().toLowerCase());
  const grade = nonNumericGrade ? null : number(raw.grade, 'ציון', 100);
  const included = raw.included ?? (grade !== null);
  if (typeof included !== 'boolean') throw new Error('סימון הכללה בממוצע אינו תקין.');
  if (grade === null && included) throw new Error('קורס ללא ציון מספרי צריך להיות מסומן כלא נכלל בממוצע.');
  if (planned && (credits <= 0 || grade === null)) throw new Error('לקורס עתידי נדרשות נק״ז חיוביות וציון צפוי.');
  return {name, code, credits, grade, included};
}
function includeValue(value) {
  if (blank(value)) return undefined;
  if ([true,1,'כן','yes','true','1'].includes(typeof value === 'string' ? value.trim().toLowerCase() : value)) return true;
  if ([false,0,'לא','no','false','0'].includes(typeof value === 'string' ? value.trim().toLowerCase() : value)) return false;
  throw new Error('נכלל בממוצע: יש להשתמש בכן/לא או true/false.');
}
export function importRows(rows, headerIndex, mapping, planned = false) {
  if (['name','credits','grade'].some(key => !Number.isInteger(mapping[key]) || mapping[key] < 0))
    throw new Error('יש לבחור עמודות לשם קורס, נק״ז וציון.');
  const columns = Object.values(mapping).filter(value => value >= 0);
  if (new Set(columns).size !== columns.length) throw new Error('יש לבחור עמודה שונה לכל שדה.');
  const output = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (['name','code','credits','grade'].every(key => blank(row.cells[mapping[key]]))) continue;
    const raw = Object.fromEntries(Object.entries(mapping).filter(([, column])=>column>=0).map(([key,column])=>[key,row.cells[column]]));
    try {
      raw.included = includeValue(raw.included);
      output.push({number:row.number, raw, record:normalizeRecord(raw, planned)});
    } catch (error) { output.push({number:row.number, raw, error:error.message}); }
  }
  if (output.length > MAX_RECORDS) throw new Error(`אפשר להוסיף עד ${MAX_RECORDS} קורסים.`);
  return output;
}

export function summarize(records) {
  const included = records.filter(row => row.included && row.grade !== null && row.credits > 0);
  const credits = included.reduce((total,row)=>total+row.credits,0);
  const points = included.reduce((total,row)=>total+row.credits*row.grade,0);
  return {credits, points, average:credits > 0 ? points/credits : null, count:included.length,
    excluded:records.length-included.length};
}
export function requirement(points, totalCredits, variableCredits, target) {
  if (!(variableCredits > 0)) return null;
  const raw = (target*totalCredits-points)/variableCredits;
  const status = raw > 100 + EPS ? 'impossible' : raw <= EPS ? 'guaranteed' : 'possible';
  return {raw, status, minimum:status === 'impossible' ? null : Math.max(0, Math.ceil(raw-EPS))};
}
export function scenario(actual, planned, target, focusId) {
  const base = summarize(actual), future = summarize(planned);
  const totalCredits = base.credits+future.credits;
  const average = totalCredits > 0 ? (base.points+future.points)/totalCredits : null;
  const focus = planned.find(row => row.id === focusId && row.included && row.credits > 0 && row.grade !== null);
  const fixedPoints = base.points+future.points-(focus ? focus.grade*focus.credits : 0);
  return {base, future, average, delta:base.average !== null && average !== null ? average-base.average : null,
    maximum:totalCredits > 0 ? (base.points+100*future.credits)/totalCredits : null,
    required:requirement(base.points,totalCredits,future.credits,target),
    focus:focus ? {course:focus, required:requirement(fixedPoints,totalCredits,focus.credits,target),
      points:Array.from({length:101},(_,grade)=>({grade,average:(fixedPoints+focus.credits*grade)/totalCredits}))} : null};
}
export function retake(actual, identifier, grade, policy = 'replace') {
  const base = summarize(actual), course = actual.find(row=>row.id===identifier);
  if (!course?.included || course.grade === null || course.credits <= 0 || base.average === null) return null;
  const effectiveGrade = policy === 'highest' ? Math.max(grade,course.grade) : grade;
  const average = (base.points+course.credits*(effectiveGrade-course.grade))/base.credits;
  return {average, delta:average-base.average, effectiveGrade};
}
