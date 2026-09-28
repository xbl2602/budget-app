/* ============================================================
   云同步 · 三方合并（DataStore._merge3 / _mergeData(incoming,{base})）
   ------------------------------------------------------------
   对应 docs/superpowers/specs/2026-09-28-cloud-sync-design-v2.md §7 与 §13 的 M 系列。
   两台「设备」都是真实 App 的账本：所有改动都通过 App 自己的函数完成
   （deleteRecord / applyRepayment / setPlanOverride / syncPlanRecords …），
   不是手写的 JSON 差异。

   跑法： bash build.sh && node tests/cloud-merge-test.js
   ============================================================ */
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function stub(){const n=()=>{};return{canvas:null,setTransform:n,scale:n,translate:n,rotate:n,clearRect:n,fillRect:n,strokeRect:n,beginPath:n,closePath:n,moveTo:n,lineTo:n,arc:n,arcTo:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,stroke:n,clip:n,fillText:n,strokeText:n,measureText:()=>({width:10}),save:n,restore:n,createLinearGradient:()=>({addColorStop:n}),createRadialGradient:()=>({addColorStop:n}),createPattern:()=>({}),drawImage:n,getImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData:n,roundRect:n,resetTransform:n,setLineDash:n,lineWidth:1,fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,font:'10px sans-serif',textAlign:'left',textBaseline:'alphabetic',lineCap:'butt',lineJoin:'miter',shadowBlur:0,shadowColor:'transparent'};}
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){const s=stub();w.HTMLCanvasElement.prototype.getContext=function(){this._stub=s;s.canvas=this;return s;};w.CanvasRenderingContext2D=function(){};w.CanvasRenderingContext2D.prototype.roundRect=function(){return this;};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,AAA';w.URL.createObjectURL=()=>'blob:stub';w.URL.revokeObjectURL=()=>{};const q=()=>{};w.console={log:q,warn:q,error:q,info:q,debug:q};}});
const {window:w}=dom;

setTimeout(async()=>{
const DS=w.DataStore,SE=w.SplitEngine;const L=(...a)=>console.log(...a);
let pass=0,fail=0;
const ok=(n,c,extra)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(extra?' — '+extra:''));} };
const clone=x=>JSON.parse(JSON.stringify(x));
const canon=x=>DS._canonStringify(x);
const merge=(b,l,r)=>DS._merge3(b,l,r);
const cat=DS.getCategories()[0].id;
const setLedger=d=>{DS._data=DS._normalize(clone(d));DS._rev=(DS._rev||0)+1;};
// 「一台设备」：从底稿出发，用 App 自己的函数改一通，返回它最终的账本
const device=(base,ops)=>{setLedger(base);ops();return clone(DS._data);};
const alice=d=>d.splitBills.find(b=>b.id==='sb1').participants[0];

const T0='2026-09-01T00:00:00.000Z';
const fixture={
  records:[
    {id:'r1',amount:10,categoryId:cat,date:'2026-09-01T10:00',note:'将被 A 删除',tags:[],createdAt:T0},
    {id:'r2',amount:20,categoryId:cat,date:'2026-09-02T10:00',note:'将被 B 改金额',tags:[],createdAt:T0},
    {id:'r3',amount:200,categoryId:cat,date:'2026-09-03T12:00',note:'分摊餐',tags:[],splitBillId:'sb1',createdAt:T0}],
  categories:DS.getCategories(),
  contacts:[{id:'c1',name:'Alice'}],
  splitBills:[{id:'sb1',amount:200,date:'2026-09-03',categoryId:cat,selfShare:100,payer:'self',mode:'equal',note:'s',archived:false,
    createdAt:T0,updatedAt:T0,participants:[{contactId:'c1',name:'Alice',share:100,paid:false,paidAmount:0}]}],
  purchasePlans:[{id:'pl1',name:'手机',mode:'credit',status:'active',totalAmount:600,months:6,startMonth:'2026-08',
    categoryId:cat,overrides:{'2026-10':200},createdAt:T0,updatedAt:T0}]
};
setLedger(fixture);
const base=clone(DS._data);

