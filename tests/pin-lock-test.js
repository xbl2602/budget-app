/* ============================================================
   PIN 锁 —— 设 PIN / 改 PIN / 关 PIN / 锁定 / 解锁，都不许丢数据
   ------------------------------------------------------------
   缺陷（RULES #20 三问已核）：
     ① 用户走得到吗？走得到：设 PIN → 继续记账 → 空闲自动锁定 → 输 PIN 解锁。
        写入点：budgetAppDataEncrypted 只在 setPin()/changePin() 里写，
        而 save() 只写明文，所以密文永远停在「设 PIN 那一刻」。
     ② 有没有相反的显式不变量？没有。lockApp() 的注释写的是
        "Save current state then clear plaintext"，意图就是保住当前状态。
     ③ 历史文档有没有说「密文过期是设计」？没有。
   同一个根因还藏在 changePin（拿旧密文当明文重新加密）、clearPin（拿旧密文
   覆盖新明文）、unlockData（拿旧密文覆盖新明文）里。

   驱动的是真实的界面函数：saveNewPin / saveChangedPin / confirmClearPin /
   lockApp / submitPin，不是复制品。

   跑法： bash build.sh && node tests/pin-lock-test.js
   ============================================================ */
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');const {webcrypto}=require('crypto');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function stub(){const n=()=>{};return{canvas:null,setTransform:n,scale:n,translate:n,rotate:n,clearRect:n,fillRect:n,strokeRect:n,beginPath:n,closePath:n,moveTo:n,lineTo:n,arc:n,arcTo:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,stroke:n,clip:n,fillText:n,strokeText:n,measureText:()=>({width:10}),save:n,restore:n,createLinearGradient:()=>({addColorStop:n}),createRadialGradient:()=>({addColorStop:n}),createPattern:()=>({}),drawImage:n,getImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData:n,roundRect:n,resetTransform:n,lineWidth:1,fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,font:'10px sans-serif',textAlign:'left',textBaseline:'alphabetic',lineCap:'butt',lineJoin:'miter',shadowBlur:0,shadowColor:'transparent'};}
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){const s=stub();w.HTMLCanvasElement.prototype.getContext=function(){this._stub=s;s.canvas=this;return s;};w.CanvasRenderingContext2D=function(){};w.CanvasRenderingContext2D.prototype.roundRect=function(){return this;};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,AAA';w.URL.createObjectURL=()=>'blob:stub';w.URL.revokeObjectURL=()=>{};const q=()=>{};w.console={log:q,warn:q,error:q,info:q,debug:q};
  // jsdom 没有 crypto.subtle：注入 Node 的 WebCrypto，跑的仍是 App 里真实的 PIN 代码。
  Object.defineProperty(w,'crypto',{value:webcrypto,configurable:true});}});
const {window:w}=dom;
const doc=w.document, LS=w.localStorage;

setTimeout(async()=>{
const DS=w.DataStore;const L=(...a)=>console.log(...a);
const cat=DS.getCategories()[0].id;
let pass=0,fail=0;
const ok=(n,c,extra)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(extra?' — '+extra:''));} };
const mk=(n,note)=>({amount:n,categoryId:cat,date:'2026-09-28T10:00',note,tags:[]});
const notes=()=>DS.getRecords().map(r=>r.note).sort().join(',');

// —— 真实界面入口的薄封装：填表单 → 调 App 自己的函数 ——
function val(id,v){const el=doc.getElementById(id);if(!el)throw new Error('缺少输入框 #'+id);el.value=v;}
async function uiSetPin(pin){w.showSetPinModal();val('newPinInput',pin);val('confirmPinInput',pin);await w.saveNewPin();}
async function uiChangePin(o,n){w.showChangePinModal();val('oldPinInput',o);val('newPinInput2',n);val('confirmPinInput2',n);await w.saveChangedPin();}
async function uiClearPin(pin){w.showClearPinModal();val('clearPinInput',pin);await w.confirmClearPin();}
async function uiLock(){await w.lockApp();}
async function uiUnlock(pin){val('pinInput',pin);await w.submitPin();}
// 模拟「关掉标签页再打开」：内存里的密钥没了，localStorage 原样保留
function reopenTab(){DS._pinKey=null;w._pinRequired=false;DS.init();}
function reset(){LS.clear();DS._pinKey=null;w._pinRequired=false;doc.getElementById('modalContent')&&(doc.getElementById('modalContent').innerHTML='');
  DS._data=DS._defaults();DS.save();}
