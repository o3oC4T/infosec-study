import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {bytes,hex,gfMultiply,gfPower,SBOX,shiftRows,mixColumns,aesTrace,desSbox,expandKey} from '../dist/crypto.js';
import * as content from '../dist/content.js';
const {lessons,blueprint}=content;
import {questions,byId,selectExam,questionScore,examScore} from '../dist/questions.js';
import {defaults,newExam,finishExam,validateState,reviewIds} from '../dist/store.js';
test('AES-128 independent OpenSSL vector and documented round states',()=>{
 const plain=bytes('00112233445566778899aabbccddeeff',16),key=bytes('000102030405060708090a0b0c0d0e0f',16);
 const trace=aesTrace(plain,key,10);
 const expected=['00102030405060708090a0b0c0d0e0f0','63cab7040953d051cd60e0e7ba70e18c','6353e08c0960e104cd70b751bacad0e7','5f72641557f5bc92f7be3b291db9f91a','89d810e8855ace682d1843d8cb128fe4','a761ca9b97be8b45d8ad1a611fc97369','a7be1a6997ad739bd8c9ca451f618b61','ff87968431d86a51645151fa773ad009','4915598f55e5d7a0daca94fa1f0a63f7'];
 expected.forEach((s,i)=>assert.deepEqual(trace[i+1].state,bytes(s,16)));
 const cipher=createCipheriv('aes-128-ecb',Buffer.from(key),null);cipher.setAutoPadding(false);const output=Buffer.concat([cipher.update(Buffer.from(plain)),cipher.final()]);
 assert.equal(hex(trace.at(-1).state).replaceAll(' ',''),output.toString('hex'));
 assert.equal(output.toString('hex'),'69c4e0d86a7b0430d8cdb78070b4c55a');
 assert.equal(trace.filter(x=>x.label.includes('MixColumns')).length,9);
 assert.equal(hex(expandKey(key)[1]),'d6 aa 74 fd d2 af 72 fa da a6 78 f1 d6 ab 76 fe');
});
test('AES transformations and all nonzero GF inverses',()=>{
 assert.equal(SBOX[0],0x63);assert.equal(SBOX[0x53],0xed);assert.equal(new Set(SBOX).size,256);
 assert.equal(gfMultiply(0x57,0x13),0xfe);assert.equal(gfMultiply(0x80,2),0x1b);
 for(let i=1;i<256;i++)assert.equal(gfMultiply(i,gfPower(i,254)),1);
 assert.deepEqual(mixColumns([0xdb,0x13,0x53,0x45,...Array(12).fill(0)]).slice(0,4),[0x8e,0x4d,0xa1,0xbc]);
 assert.deepEqual(shiftRows(Array.from({length:16},(_,i)=>i)),[0,5,10,15,4,9,14,3,8,13,2,7,12,1,6,11]);
});
test('inputs reject partial bytes and DES S-box uses outer bits',()=>{
 assert.throws(()=>bytes('gg',1));assert.throws(()=>bytes('1',1));assert.throws(()=>bytes('000',1));
 assert.deepEqual(desSbox('100111'),{row:3,col:3,value:2});assert.throws(()=>desSbox('100112'));
});
test('content covers all lessons and complete unique questions',()=>{
 assert.equal(lessons.filter(l=>l.priority==='core').length,9);assert.equal(lessons.length,11);
 assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);assert.ok(questions.length>=60);
 for(const q of questions){assert.ok(lessons.find(l=>l.id===q.lesson));assert.ok(q.prompt&&q.answer&&q.pitfall);assert.ok(q.rubric.length>=2);}
 for(const l of lessons){assert.ok(l.sections.length>=3);assert.ok(questions.filter(q=>q.lesson===l.id).length>=3);}
});
test('public assets contain learning content without private provenance',()=>{
 assert.deepEqual(Object.keys(content).sort(),['blueprint','lessons','plans']);
 for(const item of [...lessons,...questions]){
  assert.equal(Object.hasOwn(item,'refs'),false);
  assert.equal(Object.hasOwn(item,'evidence'),false);
 }
 const dist=new URL('../dist/',import.meta.url);
 for(const file of readdirSync(dist)){
  if(!/\.(?:js|html|css)$/.test(file))continue;
  assert.doesNotMatch(readFileSync(new URL(file,dist),'utf8'),/후기|필기|교수|회상|기억의 불확실성|자료\s*·\s*기록|(?:L[1-8]|[1-8]장)\s+p\.\s*\d|\.(?:pdf|zip|txt)\b/i,file);
 }
});
test('100 generated exams respect the blueprint, no duplicate or reserve question',()=>{
 for(let i=0;i<100;i++){const ids=selectExam('full');assert.equal(ids.length,21);assert.equal(new Set(ids).size,21);for(const [l,n] of Object.entries(blueprint))assert.equal(ids.filter(id=>byId[id].lesson===l).length,n);}
 assert.equal(selectExam('quick').length,5);assert.equal(selectExam('topic','rsa').length,4);assert.equal(selectExam('topic','extras').length,3);
});
test('explicit self-assessment, empty answers, recent review and persistence',()=>{
 const e=newExam(['g1','g2'],60,'시험',1000);assert.equal(e.deadline,3601000);e.answers.g1='내가 작성한 답';
 const submitted=finishExam(e,7000);assert.equal(submitted.grades.g1,undefined);assert.deepEqual(submitted.grades.g2,[false,false,false]);assert.equal(examScore(submitted).graded,1);
 submitted.grades.g1=[true,false];assert.equal(examScore(submitted).score,25);
 const s=defaults();s.history=[submitted];assert.deepEqual(new Set(reviewIds(s)),new Set(['g1','g2']));assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);
 const retry=finishExam(newExam(['g1'],0,'재시험',8000),9000);retry.answers.g1='올바른 답';retry.grades.g1=[true,true];s.history.unshift(retry);assert.deepEqual(reviewIds(s),['g2']);s.bookmarks=['g1'];assert.deepEqual(new Set(reviewIds(s)),new Set(['g1','g2']));
 assert.equal(questionScore(byId.g1,undefined),null);
});
test('backup validation rejects malformed data without mutating current state',()=>{
 assert.throws(()=>validateState({version:5}));const invalid=defaults();invalid.active=newExam(['g1'],0,'test');invalid.active.id='injected-id';assert.throws(()=>validateState(invalid));const s=defaults();s.done=['missing'];assert.throws(()=>validateState(s));
 const t=defaults();const e=finishExam(newExam(['g1'],0,'test'),Date.now());e.grades.g1=[true];t.history=[e];assert.throws(()=>validateState(t));
});
