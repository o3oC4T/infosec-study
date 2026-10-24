import {decryptContent, encryptProgress, decryptProgress, PROGRESS_KEY} from './final-vault.js';
import {validateContent, validateAttempt, createAttempt, finishAttempt, scoreAttempt} from './final-model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button = (action, label, style = 'btn', extra = '') => `<button type="button" class="${style}" data-final-action="${action}" ${extra}>${label}</button>`;
const heading = (title, description) => `<div class="page-heading"><div><div class="eyebrow">THE FINAL CHECK</div><h1 tabindex="-1">${esc(title)}</h1><p>${esc(description)}</p></div></div>`;

export function mountFinal(root, {resource, notify}) {
  const controller = new AbortController();
  const options = {signal: controller.signal};
  let data = null, key = null, attempt = null, view = 'locked', disposed = false, generation = 0;
  let queue = Promise.resolve(), pending = 0, saveError = '', restoreError = '', confirmFn = null;
  const $ = selector => root.querySelector(selector);
  const topic = id => data.scope.find(item => item.id === id);
  const hasActive = () => attempt && attempt.finished === null;
  const answered = () => attempt.answers.filter(answer => answer.trim()).length;

  function saveStatus() {
    const node = $('[data-final-save]');
    if (node) node.textContent = pending ? '저장 중…' : saveError || '이 브라우저에 저장됨';
  }
  function persist() {
    if (!key || !data || restoreError) return queue;
    const snapshot = structuredClone(attempt), currentKey = key, revision = data.revision;
    pending += 1;
    saveStatus();
    queue = queue.then(async () => {
      const encrypted = await encryptProgress(snapshot, currentKey, revision);
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(encrypted));
      saveError = '';
    }).catch(() => {
      saveError = '저장 실패 · 창을 닫기 전에 다시 저장해 주세요.';
      if (!disposed && key) notify(saveError);
    }).finally(() => {pending -= 1; if (!disposed) saveStatus();});
    return queue;
  }
  function lock() {
    generation += 1;
    data = key = attempt = null;
    view = 'locked';
    restoreError = saveError = '';
    confirmFn = null;
    render();
    $('#final-password')?.focus();
  }
  function openView(next) {
    view = next;
    tick();
    render();
    $('h1')?.focus({preventScroll: true});
    root.scrollIntoView({block: 'start'});
  }
  function nav() {
    return `<div class="final-toolbar">${button('hub','← 최종 준비실','btn small')}
      <div>${button('summary','범위 요약','btn small')}${button('exam','최종 모의고사','btn small')}${button('lock','잠그기','btn small')}</div></div>`;
  }
  function lockedView() {
    return heading('최종 준비실', '비밀번호를 입력하면 최종 범위 요약과 모의고사가 열립니다.') +
      `<section class="panel final-lock"><span class="final-lock-icon" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="10" width="16" height="12" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v4"/></svg></span><h2>마지막 점검을 시작해요.</h2>
      <p>최종 범위 요약과 고정된 21문항 한 회분을 준비했습니다.</p>
      <form id="final-unlock-form"><label for="final-password">비밀번호</label>
      <input id="final-password" name="password" type="password" autocomplete="current-password" required aria-describedby="final-unlock-error">
      <button type="submit" class="btn primary full">최종 페이지 열기</button><p id="final-unlock-error" class="form-error" role="alert"></p></form>
      <p class="small-text muted">페이지를 떠나거나 새로고침하면 다시 잠깁니다.</p></section>`;
  }
  function hubView() {
    return heading('최종 준비실', '범위를 확인하고, 한 회분을 끝까지 풀어보세요.') +
      `<div class="final-cards"><section class="panel final-choice"><span class="badge">${data.scope.length}개 항목</span><h2>나오는 것들 · 항목 요약</h2>
      <p>각 항목에서 설명하고 계산할 내용을 간단히 정리했습니다.</p>${button('summary','항목 요약 보기 →','btn primary')}</section>
      <section class="panel final-choice"><span class="badge green">21문항 · 1회분</span><h2>최종 모의고사</h2>
      <p>문항과 순서가 고정되어 있습니다. 제출 후 해설과 채점 기준으로 점검하세요.</p>${button('exam',hasActive()?'작성하던 모의고사 이어가기 →':attempt?'제출한 최종 모의고사 보기 →':'최종 모의고사 열기 →','btn primary')}</section></div>
      <p class="small-text muted spaced">최종 모의고사 답안은 이 브라우저에 별도로 보관됩니다. 같은 비밀번호로 다시 열면 이어서 확인할 수 있습니다.</p>`;
  }
  function summaryView() {
    return heading('최종 범위 요약', `${data.scope.length}개 항목을 확인하고, 설명이 막히는 부분부터 점검하세요.`) +
      `<div class="final-topics">${data.scope.map((item, i) => `<article class="panel final-topic"><div class="section-heading"><span class="final-topic-number">${String(i+1).padStart(2,'0')}</span>
      <h2>${esc(item.title)}</h2><span class="badge neutral">${data.questions.filter(q => q.topic === item.id).length}문항</span></div><ul>${item.points.map(point => `<li>${esc(point)}</li>`).join('')}</ul></article>`).join('')}</div>
      <div class="spaced">${button('exam','최종 모의고사 풀기 →','btn primary')}</div>`;
  }
  function setupView() {
    return heading(data.title, '21문항을 순서대로 풀고, 제출한 뒤 기준별로 자가채점합니다.') +
      `<section class="panel final-setup"><div class="final-facts"><div><strong>21</strong><span>고정 문항</span></div><div><strong>13</strong><span>학습 항목</span></div><div><strong>1</strong><span>회분</span></div></div>
      <form id="final-start-form"><label for="final-duration">연습 시간</label><select id="final-duration" name="duration"><option value="60">60분</option><option value="90">90분</option><option value="30">30분</option><option value="0">시간 제한 없음</option></select>
      <button type="submit" class="btn primary full" ${restoreError?'disabled':''}>최종 모의고사 시작</button></form>
      <p class="small-text muted">답안은 자동 저장됩니다. 시간을 정하면 다른 화면에 있거나 페이지를 잠근 동안에도 계속 흐릅니다. 빈 답안은 0점이며, 작성한 답안은 제출 후 직접 채점합니다.</p></section>`;
  }
  function timeLeft() {
    if (!attempt?.deadline) return '시간 제한 없음';
    const seconds = Math.max(0, Math.ceil((attempt.deadline - Date.now()) / 1000));
    return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }
  function examView() {
    if (!attempt) return setupView();
    if (attempt.finished !== null) return resultView();
    const i = attempt.index, q = data.questions[i];
    return `<div class="exam-top"><div><div class="eyebrow">FINAL EXAM · 01</div><h1 tabindex="-1">${esc(data.title)}</h1></div><div class="timer"><b id="final-timer">${timeLeft()}</b></div></div>
      <div class="exam-layout"><section class="answer-card"><div class="question-meta"><span>문항 ${String(i+1).padStart(2,'0')} / 21</span><span class="badge neutral">${esc(topic(q.topic).title)}</span></div>
      <h2>${esc(q.title)}</h2><p class="question-prompt">${esc(q.prompt)}</p>${resource(q.resource)}
      <label class="answer-label" for="final-answer">나의 답안 <small>정의, 계산 과정, 이유를 함께 적으세요.</small></label>
      <textarea id="final-answer" maxlength="12000" rows="12" placeholder="여기에 답안을 작성하세요.">${esc(attempt.answers[i])}</textarea>
      <div class="answer-status"><span id="final-answer-count">${attempt.answers[i].length}자</span><span data-final-save role="status"></span></div>
      <div class="question-actions">${button('flag',attempt.flags.includes(i)?'다시 볼 표시 해제':'다시 볼 문제',attempt.flags.includes(i)?'btn flagged':'btn',`aria-pressed="${attempt.flags.includes(i)}"`)}
      <div>${button('previous','← 이전','btn',i===0?'disabled':'')}${button('next','다음 →','btn primary',i===20?'disabled':'')}</div></div></section>
      <aside class="exam-nav panel"><h3>답안 현황 <span id="final-answered">${answered()} / 21</span></h3><div class="question-grid final-question-grid">${data.questions.map((q, n) =>
        `<button type="button" data-final-action="question" data-index="${n}" class="${n===i?'current ':''}${attempt.answers[n].trim()?'answered ':''}${attempt.flags.includes(n)?'flagged':''}" aria-label="${n+1}번 문제" ${n===i?'aria-current="step"':''}>${n+1}</button>`).join('')}</div>
      ${button('submit','최종 답안 제출하기','btn primary full')}<p class="small-text muted">제출하면 모범답안과 채점 기준이 열립니다.</p>
      ${button('save','지금 저장','btn small')}${button('lock','저장하고 잠그기','btn small')}</aside></div>`;
  }
  function scoreView() {
    const result = scoreAttempt(attempt);
    return `<div class="result-summary"><div><div class="eyebrow">${attempt.timedOut?'시간 종료로 자동 제출':'최종 답안 제출 완료'}</div><h1 tabindex="-1">최종 모의고사 결과</h1>
      <p>문항과 문항 안의 각 기준은 같은 비중으로 채점합니다.</p></div><div class="score-block"><b>${result.score===null?'—':result.score}<small> / 100</small></b><span>${result.graded} / 21문항 자가채점</span></div></div>`;
  }
  function gradeLabel(i) {
    const grade = attempt.grades[i];
    return grade === null ? '채점 전' : `${Math.round(grade.filter(Boolean).length / grade.length * 100)}% 충족`;
  }
  function resultView() {
    return `<div id="final-score">${scoreView()}</div><div class="result-toolbar"><p>제출한 답안에 실제로 쓴 내용을 기준으로 체크하세요.</p>
      ${button('restart','같은 21문항 다시 풀기','btn')}${button('print','답안 인쇄','btn')}</div><p data-final-save class="small-text muted" role="status"></p>
      <div class="result-list">${data.questions.map((q, i) => `<article class="graded-question final-graded"><div class="question-meta"><span>문항 ${String(i+1).padStart(2,'0')}</span><span class="badge neutral">${esc(topic(q.topic).title)}</span></div>
      <h2>${esc(q.title)}</h2><p class="question-prompt">${esc(q.prompt)}</p><div class="submitted-answer"><small>나의 답안</small><p>${esc(attempt.answers[i].trim()||'작성하지 않은 답안입니다.')}</p></div>
      <div class="model-answer"><small>모범답안</small><p>${esc(q.answer)}</p></div><div class="pitfall"><b>놓치기 쉬운 부분</b> ${esc(q.pitfall)}</div>
      <div class="rubric"><div class="rubric-heading"><h3>내 답안에서 충족한 기준</h3><span class="badge" id="final-grade-${i}">${gradeLabel(i)}</span></div>
      ${q.rubric.map((criterion, n) => `<label class="criterion"><input type="checkbox" data-final-grade="${n}" data-index="${i}" ${attempt.grades[i]?.[n]?'checked':''} ${!attempt.answers[i].trim()?'disabled':''}><span>${esc(criterion)}</span></label>`).join('')}
      <div class="grade-actions">${button('grade-all','모든 기준 충족','btn small',`data-index="${i}" ${!attempt.answers[i].trim()?'disabled':''}`)}${button('grade-none','충족한 기준 없음 · 0점','btn small',`data-index="${i}"`)}</div></div></article>`).join('')}</div>`;
  }
  function render() {
    if (disposed) return;
    confirmFn = null;
    root.innerHTML = key ? nav() + (restoreError ? `<div class="alert" role="alert">${esc(restoreError)} ${button('reset-record','저장 기록 초기화','btn small')}</div>` : '') +
      ({hub:hubView, summary:summaryView, exam:examView, result:resultView}[view] || hubView)() + '<dialog id="final-dialog"></dialog>' : lockedView();
    saveStatus();
  }
  function ask(title, body, label, action) {
    const dialog = $('#final-dialog');
    confirmFn = action;
    dialog.innerHTML = `<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="dialog-actions">${button('cancel','취소')}${button('confirm',esc(label),'btn primary')}</div>`;
    dialog.showModal();
    dialog.querySelector('button').focus();
  }
  function finish(timedOut = false) {
    if (!hasActive()) return;
    attempt = finishAttempt(attempt, data, timedOut);
    persist();
    view = 'result';
    render();
    $('h1')?.focus({preventScroll:true});
    if (timedOut) notify('시간이 끝나 최종 답안을 자동 제출했습니다.');
  }
  function tick() {
    if (!hasActive()) return;
    if (attempt.deadline && Date.now() >= attempt.deadline) {finish(true); return;}
    const timer = $('#final-timer');
    if (timer) {timer.textContent = timeLeft(); timer.parentElement.classList.toggle('urgent', !!attempt.deadline && attempt.deadline-Date.now()<300000);}
  }
  function refreshGrade(i) {
    $('#final-score').innerHTML = scoreView();
    $(`#final-grade-${i}`).textContent = gradeLabel(i);
    root.querySelectorAll(`[data-final-grade][data-index="${i}"]`).forEach(input => {input.checked = attempt.grades[i][Number(input.dataset.finalGrade)];});
    persist();
  }

  root.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'final-unlock-form') {
      const epoch = ++generation;
      const submit = form.querySelector('button');
      submit.disabled = true; submit.textContent = '열고 있어요…';
      const input = $('#final-password');
      let password = input.value;
      $('#final-unlock-error').textContent = '';
      try {
        if (!crypto.subtle) throw new Error('이 브라우저에서는 페이지를 열 수 없습니다. HTTPS 주소로 접속해 주세요.');
        const response = await fetch(new URL('./final.enc.json', import.meta.url), {cache: 'no-store', signal: controller.signal});
        if (!response.ok) throw new Error('페이지 파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        const envelope = await response.json();
        let unlocked;
        try {unlocked = await decryptContent(envelope, password);} catch {throw new Error('비밀번호가 맞지 않습니다. 입력 내용을 확인해 주세요.');}
        password = ''; input.value = '';
        const content = validateContent(unlocked.data);
        await queue;
        if (disposed || epoch !== generation) return;
        let saved = null, restoreMessage = '';
        try {
          const raw = localStorage.getItem(PROGRESS_KEY);
          if (raw) saved = validateAttempt(await decryptProgress(JSON.parse(raw), unlocked.key, content.revision), content);
        } catch {restoreMessage = '이전 최종 답안을 읽지 못했습니다. 기존 저장 기록은 유지했습니다. 새로 시작하려면 기록을 초기화해 주세요.';}
        if (disposed || epoch !== generation) return;
        data = content; key = unlocked.key; attempt = saved; restoreError = restoreMessage;
        view = 'hub'; render(); tick(); $('h1')?.focus({preventScroll:true});
      } catch (error) {
        if (!disposed && epoch === generation) {$('#final-unlock-error').textContent = error.message; input.value = ''; input.focus();}
      } finally {
        password = '';
        if (!disposed && epoch === generation && !key) {submit.disabled = false; submit.textContent = '최종 페이지 열기';}
      }
    }
    if (form.id === 'final-start-form' && key && !restoreError) {
      attempt = createAttempt(data, Number(new FormData(form).get('duration')));
      persist(); openView('exam');
    }
  }, options);
  root.addEventListener('input', event => {
    if (event.target.id !== 'final-answer' || !hasActive()) return;
    tick();
    if (!hasActive()) return;
    attempt.answers[attempt.index] = event.target.value;
    $('#final-answer-count').textContent = `${event.target.value.length}자`;
    $('#final-answered').textContent = `${answered()} / 21`;
    $(`[data-final-action="question"][data-index="${attempt.index}"]`).classList.toggle('answered', !!event.target.value.trim());
    persist();
  }, options);
  root.addEventListener('change', event => {
    const input = event.target;
    if (input.dataset.finalGrade === undefined || !key || !attempt || attempt.finished === null) return;
    const i = Number(input.dataset.index), criterion = Number(input.dataset.finalGrade);
    if (!attempt.answers[i].trim()) return;
    attempt.grades[i] ||= data.questions[i].rubric.map(() => false);
    attempt.grades[i][criterion] = input.checked;
    refreshGrade(i);
  }, options);
  root.addEventListener('click', event => {
    const control = event.target.closest('[data-final-action]');
    if (!control || control.disabled || !key) return;
    const action = control.dataset.finalAction;
    if (['hub','summary','exam'].includes(action)) {openView(action); return;}
    if (action === 'lock') {lock(); return;}
    if (action === 'save') {persist(); return;}
    if (action === 'print') {window.print(); return;}
    if (action === 'cancel') {confirmFn = null; $('#final-dialog').close(); return;}
    if (action === 'confirm') {const callback = confirmFn; confirmFn = null; $('#final-dialog').close(); callback?.(); return;}
    if (action === 'reset-record') {
      ask('이전 최종 답안을 초기화할까요?', '읽을 수 없는 기존 최종 답안 기록을 삭제합니다.', '초기화하고 시작', () => {
        try {localStorage.removeItem(PROGRESS_KEY); restoreError = ''; attempt = null; openView('exam');}
        catch {notify('브라우저 저장소에 접근할 수 없습니다.');}
      }); return;
    }
    if (action === 'restart') {ask('같은 시험을 다시 풀까요?', '이전 최종 답안과 자가채점 결과를 지우고 같은 21문항을 다시 풉니다.', '다시 풀기', () => {attempt = null; persist(); openView('exam');}); return;}
    if (action === 'grade-all' || action === 'grade-none') {
      if (attempt?.finished === null || !attempt) return;
      const i = Number(control.dataset.index);
      if (action === 'grade-all' && !attempt.answers[i].trim()) return;
      attempt.grades[i] = data.questions[i].rubric.map(() => action === 'grade-all'); refreshGrade(i); return;
    }
    tick();
    if (!hasActive()) return;
    if (action === 'question' || action === 'previous' || action === 'next') {
      attempt.index = action === 'question' ? Number(control.dataset.index) : attempt.index + (action === 'next' ? 1 : -1);
      attempt.index = Math.max(0, Math.min(20, attempt.index));
      persist(); render(); $('#final-answer')?.focus({preventScroll:true});
    }
    if (action === 'flag') {attempt.flags = attempt.flags.includes(attempt.index) ? attempt.flags.filter(i => i !== attempt.index) : [...attempt.flags, attempt.index]; persist(); render();}
    if (action === 'submit') ask('최종 답안을 제출할까요?', `21문항 중 ${21-answered()}문항이 미작성입니다. 제출하면 답안 작성은 끝나고 해설과 채점 기준이 열립니다.`, '제출하고 채점하기', () => finish());
  }, options);
  const beforeUnload = event => {if (pending || saveError && hasActive()) {event.preventDefault(); event.returnValue = '';}};
  window.addEventListener('beforeunload', beforeUnload, options);
  window.addEventListener('pagehide', () => {if (key) lock();}, options);
  document.addEventListener('visibilitychange', tick, options);
  const interval = setInterval(tick, 1000);
  render();
  return () => {
    disposed = true; generation += 1;
    controller.abort(); clearInterval(interval);
    data = key = attempt = confirmFn = null;
    root.replaceChildren();
  };
}