const decryptBlob=async pin=>DS._decryptData(pin,DS._hexToArrayBuffer(LS.getItem('budgetAppSalt')));

L('【PIN-1】设 PIN 之后继续记账 → 自动锁定 → 解锁：一条都不能少（原始缺陷）');
reset();
DS.addRecord(mk(1,'R0-设PIN前'));
await uiSetPin('1234');
ok('设 PIN 后内存里持有密钥（锁定时用它重新加密）', !!DS._pinKey);
DS.addRecord(mk(2,'R1-设PIN后'));
DS.addRecord(mk(3,'R2-设PIN后'));
await uiLock();
const keyAfterLock=DS._pinKey;   // 先取：decryptBlob() 自己会把密钥缓存回去，会污染这条断言
ok('锁定后处于锁定状态', w._pinRequired===true);
ok('锁定后 localStorage 里没有明文账本', LS.getItem('budgetAppData')===null);
ok('锁定后内存里不再留着解密密钥', keyAfterLock===null||keyAfterLock===undefined);
const blobAtLock=await decryptBlob('1234');
ok('锁定时密文已刷新：解开后包含设 PIN 之后记的两条', !!blobAtLock && blobAtLock.includes('R1-设PIN后') && blobAtLock.includes('R2-设PIN后'));
await uiUnlock('1234');
ok('解锁成功', w._pinRequired===false);
ok('解锁后三条记录都在', notes()==='R0-设PIN前,R1-设PIN后,R2-设PIN后', notes());

L('【PIN-2】错误 PIN 不解锁、也不损坏数据');
await uiLock();
await uiUnlock('9999');
ok('错误 PIN：仍锁定', w._pinRequired===true);
await uiUnlock('1234');
ok('随后输对：三条都在', notes()==='R0-设PIN前,R1-设PIN后,R2-设PIN后', notes());

L('【PIN-3】多轮 锁定 → 解锁 → 再记账，持续累积');
reset();
await uiSetPin('1234');
const got=[];
for(let i=0;i<3;i++){
  DS.addRecord(mk(i+1,'C'+i));got.push('C'+i);
  await uiLock();await uiUnlock('1234');
}
ok('三轮之后三条都在', notes()===got.sort().join(','), notes());

L('【PIN-4】改 PIN：改之前记的账不能被旧密文覆盖');
reset();
DS.addRecord(mk(1,'R0'));
await uiSetPin('1234');
DS.addRecord(mk(2,'R1-设PIN后'));
await uiChangePin('1234','5678');
const afterChange=await decryptBlob('5678');
ok('改完立刻用新 PIN 解开密文：含 R1', !!afterChange && afterChange.includes('R1-设PIN后'));
ok('旧 PIN 已失效', (await DS.verifyPin('1234'))===false);
DS.addRecord(mk(3,'R2-改PIN后'));
await uiLock();await uiUnlock('5678');
ok('用新 PIN 解锁后三条都在', notes()==='R0,R1-设PIN后,R2-改PIN后', notes());

L('【PIN-5】关 PIN：内存里更新的账本不能被旧密文覆盖');
reset();
DS.addRecord(mk(1,'R0'));
await uiSetPin('1234');
DS.addRecord(mk(2,'R1-设PIN后'));
await uiClearPin('1234');
ok('关 PIN 后 PIN 相关键已清除', !LS.getItem('budgetAppPinHash')&&!LS.getItem('budgetAppSalt')&&!LS.getItem('budgetAppDataEncrypted'));
reopenTab();
ok('关 PIN 后重新打开：R0、R1 都在', notes()==='R0,R1-设PIN后', notes());

