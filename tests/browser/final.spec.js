import {test,expect} from '@playwright/test';
import {encryptContent} from '../../dist/final-vault.js';
import {fixture} from '../helpers/final-fixture.mjs';
const PASSWORD='synthetic-password-for-tests';
const KEY='infosec-final-progress-v1';
let encrypted;
test.beforeAll(async()=>{encrypted=await encryptContent(fixture(),PASSWORD);});
test.beforeEach(async({page})=>{
  await page.route('**/final.enc.json',route=>route.fulfill({json:encrypted}));
  await page.goto('/#/final');
});
async function unlock(page){
  await page.getByLabel('비밀번호',{exact:true}).fill(PASSWORD);
  await page.getByRole('button',{name:'최종 페이지 열기',exact:true}).click();
  await expect(page.getByRole('button',{name:'항목 요약 보기 →',exact:true})).toBeVisible();
}
async function saved(page){await expect(page.locator('[data-final-save]')).toHaveText('이 브라우저에 저장됨');}

test('password gates direct routes, summary and fixed exam; leaving or locking hides content',async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await expect(page.getByRole('link',{name:'최종 페이지',exact:true})).toBeVisible();
  await expect(page.getByText('테스트 항목 1',{exact:true})).toHaveCount(0);
  await page.getByLabel('비밀번호',{exact:true}).fill('incorrect');
  await page.getByRole('button',{name:'최종 페이지 열기',exact:true}).click();
  await expect(page.locator('#final-unlock-error')).toContainText('비밀번호가 맞지 않습니다');
  await page.goto('/#/final/summary');await expect(page.locator('#final-password')).toBeVisible();
  await unlock(page);
  await page.getByRole('button',{name:'항목 요약 보기 →',exact:true}).click();
  await expect(page.locator('.final-topic')).toHaveCount(13);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await page.screenshot({path:`.artifacts/final-summary-${info.project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:'잠그기',exact:true}).click();
  await expect(page.locator('#final-password')).toBeVisible();await expect(page.locator('.final-topic')).toHaveCount(0);
  await unlock(page);await page.goto('/#/home');await page.goto('/#/final');await expect(page.locator('#final-password')).toBeVisible();
  expect(await page.evaluate(()=>sessionStorage.length)).toBe(0);
  expect(errors).toEqual([]);
});
test('encrypted draft survives reload; fixed ordering, self grading and restart work',async({page})=>{
  await unlock(page);await page.getByRole('button',{name:'최종 모의고사 열기 →',exact:true}).click();
  await page.getByRole('button',{name:'최종 모의고사 시작',exact:true}).click();
  await expect(page.locator('.final-question-grid button')).toHaveCount(21);
  await expect(page.locator('.answer-card h2')).toHaveText('테스트 문항 1');
  await expect(page.locator('.model-answer')).toHaveCount(0);
  const answer='최종 답안 비공개 저장 <img src=x onerror=alert(1)>';
  await page.locator('#final-answer').fill(answer);await saved(page);
  const raw=await page.evaluate(key=>localStorage.getItem(key),KEY);expect(raw).not.toContain(answer);
  expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['ciphertext','iv']);
  await page.reload();await expect(page.locator('#final-password')).toBeVisible();await unlock(page);
  await page.getByRole('button',{name:'작성하던 모의고사 이어가기 →',exact:true}).click();
  await expect(page.locator('#final-answer')).toHaveValue(answer);
  await page.getByRole('button',{name:'21번 문제',exact:true}).click();await expect(page.locator('.answer-card h2')).toHaveText('테스트 문항 21');
  await page.getByRole('button',{name:'1번 문제',exact:true}).click();
  await page.getByRole('button',{name:'최종 답안 제출하기',exact:true}).click();
  await expect(page.locator('#final-dialog')).toContainText('20문항이 미작성');
  await page.getByRole('button',{name:'제출하고 채점하기',exact:true}).click();
  await expect(page.locator('.final-graded')).toHaveCount(21);
  await expect(page.locator('.submitted-answer img')).toHaveCount(0);
  await expect(page.locator('#final-score')).toContainText('20 / 21문항');
  await page.locator('.final-graded').first().getByRole('button',{name:'모든 기준 충족',exact:true}).click();
  await expect(page.locator('#final-score')).toContainText('21 / 21문항');await expect(page.locator('#final-score .score-block>b')).toHaveText(/5\s*\/\s*100/);
  await saved(page);await page.getByRole('button',{name:'잠그기',exact:true}).click();await unlock(page);
  await page.getByRole('button',{name:'제출한 최종 모의고사 보기 →',exact:true}).click();await expect(page.locator('#final-score')).toContainText('21 / 21문항');
  await page.getByRole('button',{name:'같은 21문항 다시 풀기',exact:true}).click();await page.locator('#final-dialog').getByRole('button',{name:'취소',exact:true}).click();
  await expect(page.locator('.final-graded')).toHaveCount(21);
  await page.getByRole('button',{name:'같은 21문항 다시 풀기',exact:true}).click();await page.locator('#final-dialog').getByRole('button',{name:'다시 풀기',exact:true}).click();
  await page.getByRole('button',{name:'최종 모의고사 시작',exact:true}).click();await expect(page.locator('.answer-card h2')).toHaveText('테스트 문항 1');await expect(page.locator('#final-answer')).toHaveValue('');await saved(page);
});
test('deadline expires while locked and corrupt saved data is preserved until confirmed reset',async({page})=>{
  await page.clock.install();
  await unlock(page);await page.getByRole('button',{name:'최종 모의고사 열기 →',exact:true}).click();
  await page.getByRole('button',{name:'최종 모의고사 시작',exact:true}).click();
  await page.locator('#final-answer').fill('종료 전에 남긴 답안');await saved(page);
  await page.getByRole('button',{name:'잠그기',exact:true}).click();
  await page.clock.fastForward('01:00:01');
  await page.getByLabel('비밀번호',{exact:true}).fill(PASSWORD);await page.getByRole('button',{name:'최종 페이지 열기',exact:true}).click();
  await expect(page.locator('#final-score')).toContainText('시간 종료로 자동 제출');
  await expect(page.locator('.submitted-answer').first()).toContainText('종료 전에 남긴 답안');await saved(page);
  await page.evaluate(key=>localStorage.setItem(key,'{"iv":"invalid","ciphertext":"invalid"}'),KEY);
  await page.reload();await unlock(page);await expect(page.locator('#final-root .alert')).toContainText('기존 저장 기록은 유지');
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toContain('invalid');
  await page.getByRole('button',{name:'최종 모의고사 열기 →',exact:true}).click();await expect(page.getByRole('button',{name:'최종 모의고사 시작',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'저장 기록 초기화',exact:true}).click();await page.getByRole('button',{name:'초기화하고 시작',exact:true}).click();
  await expect(page.getByRole('button',{name:'최종 모의고사 시작',exact:true})).toBeEnabled();
});
