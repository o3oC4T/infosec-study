const check = (condition, message = '최종 모의고사 데이터 형식을 확인해 주세요.') => {if (!condition) throw new Error(message);};
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 12000;
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateContent(data) {
  check(object(data) && data.version === 1 && text(data.revision) && text(data.title));
  check(Array.isArray(data.scope) && data.scope.length === 13);
  check(new Set(data.scope.map(item => item.id)).size === 13);
  for (const item of data.scope) check(text(item.id) && text(item.title) && Array.isArray(item.points) && item.points.length > 0 && item.points.every(text));
  check(Array.isArray(data.questions) && data.questions.length === 21);
  check(new Set(data.questions.map(q => q.id)).size === 21);
  const topics = new Set(data.scope.map(item => item.id));
  for (const q of data.questions) {
    check([q.id, q.topic, q.title, q.prompt, q.answer, q.pitfall].every(text));
    check(topics.has(q.topic) && Array.isArray(q.rubric) && q.rubric.length >= 2 && q.rubric.every(text));
    check([null, 'aes', 'des'].includes(q.resource));
  }
  check(data.scope.every(item => data.questions.some(q => q.topic === item.id)));
  return data;
}
export function createAttempt(data, duration = 60, now = Date.now()) {
  check([0, 30, 60, 90].includes(duration));
  return {revision: data.revision, started: now, deadline: duration ? now + duration * 60000 : null,
    finished: null, timedOut: false, index: 0, flags: [],
    answers: data.questions.map(() => ''), grades: data.questions.map(() => null)};
}
export function validateAttempt(value, data) {
  if (value === null) return null;
  const count = data.questions.length;
  check(object(value) && value.revision === data.revision, '다른 버전의 최종 모의고사 기록입니다.');
  check(Number.isFinite(value.started) && (value.deadline === null || Number.isFinite(value.deadline) && value.deadline >= value.started));
  check(value.finished === null || Number.isFinite(value.finished) && value.finished >= value.started);
  check(typeof value.timedOut === 'boolean');
  check(Number.isInteger(value.index) && value.index >= 0 && value.index < count);
  check(Array.isArray(value.flags) && value.flags.every(i => Number.isInteger(i) && i >= 0 && i < count));
  check(Array.isArray(value.answers) && value.answers.length === count && value.answers.every(a => typeof a === 'string' && a.length <= 12000));
  check(Array.isArray(value.grades) && value.grades.length === count);
  value.grades.forEach((grade, i) => {
    check(grade === null || value.finished !== null && Array.isArray(grade) && grade.length === data.questions[i].rubric.length && grade.every(g => typeof g === 'boolean'));
    if (value.finished !== null && !value.answers[i].trim()) check(Array.isArray(grade) && grade.every(g => g === false));
  });
  return {revision: data.revision, started: value.started, deadline: value.deadline, finished: value.finished,
    timedOut: value.timedOut, index: value.index, flags: [...new Set(value.flags)], answers: [...value.answers], grades: structuredClone(value.grades)};
}
export function finishAttempt(attempt, data, timedOut = false, now = Date.now()) {
  const result = structuredClone(attempt);
  result.finished = now;
  result.timedOut = timedOut;
  result.answers.forEach((answer, i) => {if (!answer.trim()) result.grades[i] = data.questions[i].rubric.map(() => false);});
  return result;
}
export function scoreAttempt(attempt) {
  const graded = attempt.grades.filter(grade => grade !== null).length;
  const score = Math.round(attempt.grades.reduce((sum, grade) => sum + (grade ? grade.filter(Boolean).length / grade.length : 0), 0) / attempt.grades.length * 100);
  return {graded, total: attempt.grades.length, score: graded === attempt.grades.length ? score : null};
}
