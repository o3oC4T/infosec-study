import {lessons} from './content.js';
import {byId,questionScore} from './questions.js';
export const STORAGE_KEY='infosec-study-v1';
export const defaults=()=>({version:1,done:[],bookmarks:[],notes:{},history:[],active:null,plan:'3d',lastLesson:null});
const validIds=new Set(Object.keys(byId));
const lessonIds=new Set(lessons.map(l=>l.id));
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
function assert(c,m){if(!c)throw new Error(m);}
function validateExam(e){
 assert(obj(e)&&typeof e.id==='string'&&/^exam-[a-zA-Z0-9-]{1,90}$/.test(e.id),'시험 기록 형식이 올바르지 않습니다.');
 assert(Array.isArray(e.ids)&&e.ids.length>0&&e.ids.length<=100&&e.ids.every(id=>validIds.has(id))&&new Set(e.ids).size===e.ids.length,'문항 목록을 확인해 주세요.');
 assert(Number.isFinite(e.started)&&Number.isFinite(e.duration)&&e.duration>=0&&e.duration<=240,'시험 시간 형식이 올바르지 않습니다.');
 assert(e.deadline===null||Number.isFinite(e.deadline),'종료 시각이 올바르지 않습니다.');
 assert(e.finished===null||Number.isFinite(e.finished),'제출 시각이 올바르지 않습니다.');
 assert(obj(e.answers)&&obj(e.grades)&&Array.isArray(e.flags),'답안 형식이 올바르지 않습니다.');
 const answers={},grades={};
 for(const id of e.ids){
  if(e.answers[id]!==undefined){assert(typeof e.answers[id]==='string'&&e.answers[id].length<=12000,'답안은 12,000자 이하여야 합니다.');answers[id]=e.answers[id];}
  if(e.grades[id]!==undefined){assert(Array.isArray(e.grades[id])&&e.grades[id].length===byId[id].rubric.length&&e.grades[id].every(x=>typeof x==='boolean'),'채점 기준이 올바르지 않습니다.');grades[id]=e.grades[id];}
 }
 return {id:e.id,ids:e.ids,started:e.started,duration:e.duration,deadline:e.deadline,finished:e.finished,answers,grades,flags:e.flags.filter(id=>e.ids.includes(id)),index:Math.max(0,Math.min(e.ids.length-1,Number.isInteger(e.index)?e.index:0)),mode:typeof e.mode==='string'?e.mode.slice(0,100):'연습',timedOut:e.timedOut===true};
}
export function validateState(s){
 assert(obj(s)&&s.version===1,'이 사이트에서 내보낸 버전 1 백업 파일을 선택해 주세요.');
 assert(Array.isArray(s.done)&&s.done.every(id=>lessonIds.has(id)),'학습 진도 형식이 올바르지 않습니다.');
 assert(Array.isArray(s.bookmarks)&&s.bookmarks.every(id=>validIds.has(id)),'북마크 형식이 올바르지 않습니다.');
 assert(obj(s.notes)&&Array.isArray(s.history)&&s.history.length<=20,'복습 기록 형식이 올바르지 않습니다.');
 const notes={};for(const [k,v] of Object.entries(s.notes)){assert(validIds.has(k)&&typeof v==='string'&&v.length<=3000,'오답 메모 형식이 올바르지 않습니다.');notes[k]=v;}
 const history=s.history.map(validateExam);assert(new Set(history.map(e=>e.id)).size===history.length,'시험 식별자가 중복되었습니다.');assert(history.every(e=>e.finished!==null),'제출 기록 형식이 올바르지 않습니다.');
 const active=s.active?validateExam(s.active):null;assert(!active||active.finished===null,'진행 중 시험 형식이 올바르지 않습니다.');
 return {version:1,done:[...new Set(s.done)],bookmarks:[...new Set(s.bookmarks)],notes,history,active,plan:['3h','3d','7d'].includes(s.plan)?s.plan:'3d',lastLesson:lessonIds.has(s.lastLesson)?s.lastLesson:null};
}
export function newExam(ids,duration,mode,now=Date.now()){
 return {id:`exam-${now}-${Math.random().toString(36).slice(2,8)}`,ids,started:now,duration,deadline:duration?now+duration*60000:null,finished:null,answers:{},grades:{},flags:[],index:0,mode,timedOut:false};
}
export function finishExam(exam,now=Date.now(),timedOut=false){
 const finished=structuredClone(exam);finished.finished=now;finished.timedOut=timedOut;
 for(const id of finished.ids)if(!finished.answers[id]?.trim())finished.grades[id]=byId[id].rubric.map(()=>false);
 return finished;
}
export function latestGrades(history){const map={};for(const exam of history)for(const id of exam.ids)if(!map[id]&&Array.isArray(exam.grades[id]))map[id]={exam,score:questionScore(byId[id],exam.grades[id])};return map;}
export function reviewIds(state){const latest=latestGrades(state.history);return [...new Set([...Object.keys(latest).filter(id=>latest[id].score<1),...state.bookmarks])];}