L('【M1–M6】两台设备从同一份底稿出发，各自离线改了一堆东西');
const A=device(base,()=>{
  DS.deleteRecord('r1');
  DS.addRecord({amount:1,categoryId:cat,date:'2026-09-28T09:00',note:'A 新记',tags:[]});
  SE.applyRepayment([{billId:'sb1',contactKey:'c1',amount:50}]);
  DS.setPlanOverride('pl1','2026-10',null);
  w.syncPlanRecords();
});
const B=device(base,()=>{
  DS.addRecord({amount:2,categoryId:cat,date:'2026-09-28T09:05',note:'B 新记',tags:[]});
  SE.applyRepayment([{billId:'sb1',contactKey:'c1',amount:30}]);
  DS.updateRecord('r2',{amount:25});
  w.syncPlanRecords();
});
const R=merge(base,B,A), M=R.data;
const notes=M.records.map(r=>r.note);
const planRecs=M.records.filter(r=>r.planId==='pl1');
ok('M1 A 删掉的 r1 没有复活', !M.records.some(r=>r.id==='r1'));
ok('M2 A 新记、B 新记都在', notes.includes('A 新记')&&notes.includes('B 新记'));
ok('   B 把 r2 改成 25 生效', M.records.find(r=>r.id==='r2').amount===25);
ok('M3 还款 50 + 30 = 80（不是 50）', alice(M).paidAmount===80, '实际 '+alice(M).paidAmount);
ok('M5 A 删掉的 10 月计划干预没有复活', !('2026-10' in M.purchasePlans[0].overrides), JSON.stringify(M.purchasePlans[0].overrides));
ok('M6 两台设备各自补建的分期记录没有翻倍', planRecs.length===A.records.filter(r=>r.planId).length,
  '合并后 '+planRecs.length+'（A '+A.records.filter(r=>r.planId).length+'，B '+B.records.filter(r=>r.planId).length+'）');
ok('   分期记录去重后每个 (计划,月份) 恰好一条', new Set(planRecs.map(r=>r.planMonth)).size===planRecs.length);
ok('   没有需要人工处理的冲突', R.conflicts.length===0, JSON.stringify(R.conflicts));
ok('M7 交换两边顺序，结果完全一致（交换律）', canon(M)===canon(merge(base,A,B).data));
ok('M7 merge(x,x,x)=x（幂等）', canon(merge(A,A,A).data)===canon(A));
ok('M7 已同步过的一方再合并对方：merge(base,A,A)=A', canon(merge(base,A,A).data)===canon(A));

L('【M4】撤销还款不能被吃掉，还清后再记也不超额');
const base2=device(base,()=>SE.applyRepayment([{billId:'sb1',contactKey:'c1',amount:50}]));
const A2=device(base2,()=>SE.setSplitPaidAmount('sb1','c1',0));
const B2=device(base2,()=>SE.applyRepayment([{billId:'sb1',contactKey:'c1',amount:30}]));
ok('50 被撤销、新收的 30 保留 → 30', alice(merge(base2,B2,A2).data).paidAmount===30, '实际 '+alice(merge(base2,B2,A2).data).paidAmount);
const A2b=device(base2,()=>SE.setSplitPaidAmount('sb1','c1',100));
const M4=merge(base2,B2,A2b).data;
ok('A 标记还清、B 又记 30 → 封顶 100 且 paid=true', alice(M4).paidAmount===100&&alice(M4).paid===true, JSON.stringify(alice(M4)));

L('【M-旧格式】只有 paid 布尔值的旧分摊账单：合并不能把「已还清」变成「未还」');
const legacyBill=(paid)=>({id:'sbL',amount:100,date:'2026-08-01',categoryId:cat,selfShare:50,payer:'self',mode:'equal',note:'旧',archived:false,
  participants:[{contactId:'c1',name:'Alice',share:50,paid}]});
