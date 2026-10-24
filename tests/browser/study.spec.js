import {test,expect} from '@playwright/test';
const KEY='infosec-study-v1';
test.beforeEach(async({page})=>{await page.goto('/');});
test('all routes, lesson search, progress, responsive layout and no runtime errors',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await expect(page.locator('h1')).toContainText('오늘의 공부');
 await page.keyboard.press('Tab');await page.keyboard.press('Enter');await expect(page.locator('h1')).toContainText('오늘의 공부');await expect(page.locator('#main')).toBeFocused();
 await page.evaluate(()=>{document.activeElement.blur();scrollTo(0,0)});
 await page.screenshot({path:`.artifacts/dashboard-${info.project.name}.png`,fullPage:true});
 await page.goto('/#/study');await page.locator('#lesson-search').fill('역원');await expect(page.locator('.lesson-card')).not.toHaveCount(0);
 await page.locator('#lesson-search').fill('zzzznoresult');await expect(page.getByText('검색 결과가 없어요')).toBeVisible();
 await page.goto('/#/study/algebra');await page.getByRole('button',{name:'이 단원 학습 완료',exact:true}).click();await expect(page.getByRole('button',{name:'학습 완료 표시 해제',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'학습 완료 표시 해제',exact:true})).toBeVisible();
 for(const route of ['study','study/aes','lab','exam','review']){await page.goto(`/#/${route}`);await expect(page.locator('h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
 await expect(page.locator('a[href="#/sources"]')).toHaveCount(0);
 await page.goto('/#/sources');await expect(page.locator('h1')).toHaveText('페이지를 찾을 수 없어요.');
 expect(errors).toEqual([]);
});
test('exam draft survives reload, submission and self grading populate review, backup roundtrip',async({page})=>{
 await page.goto('/#/exam');await page.getByRole('button',{name:'모의고사 시작'}).click();
 await expect(page.locator('.question-grid button')).toHaveCount(21);
 const ids=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).active.ids,KEY);
 await page.locator('#answer-input').fill('내가 쓴 서술형 답안. 정의와 이유를 설명한다. <img src=x onerror=alert(1)>');
 await page.getByRole('button',{name:'다시 볼 문제',exact:true}).click();
 await page.reload();await expect(page.locator('#answer-input')).toContainText('내가 쓴 서술형 답안');
 await page.getByRole('button',{name:'답안 제출하기'}).click();await expect(page.locator('dialog')).toContainText('20문항이 미작성');
 await page.getByRole('button',{name:'제출하고 채점하기'}).click();
 await expect(page.locator('.graded-question')).toHaveCount(21);
 await expect(page.locator('.submitted-answer img')).toHaveCount(0);
 await page.locator('.graded-question').first().getByRole('button',{name:'모든 기준 충족',exact:true}).click();await expect(page.locator('#result-summary')).toContainText('21 / 21문항');
 await page.locator('.graded-question').first().getByRole('button',{name:'북마크 추가'}).click();
 await page.getByRole('link',{name:'← 시험 기록',exact:true}).click();await expect(page.locator('.history-list a')).toHaveCount(1);
 await page.goto('/#/review');await expect(page.locator('.review-card')).toHaveCount(21);
 await page.locator('.review-card').first().locator('textarea').fill('반드시 전제를 확인한다.');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'백업 내려받기'}).click();const file=await download;const filepath=await file.path();
 await page.getByRole('button',{name:'학습 기록 초기화',exact:true}).click();await page.getByRole('button',{name:'모두 초기화',exact:true}).click();
 await page.locator('#import-file').setInputFiles(filepath);await page.getByRole('button',{name:'기록 가져오기',exact:true}).click();
 const restored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);expect(restored.history).toHaveLength(1);expect(restored.bookmarks).toEqual([ids[0]]);expect(Object.values(restored.notes)).toContain('반드시 전제를 확인한다.');
 await page.goto('/#/review');await page.getByRole('button',{name:'이 목록 다시 풀기'}).click();await expect(page.locator('#answer-input')).toHaveValue('');await expect(page.locator('.question-grid button')).toHaveCount(21);
});
test('expired saved deadline auto-submits and invalid backups preserve state',async({page})=>{
 await page.goto('/#/exam');await page.getByRole('button',{name:'모의고사 시작'}).click();await page.locator('#answer-input').fill('시간 종료 전 답안');
 await page.evaluate(key=>{const s=JSON.parse(localStorage.getItem(key));s.active.deadline=Date.now()-1;localStorage.setItem(key,JSON.stringify(s));},KEY);
 await page.reload();await expect(page.locator('#result-summary')).toContainText('시간 종료로 자동 제출');
 await expect(page.locator('.submitted-answer').first()).toContainText('시간 종료 전 답안');
 await page.goto('/#/review');await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":999}')});await expect(page.locator('#toast')).toContainText('가져오기 실패');
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).history.length,KEY)).toBe(1);
});
test('calculator outputs, malformed inputs and AES 2R end state',async({page},info)=>{
 await page.goto('/#/lab');await page.getByRole('button',{name:'단계별 계산 시작'}).click();await expect(page.locator('#trace-output h2')).toHaveText('입력 평문');
 await page.getByRole('button',{name:'2R · AddRoundKey',exact:true}).click();await expect(page.locator('.byte-string')).toContainText('49 15 59 8f 55 e5 d7 a0 da ca 94 fa 1f 0a 63 f7');
 await page.screenshot({path:`.artifacts/aes-${info.project.name}.png`,fullPage:true});
 await page.locator('[name="plain"]').fill('zz');await page.getByRole('button',{name:'단계별 계산 시작'}).click();await expect(page.locator('.form-error')).toContainText('16바이트');
 await page.getByRole('button',{name:'GF(2⁸) 연산',exact:true}).click();await page.getByRole('button',{name:'연산 확인하기'}).click();await expect(page.locator('#gf-output')).toContainText('57 × 13 = fe');
 await page.getByRole('button',{name:'DES S-box',exact:true}).click();await page.getByRole('button',{name:'행·열·출력 확인'}).click();await expect(page.locator('#des-output')).toContainText('0010');
});
