// Educational transformations over small, user-entered examples; no external targets.
export const hex = (a) => Array.from(a, x => x.toString(16).padStart(2,'0')).join(' ');
export function bytes(s, length) {
  const clean=s.replace(/\s/g,'');
  if(!/^[0-9a-f]+$/i.test(clean)||clean.length!==length*2) throw new Error(`${length}바이트를 16진수 ${length*2}자리로 입력해 주세요.`);
  return Array.from({length},(_,i)=>parseInt(clean.slice(i*2,i*2+2),16));
}
export function gfMultiply(a,b){
  let p=0;
  for(let i=0;i<8;i++){if(b&1)p^=a; a=((a<<1)^((a&128)?0x11b:0))&255;b>>>=1;}
  return p;
}
export function gfPower(a,n){let r=1;while(n){if(n&1)r=gfMultiply(r,a);a=gfMultiply(a,a);n>>>=1;}return r;}
const rot=(v,n)=>((v<<n)|(v>>>(8-n)))&255;
export const SBOX=Array.from({length:256},(_,i)=>{const v=i===0?0:gfPower(i,254);return v^rot(v,1)^rot(v,2)^rot(v,3)^rot(v,4)^0x63;});
export function subBytes(s){return s.map(x=>SBOX[x]);}
export function shiftRows(s){return s.map((_,i)=>s[(i%4)+4*((Math.floor(i/4)+i%4)%4)]);}
export function mixColumns(s){
  const out=[];const matrix=[[2,3,1,1],[1,2,3,1],[1,1,2,3],[3,1,1,2]];
  for(let c=0;c<4;c++) for(let r=0;r<4;r++)out[c*4+r]=matrix[r].reduce((v,k,i)=>v^gfMultiply(k,s[c*4+i]),0);
  return out;
}
export const addRoundKey=(s,k)=>s.map((x,i)=>x^k[i]);
export function expandKey(key){
  if(key.length!==16)throw new Error('AES-128 키는 16바이트입니다.');
  const w=key.slice();let rcon=1;
  for(let i=16;i<176;i+=4){let t=w.slice(i-4,i);if(i%16===0){t=[SBOX[t[1]]^rcon,SBOX[t[2]],SBOX[t[3]],SBOX[t[0]]];rcon=gfMultiply(rcon,2);}for(let j=0;j<4;j++)w.push(w[i-16+j]^t[j]);}
  return Array.from({length:11},(_,i)=>w.slice(i*16,i*16+16));
}
export function aesTrace(plain,key,rounds=2){
  const keys=expandKey(key);let s=plain.slice();const steps=[{label:'입력 평문',detail:'위에서 아래로 한 열을 채우고, 다음 열로 이동합니다.',state:s}];
  s=addRoundKey(s,keys[0]);steps.push({label:'초기 AddRoundKey',detail:'평문 ⊕ 원래 키. 아직 1라운드를 시작하기 전입니다.',state:s,key:keys[0]});
  for(let r=1;r<=rounds;r++){
    s=subBytes(s);steps.push({label:`${r}R · SubBytes`,detail:'각 바이트를 AES S-box 값으로 치환합니다. 예: 00 → 63, 53 → ed.',state:s});
    s=shiftRows(s);steps.push({label:`${r}R · ShiftRows`,detail:'0, 1, 2, 3행을 각각 왼쪽으로 0, 1, 2, 3칸 순환 이동합니다.',state:s});
    if(r!==10){s=mixColumns(s);steps.push({label:`${r}R · MixColumns`,detail:'각 열에 고정 행렬을 GF(2⁸) 위에서 곱합니다. 2라운드도 일반 라운드이므로 이 단계를 수행합니다.',state:s});}
    s=addRoundKey(s,keys[r]);steps.push({label:`${r}R · AddRoundKey`,detail:`상태 ⊕ ${r}번 라운드키. AES-128의 실제 마지막 라운드는 10라운드입니다.`,state:s,key:keys[r]});
  }
  return steps;
}
export const DES_S1=[
 [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7],
 [0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8],
 [4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0],
 [15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13]
];
export function desSbox(bits){if(!/^[01]{6}$/.test(bits))throw new Error('0과 1로 이루어진 6비트를 입력해 주세요.');const row=parseInt(bits[0]+bits[5],2),col=parseInt(bits.slice(1,5),2);return {row,col,value:DES_S1[row][col]};}