const lb={...clone(base),splitBills:[legacyBill(true)]};
const lA={...clone(lb),records:[...lb.records,{id:'rA',amount:1,categoryId:cat,date:'2026-09-20T10:00',note:'A',tags:[],createdAt:T0}]};
const lB={...clone(lb),records:[...lb.records,{id:'rB',amount:2,categoryId:cat,date:'2026-09-21T10:00',note:'B',tags:[],createdAt:T0}]};
const lm=merge(lb,lA,lB).data;
ok('旧格式参与者 paid=true 原样保留', lm.splitBills[0].participants[0].paid===true);
ok('且没有被凭空加上 paidAmount 字段', !('paidAmount' in lm.splitBills[0].participants[0]), JSON.stringify(lm.splitBills[0].participants[0]));

L('【M9】一边删、一边改：保留修改的（钱的数据宁可多留），并记冲突；分摊账单的关联记录一并补回');
const A9=device(base,()=>DS.deleteRecord('r3'));            // 级联：账单 sb1 与关联记录 r3 一起没了
ok('   前提：A 端确实级联删掉了账单和记录', !A9.splitBills.some(b=>b.id==='sb1')&&!A9.records.some(r=>r.id==='r3'));
const B9=device(base,()=>SE.applyRepayment([{billId:'sb1',contactKey:'c1',amount:30}]));
for(const [name,l,r] of [['本机=B、云端=A',B9,A9],['本机=A、云端=B',A9,B9]]){
  const m9=merge(base,l,r);
  ok('M9 ('+name+') 被修改的账单保留，还款 30 在', alice(m9.data).paidAmount===30);
  ok('M9 ('+name+') 它的关联记录 r3 一并补回', m9.data.records.some(x=>x.id==='r3'&&x.splitBillId==='sb1'));
  ok('M9 ('+name+') 记成一条「删除 vs 修改」冲突', m9.conflicts.filter(c=>c.kind==='delete-vs-edit').length>=1, JSON.stringify(m9.conflicts));
}
L('【M9b】一边删整条链、另一边给该账单新增了关联记录：账单不能丢下孤儿记录');
const B9b=device(base,()=>DS.addRecord({amount:5,categoryId:cat,date:'2026-09-25T10:00',note:'新关联',tags:[],splitBillId:'sb1'}));
const m9b=merge(base,B9b,A9).data;
ok('新关联记录还在', m9b.records.some(r=>r.note==='新关联'));
ok('它的账单被恢复，没有孤儿', m9b.splitBills.some(b=>b.id==='sb1'));
ok('A 已经删掉的旧关联记录 r3 仍然是删除', !m9b.records.some(r=>r.id==='r3'));

L('【M10】allTags / tagColors / budgets / 嵌套的 billAmounts / colorIndex / lastActiveMonth');
const A10=device(base,()=>{
  DS._data.allTags=['旅行'];DS._data.tagColors={'旅行':'#111111'};
  DS._data.budgets['2026-09']=1000;DS._data.billAmounts={'2026-09':{b1:50}};
  DS._data.colorIndex=20;DS._data.lastActiveMonth='2026-09';
});
const B10=device(base,()=>{
  DS._data.allTags=['餐饮'];DS._data.tagColors={'餐饮':'#222222'};
  DS._data.budgets['2026-10']=2000;DS._data.billAmounts={'2026-09':{b2:70}};
  DS._data.colorIndex=25;DS._data.lastActiveMonth='2026-10';
});
const m10=merge(base,A10,B10).data;
ok('allTags 取并集', canon(m10.allTags)===canon(['旅行','餐饮']), JSON.stringify(m10.allTags));
ok('tagColors 各自的都在', m10.tagColors['旅行']==='#111111'&&m10.tagColors['餐饮']==='#222222');
ok('budgets 各自的月份都在', m10.budgets['2026-09']===1000&&m10.budgets['2026-10']===2000);
ok('嵌套 billAmounts 按叶子合并：b1、b2 都在', m10.billAmounts['2026-09'].b1===50&&m10.billAmounts['2026-09'].b2===70, JSON.stringify(m10.billAmounts));
ok('colorIndex 取大（不回退）', m10.colorIndex===25);
ok('lastActiveMonth 取大', m10.lastActiveMonth==='2026-10');
const A10c=device(base,()=>{DS._data.budgets['2026-09']=1000;});
const B10c=device(base,()=>{DS._data.budgets['2026-09']=1500;});
const m10c=merge(base,A10c,B10c);
ok('同一个月预算两边改成不同值：取本机，并记一条冲突', m10c.data.budgets['2026-09']===1000&&m10c.conflicts.some(c=>/budgets/.test(c.path)), JSON.stringify(m10c.conflicts));
const A10d=device(base,()=>{DS._data.savingsTarget={type:'fixed',fixedAmount:100,percent:0};DS._data.percentBase='net';});
const B10d=device(base,()=>{DS._data.savingsTarget={type:'percent',fixedAmount:0,percent:20};DS._data.percentBase='gross';});
const m10d=merge(base,A10d,B10d);
ok('偏好类字段（储蓄目标、口径）冲突：取本机，且不制造冲突噪音', m10d.data.savingsTarget.type==='fixed'&&m10d.data.percentBase==='net'&&m10d.conflicts.length===0, JSON.stringify(m10d.conflicts));

