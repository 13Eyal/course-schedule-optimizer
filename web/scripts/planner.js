import { DAYS, TYPES, duration, formatTime, weekLoad } from './api.js';

export function courseMatches(course, query) {
  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
  const haystack = normalize(`${course.id} ${course.name}`);
  return normalize(query).trim().split(/\s+/).every(word => haystack.includes(word));
}

export function agendaDays(sessions) {
  const loads = weekLoad(sessions);
  return DAYS.map((name, index) => ({
    day: index + 1, name, minutes: loads[index],
    sessions: sessions.filter(s => s.day === index + 1).sort((a,b) => a.start-b.start || a.end-b.end),
  }));
}

/** DOM-only planner enhancements. All optimization stays in the existing Python service. */
export function initPlannerUX({ onSession, onGenerate }) {
  const $ = selector => document.querySelector(selector);
  const root=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const phone=matchMedia('(max-width: 680px)');
  let courses=[], sessions=[], hasResults=false, selectedDay=0, view=phone.matches?'agenda':'week';
  let viewChosen=false, transition=null, revision=0;
  const animations=new Set();
  try { const saved=localStorage.getItem('carpedio-calendar-view'); if(['agenda','week'].includes(saved)){view=saved;viewChosen=true;} } catch {}
  const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  const motion=()=>!reduced.matches&&root.dataset.motion!=='off';

  // Clear task labels replace decorative editorial subtitles.
  [['.hero-bottom>span:last-child','נתוני הקורסים נשארים בשרת המקומי'],['.editorial-heading>.eyebrow','נקודת פתיחה'],['.workspace-heading .eyebrow','מרחב התכנון'],['.approach-title .eyebrow','איך זה עובד'],['.calendar-toolbar .eyebrow','המערכת השבועית שלך']].forEach(([selector,text])=>{const el=$(selector);if(el)el.textContent=text;});
  $('.workspace-heading>p').textContent='בוחרים קורסים והעדפות, משווים חלופות ומוצאים את השבוע שמתאים לך.';

  const searchBox=node('div','course-search');
  const label=node('label','','חיפוש בקורסים');label.htmlFor='course-search';
  const search=node('input');search.id='course-search';search.type='search';search.placeholder='שם קורס או מספר';search.autocomplete='off';
  const searchStatus=node('p','course-search-status');searchStatus.id='course-search-status';searchStatus.setAttribute('role','status');
  searchBox.append(label,search,searchStatus);$('.course-tools').before(searchBox);
  function filterCourses(){let count=0;$('#course-list').querySelectorAll('.course-row').forEach(row=>{const course=courses.find(c=>c.id===row.querySelector('input').value);const visible=course&&courseMatches(course,search.value);row.hidden=!visible;if(visible)count++;});searchStatus.textContent=search.value.trim()?(count?`${count} קורסים תואמים · החיפוש אינו משנה את הבחירה`:'לא נמצאו קורסים. נסו שם או מספר אחר.') : '';}
  search.addEventListener('input',filterCourses);

  const actionbar=node('div','planner-actionbar');actionbar.setAttribute('aria-label','מצב התכנון');
  const actioncopy=node('div','planner-actioncopy'), actiontitle=node('strong'), actiondetail=node('span');
  actioncopy.append(actiontitle,actiondetail);
  const actionbutton=node('button','primary-button','חישוב המערכת');actionbutton.type='button';actionbutton.addEventListener('click',onGenerate);
  actionbar.append(actioncopy,actionbutton);$('.planner-steps').after(actionbar);
  const stale=node('div','stale-results');stale.hidden=true;stale.setAttribute('role','status');
  stale.append(node('strong','','הבחירה שלך עודכנה'),node('span','','הלוח מציג את החישוב הקודם. חשבו מחדש כדי לעדכן אותו.'));
  $('#results').prepend(stale);

  const viewbar=node('div','calendar-viewbar'),viewgroup=node('div','view-switch');viewgroup.setAttribute('role','group');viewgroup.setAttribute('aria-label','תצוגת מערכת');
  for(const [id,title] of [['week','לוח שבועי'],['agenda','סדר יום']]){
    const button=node('button','',title);button.type='button';button.dataset.calendarView=id;button.setAttribute('aria-controls',id==='week'?'calendar-scroll':'calendar-agenda');
    button.addEventListener('click',()=>{view=id;viewChosen=true;try{localStorage.setItem('carpedio-calendar-view',view);}catch{}changeView();});viewgroup.append(button);
  }
  const viewhint=node('span','view-hint','לחצו על מפגש כדי לראות את הפרטים');viewbar.append(viewgroup,viewhint);$('.calendar-toolbar').after(viewbar);
  const agenda=node('div','calendar-agenda');agenda.id='calendar-agenda';agenda.hidden=true;
  const filters=node('div','agenda-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','יום להצגה');
  ['הכול','א׳','ב׳','ג׳','ד׳','ה׳'].forEach((name,i)=>{const button=node('button','',name);button.type='button';button.dataset.agendaDay=i;button.setAttribute('aria-label',i?`יום ${DAYS[i-1]}`:'כל הימים');button.addEventListener('click',()=>{selectedDay=i;renderAgenda();animateAgenda();});filters.append(button);});
  const agendaContent=node('div','agenda-content');agendaContent.id='agenda-content';
  agenda.append(filters,agendaContent);$('#calendar-scroll').after(agenda);
  const live=node('p','visually-hidden');live.setAttribute('role','status');agenda.append(live);
  function applyView(){
    $('#calendar-scroll').hidden=!hasResults||view!=='week';agenda.hidden=!hasResults||view!=='agenda';
    viewgroup.querySelectorAll('button').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.calendarView===view));button.disabled=!hasResults;});
  }
  function changeView(){
    const token=++revision;transition?.skipTransition();
    if(!motion()||!document.startViewTransition){applyView();return;}
    // MDN / Context7: DOM updates have a native fallback and are never gated on animation.
    const next=document.startViewTransition(()=>{if(token===revision)applyView();});transition=next;
    next.ready.catch(()=>{});next.updateCallbackDone.catch(()=>{if(token===revision)applyView();});
    next.finished.catch(()=>{}).finally(()=>{if(transition===next)transition=null;});
  }
  function animateAgenda(){if(!motion()||!agendaContent.animate)return;const animation=agendaContent.animate([{opacity:.35,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:350,easing:'cubic-bezier(.22,1,.36,1)'});animations.add(animation);animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));}
  function renderAgenda(){
    agendaContent.replaceChildren();
    filters.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.agendaDay)===selectedDay)));
    const visible=agendaDays(sessions).filter(day=>selectedDay===0||selectedDay===day.day);
    visible.forEach(day=>{
      const section=node('section','agenda-day'),heading=node('div','agenda-day-heading');
      const id=`agenda-heading-${day.day}`;const title=node('h4','',`יום ${day.name}`);title.id=id;section.setAttribute('aria-labelledby',id);
      heading.append(title,node('span','',day.sessions.length?`${duration(day.minutes)} לימודים`:'יום פנוי'));section.append(heading);
      if(!day.sessions.length)section.append(node('p','agenda-free','אין מפגשים ביום הזה. מקום לדברים אחרים.'));
      day.sessions.forEach(session=>{
        const button=node('button','agenda-session');button.type='button';
        const courseIndex=Math.max(0,courses.findIndex(c=>c.id===session.course_id))%5;
        button.style.setProperty('--agenda-color',`var(--event-${courseIndex})`);button.style.setProperty('--agenda-ink',`var(--event-ink-${courseIndex})`);
        const time=node('span','agenda-time');time.dir='ltr';time.append(node('strong','',formatTime(session.start)),node('span','',formatTime(session.end)));
        const copy=node('span','agenda-copy');copy.append(node('bdi','',session.name),node('span','',`${TYPES[session.type]} · ${session.mandatory?'חובה':'רשות'} · קבוצה ${session.group_id}`));
        button.append(time,copy);button.addEventListener('click',()=>onSession(session));section.append(button);
      });agendaContent.append(section);
    });
    live.textContent=selectedDay?`מוצג יום ${DAYS[selectedDay-1]}`:'מוצגים כל ימי השבוע';
  }
  const weeknote=node('div','week-insight');weeknote.hidden=true;$('.metrics').after(weeknote);
  const preview=node('div','hero-week-preview');preview.hidden=true;preview.setAttribute('aria-label','סיכום המערכת המוצגת');$('.hero-art').removeAttribute('aria-hidden');$('.hero-art').append(preview);
  function updateInsights(){
    const days=agendaDays(sessions),free=days.filter(d=>!d.sessions.length),total=days.reduce((sum,d)=>sum+d.minutes,0);
    weeknote.replaceChildren(node('strong','',free.length?`ימים פנויים: ${free.map(d=>d.name).join(', ')}`:'לימודים בכל חמשת הימים'),node('span','',`${duration(total)} לימודים בשבוע · ללא ספירה כפולה של מפגשים חופפים`));
    preview.replaceChildren(node('span','hero-week-caption','השבוע שמוצג בלוח'),node('strong','',`${5-free.length} ימי לימוד`));
    const strip=node('div','hero-week-days');days.forEach(d=>{const day=node('span',d.sessions.length?'is-study-day':'',d.name);strip.append(day);});preview.append(strip);
    weeknote.hidden=preview.hidden=!hasResults;
  }
  function stopMotion(){if(!motion()){transition?.skipTransition();animations.forEach(a=>a.cancel());}}
  reduced.addEventListener('change',stopMotion);new MutationObserver(stopMotion).observe(root,{attributes:true,attributeFilter:['data-motion']});
  phone.addEventListener('change',()=>{if(!viewChosen){view=phone.matches?'agenda':'week';applyView();}});
  applyView();
  return {
    update({selected,total,busy,results,dirty}){
      actiontitle.textContent=busy?'מחשבים את האפשרויות…':dirty?'יש שינויים שעדיין לא חושבו':results?'המערכת שלך מוכנה להשוואה':'מתחילים בבחירת קורסים';
      actiondetail.textContent=`${selected} מתוך ${total} קורסים נבחרו`;
      actionbutton.textContent=busy?'מחשבים…':dirty?'עדכון המערכת':'חישוב מחדש';actionbutton.disabled=busy||!selected;
      stale.hidden=!dirty||!results;$('#results').classList.toggle('has-stale-results',dirty&&!!results);
      const previewCaption=preview.querySelector('.hero-week-caption');if(previewCaption)previewCaption.textContent=dirty?'החישוב הקודם · ממתין לעדכון':'השבוע שמוצג בלוח';
      $('.planner-steps').querySelectorAll('a').forEach((link,i)=>{link.classList.toggle('step-complete',i===0?selected>0:i===1?selected>0&&!dirty:results>0&&!dirty);});
    },
    courses(data){courses=data;filterCourses();},
    result(schedule){sessions=schedule.sessions;hasResults=true;renderAgenda();applyView();updateInsights();},
    clear(){revision++;transition?.skipTransition();sessions=[];hasResults=false;agendaContent.replaceChildren();weeknote.hidden=preview.hidden=true;applyView();},
  };
}