L('【PIN-6】关掉标签页再打开（没有密钥）：随后自动锁定 → 解锁，不丢数据');
reset();
DS.addRecord(mk(1,'R0'));
await uiSetPin('1234');
DS.addRecord(mk(2,'R1-设PIN后'));
reopenTab();
ok('重新打开时明文还在，未弹 PIN（既有行为，未改）', w._pinRequired!==true && notes()==='R0,R1-设PIN后', notes());
DS.addRecord(mk(3,'R2-重开后'));
await uiLock();
await uiUnlock('1234');
ok('锁定 → 解锁后三条都在', notes()==='R0,R1-设PIN后,R2-重开后', notes());
DS.addRecord(mk(4,'R3-解锁后'));
await uiLock();
ok('解锁后已经拿到密钥，第二次锁定时密文是新的', ((await decryptBlob('1234'))||'').includes('R3-解锁后'));
await uiUnlock('1234');
ok('第二次解锁后四条都在', notes()==='R0,R1-设PIN后,R2-重开后,R3-解锁后', notes());

L('【PIN-7】锁定状态下刷新页面，再解锁');
reset();
DS.addRecord(mk(1,'R0'));
await uiSetPin('1234');
DS.addRecord(mk(2,'R1-设PIN后'));
await uiLock();
DS._pinKey=null;DS.init();
ok('刷新后要求输 PIN', w._pinRequired===true);
await uiUnlock('1234');
ok('解锁后两条都在', notes()==='R0,R1-设PIN后', notes());

L('【PIN-8】没设 PIN：lockApp 什么都不做');
reset();
DS.addRecord(mk(1,'R0'));
await uiLock();
ok('未锁定、明文仍在、记录仍在', w._pinRequired!==true && LS.getItem('budgetAppData')!==null && notes()==='R0');

L('【PIN-9】PIN 校验值不再是可秒破的单次 SHA-256');
reset();
DS.addRecord(mk(1,'R0'));
await uiSetPin('1234');
const chk=LS.getItem('budgetAppPinHash')||'';
const saltBuf=DS._hexToArrayBuffer(LS.getItem('budgetAppSalt'));
ok('校验值是 v2 格式（PBKDF2 密钥加密的标记）', chk.indexOf('v2:')===0, chk.slice(0,12));
ok('校验值不等于 SHA-256(salt‖pin)', chk!==await DS._legacyHashPin('1234',saltBuf));
ok('正确 PIN 通过校验', (await DS.verifyPin('1234'))===true);
ok('错误 PIN 不通过校验', (await DS.verifyPin('0000'))===false);

L('【PIN-10】旧版 SHA-256 校验值：输对 PIN 解锁时自动升级，数据不丢');
reset();
DS.addRecord(mk(1,'R0'));
await uiSetPin('1234');
DS.addRecord(mk(2,'R1-设PIN后'));
await uiLock();
// 伪造旧版本留下的存储：同一盐、同一密文，只是校验值是旧的 SHA-256 十六进制
LS.setItem('budgetAppPinHash', await DS._legacyHashPin('1234',DS._hexToArrayBuffer(LS.getItem('budgetAppSalt'))));
DS._pinKey=null;DS.init();
ok('旧格式下刷新后要求输 PIN', w._pinRequired===true);
await uiUnlock('9999');
ok('旧格式 + 错误 PIN：仍锁定、校验值未被改动', w._pinRequired===true && !/^v2:/.test(LS.getItem('budgetAppPinHash')));
await uiUnlock('1234');
ok('旧格式 + 正确 PIN：解锁成功', w._pinRequired===false);
ok('解锁后校验值已升级为 v2', /^v2:/.test(LS.getItem('budgetAppPinHash')||''));
ok('升级后两条记录都在', notes()==='R0,R1-设PIN后', notes());
await uiLock();await uiUnlock('1234');
ok('升级后再锁定 → 解锁仍正常', w._pinRequired===false && notes()==='R0,R1-设PIN后', notes());
ok('升级后错误 PIN 仍被拒', (await DS.verifyPin('4321'))===false);

console.log('\n结果: '+pass+' 通过 / '+fail+' 失败');
process.exit(fail?1:0);
},1500);