L('【M11】合并结果再过 _normalize() 不变');
const before=canon(M);
ok('M11 _normalize(合并结果) 与合并结果一致', canon(DS._normalize(clone(M)))===before);

L('【M-更新的盖旧的】同一条记录的同一字段两边改成不同值：updatedAt 较新的赢，与谁是本机无关');
const A12=device(base,()=>{ setLedger(base); DS.getRecord('r2').note='A 改的'; DS.getRecord('r2').updatedAt='2026-09-20T10:00:00.000Z'; });
const B12=device(base,()=>{ setLedger(base); DS.getRecord('r2').note='B 改的'; DS.getRecord('r2').updatedAt='2026-09-25T10:00:00.000Z'; });
const n1=merge(base,A12,B12), n2=merge(base,B12,A12);
ok('B 的编辑更新 → 两个方向都得到「B 改的」', n1.data.records.find(r=>r.id==='r2').note==='B 改的'&&n2.data.records.find(r=>r.id==='r2').note==='B 改的');
ok('updatedAt 取较大者', n1.data.records.find(r=>r.id==='r2').updatedAt==='2026-09-25T10:00:00.000Z');
ok('两个方向的完整结果一致', canon(n1.data)===canon(n2.data));
ok('并记一条「同一处改成不同值」冲突，带上可读标签', n1.conflicts.some(c=>c.kind==='edit-vs-edit'&&/note$/.test(c.path)&&c.label), JSON.stringify(n1.conflicts));

L('【M-字符串数组】两边都改了 tags：按集合合并，且顺序不同不算改动');
const A13=device(base,()=>{setLedger(base);DS.getRecord('r2').tags=['x','y'];});
const B13=device(base,()=>{setLedger(base);DS.getRecord('r2').tags=['z','x'];});
const m13=merge(base,A13,B13).data;
ok('tags = x,y,z', canon(m13.records.find(r=>r.id==='r2').tags)===canon(['x','y','z']));
const A13b=clone(A13);A13b.records.find(r=>r.id==='r2').tags=['y','x'];
ok('仅顺序不同的 tags 视为相同（不产生推送）', canon(A13)===canon(A13b));

L('【M-首次合并】base 为空：只取并集，绝不删除');
const local1=clone(base);local1.records=[{id:'L1',amount:1,categoryId:cat,date:'2026-09-10T10:00',note:'本机独有',tags:[],createdAt:T0},
  {id:'S',amount:5,categoryId:cat,date:'2026-09-11T10:00',note:'本机旧版',tags:[],createdAt:T0,updatedAt:'2026-09-01T00:00:00.000Z'}];
const remote1=clone(base);remote1.records=[{id:'R1',amount:2,categoryId:cat,date:'2026-09-12T10:00',note:'云端独有',tags:[],createdAt:T0},
  {id:'S',amount:6,categoryId:cat,date:'2026-09-11T10:00',note:'云端新版',tags:[],createdAt:T0,updatedAt:'2026-09-05T00:00:00.000Z'}];
const f1=merge(null,local1,remote1);
const ids=f1.data.records.map(r=>r.id).sort().join(',');
ok('本机独有、云端独有的记录都在，共同的只有一条', ids==='L1,R1,S', ids);
ok('同一条记录取 updatedAt 较新的那份', f1.data.records.find(r=>r.id==='S').note==='云端新版');
ok('本机的分类、联系人、分摊账单、计划都还在（没有被删）', f1.data.splitBills.length===1&&f1.data.purchasePlans.length===1&&f1.data.contacts.length===1);

L('【M-健壮性】没有 id 的条目不丢；不带 planMonth 的记录不被错误去重；输入不被改动');
const oddA=clone(base);oddA.records.push({amount:3,categoryId:cat,note:'无 id A',date:'2026-09-01T10:00'});
const oddB=clone(base);oddB.records.push({amount:4,categoryId:cat,note:'无 id B',date:'2026-09-01T10:00'});
const mOdd=merge(base,oddA,oddB).data;
ok('没有 id 的记录：两边各一条都保留', mOdd.records.filter(r=>!r.id).length===2);
const pA=clone(base);pA.records.push({id:'p1',amount:1,categoryId:cat,planId:'pl1',date:'2026-09-01T10:00',note:'x',tags:[],createdAt:T0});
const pB=clone(base);pB.records.push({id:'p2',amount:1,categoryId:cat,planId:'pl1',date:'2026-09-01T10:00',note:'y',tags:[],createdAt:T0});
const mp=merge(base,pA,pB).data;
ok('有 planId 但没有 planMonth 的两条不会被当成同一期而去重', mp.records.filter(r=>r.planId==='pl1'&&!r.planMonth).length===2);
const snap=[canon(base),canon(A),canon(B)];
merge(base,A,B);
ok('合并不修改传入的三份账本', snap[0]===canon(base)&&snap[1]===canon(A)&&snap[2]===canon(B));

L('【M-接口】_mergeData(incoming) 不带 base 时行为不变；带 {base} 才是三方合并');
setLedger(base);
const incoming=clone(base);incoming.records.push({id:'imp1',amount:9,categoryId:cat,date:'2026-09-15T10:00',note:'导入',tags:[],createdAt:T0});
DS._mergeData(incoming);
ok('两方模式：并集，返回当前账本本身', DS._data.records.some(r=>r.id==='imp1'));
setLedger(base);DS.deleteRecord('r1');
const back=clone(base); // 云端仍有 r1
const rr=DS._mergeData(back,{base:clone(base)});
ok('三方模式：本机删掉的 r1 没有被云端旧副本复活', !DS._data.records.some(r=>r.id==='r1'));
ok('三方模式返回 { data, conflicts }', rr&&Array.isArray(rr.conflicts)&&rr.data&&Array.isArray(rr.data.records));
setLedger(base);
const dry=DS._mergeData(clone(A),{base:clone(base),dryRun:true});
ok('dryRun 不动本机账本', canon(DS._data)===canon(base)&&dry.data.records.length>0);

L('【M-性能】8000 条记录的账本合并');
const big=clone(base);
for(let i=0;i<8000;i++)big.records.push({id:'big'+i,amount:i%50,categoryId:cat,date:'2026-0'+(1+i%9)+'-'+String(1+i%28).padStart(2,'0')+'T10:00',note:'记录'+i,tags:i%3?['a']:['b','c'],createdAt:T0});
const bigA=clone(big);bigA.records.splice(10,5);bigA.records.push({id:'bigA',amount:1,categoryId:cat,date:'2026-09-01T10:00',note:'A',tags:[],createdAt:T0});
const bigB=clone(big);bigB.records[100].amount=999;bigB.records[100].updatedAt='2026-09-02T00:00:00.000Z';
const t0=Date.now();const mb=merge(big,bigA,bigB);const ms=Date.now()-t0;
ok('耗时 < 3 秒（实际 '+ms+'ms）', ms<3000);
ok('结果正确：A 的删除与新增、B 的修改都在', mb.data.records.length===big.records.length-5+1&&mb.data.records.find(r=>r.id===bigB.records[100].id).amount===999);

console.log('\n结果: '+pass+' 通过 / '+fail+' 失败');
process.exit(fail?1:0);
},1500);
