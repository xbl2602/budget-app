/* ============================================================
   数据导出 / 导入 / 同步 —— 修复验收测试
   ------------------------------------------------------------
   对应 docs/data-export-fix-plan.md §5「验收标准」。
   每修完一个批次就往这里追加对应断言，最终它是这批修复的回归网。

   跑法： bash build.sh && node tests/data-integrity-fixes-test.js
   ============================================================ */
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function stub(){const n=()=>{};return{canvas:null,setTransform:n,scale:n,translate:n,rotate:n,clearRect:n,fillRect:n,strokeRect:n,beginPath:n,closePath:n,moveTo:n,lineTo:n,arc:n,arcTo:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,stroke:n,clip:n,fillText:n,strokeText:n,measureText:()=>({width:10}),save:n,restore:n,createLinearGradient:()=>({addColorStop:n}),createRadialGradient:()=>({addColorStop:n}),createPattern:()=>({}),drawImage:n,getImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData:n,roundRect:n,resetTransform:n,lineWidth:1,fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,font:'10px sans-serif',textAlign:'left',textBaseline:'alphabetic',lineCap:'butt',lineJoin:'miter',shadowBlur:0,shadowColor:'transparent'};}
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){const s=stub();w.HTMLCanvasElement.prototype.getContext=function(){this._stub=s;s.canvas=this;return s;};w.CanvasRenderingContext2D=function(){};w.CanvasRenderingContext2D.prototype.roundRect=function(){return this;};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,AAA';w.URL.createObjectURL=()=>'blob:stub';w.URL.revokeObjectURL=()=>{};const q=()=>{};w.console={log:q,warn:q,error:q,info:q,debug:q};
  // 最小 RTCPeerConnection 桩：让 createClient 跑通，再由测试手工递交数据通道，
  // 驱动的是真实的 receiveAndMerge / validateSyncData，不是复制品。
  w.__rtcChannels=[];
  w.RTCPeerConnection=function(){const self=this;this.iceConnectionState='connected';this.iceGatheringState='complete';
    this.localDescription={sdp:'stub'};this.ondatachannel=null;this.onicecandidate=null;
    this.setRemoteDescription=()=>Promise.resolve();this.createAnswer=()=>Promise.resolve({type:'answer',sdp:'stub'});
    this.setLocalDescription=()=>Promise.resolve();this.createDataChannel=()=>({readyState:'open',send(){},close(){}});this.close=()=>{};
    w.__rtcChannels.push({fire(payload){if(typeof self.ondatachannel!=='function')return 'no-handler';
      const ch={readyState:'open',send(){},close(){},onopen:null,onmessage:null,onerror:null};
      self.ondatachannel({channel:ch});if(ch.onopen)ch.onopen();
      if(typeof ch.onmessage!=='function')return 'no-onmessage';ch.onmessage({data:payload});return 'delivered';}});};}});
const {window:w}=dom;
setTimeout(async()=>{
const DS=w.DataStore,S=w.StatsEngine;const L=(...a)=>console.log(...a);
const cat=DS.getCategories()[0].id;
let pass=0,fail=0;
const ok=(n,c,extra)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(extra?' — '+extra:''));} };

L('【P0-03】payer 缺失不再影响分摊统计');
function bill(withPayer){const b={id:'sb1',amount:300,date:'2026-08-01',categoryId:cat,selfShare:100,mode:'equal',note:'x',archived:false,
  participants:[{contactId:'c1',name:'Alice',share:200,paid:false,paidAmount:50,unknown:false}]};if(withPayer)b.payer='self';return b;}
function fx(withPayer){return{records:[{id:'r1',amount:300,categoryId:cat,date:'2026-08-01',note:'x',tags:[],splitBillId:'sb1',createdAt:'2026-08-01T10:00:00'}],
 categories:DS.getCategories(),contacts:[{id:'c1',name:'Alice'}],splitBills:[bill(withPayer)]};}
const res=[];
for(const p of [true,false]){DS.clearAll();DS.importJSON(JSON.stringify(fx(p)),'replace');
 res.push([S.getSplitContrib('2026-08'),S.getSplitUnpaid('2026-08'),S.getSplitOthers('2026-08'),S.getMonthTotal('2026-08')]);}
ok('带/不带 payer 的统计完全一致', JSON.stringify(res[0])===JSON.stringify(res[1]), JSON.stringify(res));
ok('待收为 150（非 0）', res[1][1]===150, '实际 '+res[1][1]);
DS.clearAll();DS.importJSON(JSON.stringify(fx(false)),'replace');
w.localStorage.setItem('budgetAppData',JSON.stringify(fx(false)));DS.reload();
ok('reload() 后 payer 同样被补齐', DS._data.splitBills[0].payer==='self' && S.getSplitUnpaid('2026-08')===150);

L('【P0-05】reload 补齐缺键并跑迁移');
w.localStorage.setItem('budgetAppData',JSON.stringify({
 records:[{id:'m1',amount:80,categoryId:'__split__',splitBillId:'sb9',date:'2026-08-04',note:'x',tags:[],createdAt:'2026-08-04T00:00:00'}],
 categories:DS.getCategories(),
 splitBills:[{id:'sb9',amount:80,date:'2026-08-04',categoryId:cat,selfShare:40,participants:[]}]}));
DS.reload();
const need=['records','categories','budgets','categoryBudgets','savingsTarget','colorIndex','billCategories','billAmounts','monthlyIncome','percentBase','lastActiveMonth','whatIfParams','contacts','splitBills','purchasePlans'];
const miss=need.filter(k=>!(k in DS._data));
ok('15 个键全部齐全', miss.length===0, '缺 '+miss.join(','));
ok('__split__ 记录已迁移', DS._data.records[0].categoryId!=='__split__', DS._data.records[0].categoryId);
let threw=null; try{ w.HTMLAnchorElement.prototype.click=function(){}; w.exportToExcel(); }catch(e){threw=e.message;}
ok('reload 后 exportToExcel 不抛错', threw===null, threw);

L('【P0-07】merge 不再静默丢弃 monthlyIncome / categoryBudgets / billAmounts');
DS.clearAll();DS.importJSON(JSON.stringify({records:[],categories:DS.getCategories()}),'replace');
DS.importJSON(JSON.stringify({records:[],categories:[],monthlyIncome:{'2026-08':5000},categoryBudgets:{[cat+':2026-08']:{value:500,type:'fixed'}},billAmounts:{'b1:2026-08':300}}),'merge');
ok('monthlyIncome 被保留', DS._data.monthlyIncome && DS._data.monthlyIncome['2026-08']===5000, JSON.stringify(DS._data.monthlyIncome));
ok('categoryBudgets 被保留', DS._data.categoryBudgets && DS._data.categoryBudgets[cat+':2026-08'], JSON.stringify(DS._data.categoryBudgets));
ok('billAmounts 被保留', DS._data.billAmounts && DS._data.billAmounts['b1:2026-08']===300, JSON.stringify(DS._data.billAmounts));

L('【回归】_normalize 不篡改已有合法值');
const keep={records:[{id:'k',amount:12,categoryId:cat,date:'2026-08-09T08:30',note:'保留我',tags:['t'],createdAt:'2026-08-09T08:30:00.000Z'}],
 categories:DS.getCategories(),budgets:{'2026-08':4000},monthlyIncome:{'2026-08':6000},percentBase:'net',colorIndex:77,
 savingsTarget:{type:'percent',fixedAmount:0,percent:20},lastActiveMonth:'2026-08',whatIfParams:{s:1},
 contacts:[{id:'c',name:'N'}],splitBills:[],purchasePlans:[],billCategories:[],billAmounts:{},categoryBudgets:{}};
DS.clearAll();DS.importJSON(JSON.stringify(keep),'replace');
ok('percentBase 未被改写', DS._data.percentBase==='net');
ok('colorIndex 未被改写', DS._data.colorIndex===77, String(DS._data.colorIndex));
ok('savingsTarget 未被改写', DS._data.savingsTarget.type==='percent'&&DS._data.savingsTarget.percent===20);
ok('whatIfParams 未被改写', DS._data.whatIfParams && DS._data.whatIfParams.s===1);
ok('记录的 date/createdAt 原样保留', DS._data.records[0].date==='2026-08-09T08:30'&&DS._data.records[0].createdAt==='2026-08-09T08:30:00.000Z');

// ---------- 局域网同步：把 payload 推过真实接收路径 ----------
async function lan(payload, mode){
  let i=w.document.getElementById('syncOfferInput');
  if(!i){i=w.document.createElement('input');i.id='syncOfferInput';w.document.body.appendChild(i);}
  i.value='stub-offer';
  w.SyncUI.connectAsClient();
  await new Promise(r=>setTimeout(r,120));
  w.__rtcChannels[w.__rtcChannels.length-1].fire(payload);
  await new Promise(r=>setTimeout(r,20));
  w.confirmSyncMode(mode);
  await new Promise(r=>setTimeout(r,20));
}

L('【P0-01】局域网同步不再丢弃真实记录');
const cats=JSON.parse(JSON.stringify(DS.getCategories()));
function rec(extra){return Object.assign({id:'v1',amount:42,categoryId:cat,note:'x',tags:[]},extra);}
const formats=[
  ['App 实际格式 (datetime-local + ISO)',{date:'2026-08-01T19:30',createdAt:'2026-08-28T13:33:57.536Z'}],
  ['date 纯日期 + createdAt ISO',        {date:'2026-08-01',createdAt:'2026-08-28T13:33:57.536Z'}],
  ['date datetime-local + createdAt 纯日期',{date:'2026-08-01T19:30',createdAt:'2026-08-01'}],
  ['两者都是纯日期',                     {date:'2026-08-01',createdAt:'2026-08-01'}],
  ['无 createdAt',                       {date:'2026-08-01'}],
];
for(const [label,extra] of formats){
  DS.clearAll();
  await lan(JSON.stringify({records:[rec(extra)],categories:cats,budgets:{},categoryBudgets:{}}),'replace');
  ok('接受 '+label, DS._data.records.length===1, '收到 '+DS._data.records.length+' 条');
}

L('【P0-01】非法日期仍被拒绝（没有放太松）');
for(const bad of ['2026-13-45','not-a-date','20260801','2026-08-01T99:99']){
  DS.clearAll();
  await lan(JSON.stringify({records:[rec({date:bad,createdAt:'2026-08-01'})],categories:cats,budgets:{},categoryBudgets:{}}),'replace');
  ok('拒绝非法日期 '+JSON.stringify(bad), DS._data.records.length===0, '却收下了');
}

L('【P0-01】全部记录被拒时中止同步，不清空本地');
const localFx={records:[{id:'keep',amount:99,categoryId:cat,date:'2026-08-02T10:00',note:'本机的',tags:[],createdAt:'2026-08-02T10:00:00.000Z'}],
  categories:cats,budgets:{},categoryBudgets:{}};
DS.clearAll();DS.importJSON(JSON.stringify(localFx),'replace');
await lan(JSON.stringify({records:[rec({date:'garbage',createdAt:'garbage'})],categories:cats,budgets:{},categoryBudgets:{}}),'replace');
ok('本机记录未被清空', DS._data.records.length===1 && DS._data.records[0].id==='keep',
   '剩 '+DS._data.records.length+' 条');

L('【P0-01】部分记录被拒时仍导入，但会告警');
let warned=null; const origToast=w.showToast;
w.showToast=function(m,t){warned=String(m);};
DS.clearAll();
await lan(JSON.stringify({records:[
  rec({id:'good',date:'2026-08-01T19:30',createdAt:'2026-08-28T13:33:57.536Z'}),
  rec({id:'bad',date:'garbage',createdAt:'garbage'})],categories:cats,budgets:{},categoryBudgets:{}}),'replace');
ok('合法的那条被导入', DS._data.records.length===1 && DS._data.records[0].id==='good');
ok('跳过时有告警提示', !!warned && /1/.test(warned), warned===null?'完全没有提示':warned);
w.showToast=origToast;


L('【P0-02】importJSON merge 按 id 去重');
const dupFx={records:[{id:'d1',amount:100,categoryId:cat,date:'2026-08-01',note:'a',tags:[],createdAt:'2026-08-01T00:00:00.000Z'}],
  categories:DS.getCategories()};
DS.clearAll();DS.importJSON(JSON.stringify(dupFx),'replace');
const n0=DS._data.records.length;
DS.importJSON(JSON.stringify(dupFx),'merge');DS.importJSON(JSON.stringify(dupFx),'merge');
ok('同一份 merge 三次记录数不变', DS._data.records.length===n0, n0+' → '+DS._data.records.length);
ok('月度合计不翻倍', S.getMonthTotal('2026-08')===100, '实际 '+S.getMonthTotal('2026-08'));
// updatedAt 更新的同 id 记录应覆盖而非新增
const newer=JSON.parse(JSON.stringify(dupFx));
newer.records[0].amount=250; newer.records[0].note='改过了';
newer.records[0].updatedAt='2026-08-09T00:00:00.000Z';
DS.importJSON(JSON.stringify(newer),'merge');
ok('updatedAt 较新的同 id 记录覆盖本地', DS._data.records.length===n0 && DS._data.records[0].amount===250,
   '条数 '+DS._data.records.length+' 金额 '+DS._data.records[0].amount);
// 更旧的不该覆盖
const older=JSON.parse(JSON.stringify(dupFx));
older.records[0].amount=1; older.records[0].updatedAt='2020-01-01T00:00:00.000Z';
DS.importJSON(JSON.stringify(older),'merge');
ok('updatedAt 较旧的不覆盖本地', DS._data.records[0].amount===250, '被改成 '+DS._data.records[0].amount);

L('【P1-14】allTags / tagColors / colorIndex 过得了合并与同步');
const tagFx={records:[],categories:DS.getCategories(),allTags:['旅行','聚餐'],tagColors:{'聚餐':'#ff8800'},colorIndex:88,lastActiveMonth:'2026-08'};
DS.clearAll();DS.importJSON(JSON.stringify(tagFx),'replace');
ok('replace 保住 tagColors', DS._data.tagColors && DS._data.tagColors['聚餐']==='#ff8800');
ok('replace 保住 colorIndex', DS._data.colorIndex===88, String(DS._data.colorIndex));
DS.clearAll();DS.importJSON(JSON.stringify(tagFx),'merge');
ok('merge 保住 allTags', (DS._data.allTags||[]).includes('聚餐')&&(DS._data.allTags||[]).includes('旅行'));
ok('merge 保住 tagColors', DS._data.tagColors && DS._data.tagColors['聚餐']==='#ff8800');
ok('merge 的 colorIndex 取较大值', DS._data.colorIndex===88, String(DS._data.colorIndex));
DS.clearAll();
await lan(JSON.stringify(Object.assign({},tagFx,{records:[rec({date:'2026-08-01T19:30',createdAt:'2026-08-01T19:30:00.000Z'})]})),'replace');
ok('局域网 replace 保住 allTags', (DS._data.allTags||[]).includes('聚餐'));
ok('局域网 replace 保住 tagColors', DS._data.tagColors && DS._data.tagColors['聚餐']==='#ff8800');
ok('局域网 replace 保住 colorIndex', DS._data.colorIndex===88, String(DS._data.colorIndex));
ok('局域网 replace 保住 lastActiveMonth', DS._data.lastActiveMonth==='2026-08', DS._data.lastActiveMonth);

L('【回归】merge 不会用默认值覆盖本地标量');
DS.clearAll();
DS.importJSON(JSON.stringify({records:[],categories:DS.getCategories(),percentBase:'net',savingsTarget:{type:'percent',fixedAmount:0,percent:20}}),'replace');
DS.importJSON(JSON.stringify({records:[],categories:[]}),'merge');
ok('percentBase 未被默认值覆盖', DS._data.percentBase==='net', DS._data.percentBase);
ok('savingsTarget 未被默认值覆盖', DS._data.savingsTarget.type==='percent', DS._data.savingsTarget.type);


L('【P1-13】指纹改为全量序列化后的性质');
const base={records:[{id:'h1',amount:50,categoryId:cat,date:'2026-08-01T10:00',note:'n',tags:['t'],createdAt:'2026-08-01T10:00:00.000Z'}],
  categories:DS.getCategories(),contacts:[{id:'c1',name:'A'}],
  splitBills:[{id:'b1',payer:'self',amount:50,date:'2026-08-01',categoryId:cat,selfShare:20,selfUnknown:false,tag:'x',mode:'equal',archived:false,
    participants:[{contactId:'c1',name:'A',share:30,paid:false,paidAmount:10,unknown:false}]}],
  purchasePlans:[],allTags:['t'],tagColors:{'t':'#111111'},monthlyIncome:{'2026-08':1000}};
DS.clearAll();DS.importJSON(JSON.stringify(base),'replace');
const H=DS.getDataHash();
ok('同一份数据两次取值稳定', DS.getDataHash()===H);
// 逐字段敏感度
const sensitive=[
  ['分类图标', d=>d.categories[0].icon='🔥'],
  ['分类颜色', d=>d.categories[0].color='#123456'],
  ['selfUnknown', d=>d.splitBills[0].selfUnknown=true],
  ['账单 tag', d=>d.splitBills[0].tag='改了'],
  ['payer 改值', d=>d.splitBills[0].payer='other'],
  ['tagColors', d=>d.tagColors={'t':'#999999'}],
  ['paidAmount', d=>d.splitBills[0].participants[0].paidAmount=25],
  ['createdAt', d=>d.records[0].createdAt='2020-01-01T00:00:00.000Z'],
];
sensitive.forEach(([label,mut])=>{
  const d=JSON.parse(JSON.stringify(base)); mut(d);
  DS.clearAll();DS.importJSON(JSON.stringify(d),'replace');
  ok('察觉 '+label, DS.getDataHash()!==H);
});
// 顺序无关性
const shuffled=JSON.parse(JSON.stringify(base));
shuffled.records.push({id:'h2',amount:70,categoryId:cat,date:'2026-08-03T10:00',note:'m',tags:[],createdAt:'2026-08-03T10:00:00.000Z'});
DS.clearAll();DS.importJSON(JSON.stringify(shuffled),'replace');
const Hs=DS.getDataHash();
const reversed=JSON.parse(JSON.stringify(shuffled)); reversed.records.reverse();
DS.clearAll();DS.importJSON(JSON.stringify(reversed),'replace');
ok('记录数组顺序不影响指纹', DS.getDataHash()===Hs);
// 键顺序无关
const reKeyed={}; Object.keys(shuffled).reverse().forEach(k=>reKeyed[k]=shuffled[k]);
DS.clearAll();DS.importJSON(JSON.stringify(reKeyed),'replace');
ok('对象键顺序不影响指纹', DS.getDataHash()===Hs);
// lastActiveMonth 是本机状态，不该计入
DS.clearAll();DS.importJSON(JSON.stringify(base),'replace');
const Hl=DS.getDataHash();
DS._data.lastActiveMonth='1999-01';DS.save();
ok('lastActiveMonth 不计入指纹（本机状态）', DS.getDataHash()===Hl);
// 同步后两端指纹应一致
DS.clearAll();DS.importJSON(JSON.stringify(base),'replace');
const senderPayload=DS.exportJSON(); const senderHash=DS.getDataHash();
DS.clearAll();
await lan(senderPayload,'replace');
ok('局域网同步后收发两端指纹一致', DS.getDataHash()===senderHash,
   '发 '+senderHash+' 收 '+DS.getDataHash());


L('【P0-04】修复数据不再删除记录');
const orphanFx={records:[{id:'k1',amount:250,categoryId:cat,date:'2026-08-03T10:00',note:'分期',tags:[],planId:'ghost',planMonth:'2026-08',createdAt:'2026-08-03T10:00:00.000Z'}],
  categories:DS.getCategories(),purchasePlans:[]};
DS.clearAll();DS.importJSON(JSON.stringify(orphanFx),'replace');
const beforeTotal=S.getMonthTotal('2026-08');
w.repairData();
ok('孤儿记录仍在', DS._data.records.length===1, '剩 '+DS._data.records.length+' 条');
ok('planId 已解除关联', DS._data.records[0] && !DS._data.records[0].planId);
ok('planMonth 已解除关联', DS._data.records[0] && !DS._data.records[0].planMonth);
ok('月度合计不变', S.getMonthTotal('2026-08')===beforeTotal, beforeTotal+' → '+S.getMonthTotal('2026-08'));
const planFx={records:[],categories:DS.getCategories(),
  purchasePlans:[{id:'pz',name:'旅行',icon:'✈️',totalAmount:600,mode:'save',startMonth:'2026-01',months:6,categoryId:cat,status:'active',overrides:{},note:''}]};
DS.clearAll();DS.importJSON(JSON.stringify(planFx),'replace');
w.repairData();
ok('非 credit 计划的 categoryId 未被清空', DS._data.purchasePlans[0].categoryId===cat,
   JSON.stringify(DS._data.purchasePlans[0].categoryId));

L('【P0-06】撤销窗口跨刷新 / 跨重载存活');
const delFx={records:[{id:'del1',amount:88,categoryId:cat,date:'2026-08-06T10:00',note:'要撤销的',tags:[],createdAt:'2026-08-06T10:00:00.000Z'}],
  categories:DS.getCategories()};
DS.clearAll();DS.importJSON(JSON.stringify(delFx),'replace');
DS.softDeleteRecord('del1');
ok('软删除后记录已移出', DS._data.records.length===0);
w.refreshPageData();
ok('点刷新后仍可撤销', !!DS.getPendingDelete());
ok('撤销成功恢复记录', DS.undoDelete()===true && DS._data.records.some(r=>r.id==='del1'),
   '剩 '+DS._data.records.length+' 条');
// 跨「重新加载页面」（init 重跑）
DS.clearAll();DS.importJSON(JSON.stringify(delFx),'replace');
DS.softDeleteRecord('del1');
DS._pendingDelete=null;          // 模拟页面重载：内存缓冲清空
DS.init();                       // 重新初始化，应从 localStorage 恢复缓冲
ok('重载后待删缓冲被恢复', !!DS.getPendingDelete(), '没有恢复');
ok('重载后仍能撤销', DS.undoDelete()===true && DS._data.records.some(r=>r.id==='del1'));


L('【P1-10】credit 计划的「已还」来自真实记录');
function creditFx(recs){return{records:recs,categories:DS.getCategories(),
  monthlyIncome:{'2026-01':3000,'2026-02':3000,'2026-03':3000},
  purchasePlans:[{id:'cp',name:'笔电',icon:'💻',totalAmount:900,mode:'credit',startMonth:'2026-01',months:3,categoryId:cat,status:'active',overrides:{},note:''}]};}
DS.clearAll();DS.importJSON(JSON.stringify(creditFx([])),'replace');
let cs=w.PlanMath.getState('cp','2026-03');
ok('0 条扣款记录时已还为 0', cs && cs.paid===0, cs?'已还 '+cs.paid:'无状态');
ok('0 条扣款记录时欠款为全额', cs && cs.remaining===900, cs?'剩 '+cs.remaining:'');
ok('0 条扣款记录时不算完成', cs && cs.isComplete===false);
const three=['2026-01','2026-02','2026-03'].map((m,i)=>({id:'cr'+i,amount:300,categoryId:cat,date:m+'-01T09:00',note:'分期',
  tags:[],excludeFromAvg:true,planId:'cp',planMonth:m,createdAt:m+'-01T09:00:00.000Z'}));
DS.clearAll();DS.importJSON(JSON.stringify(creditFx(three)),'replace');
cs=w.PlanMath.getState('cp','2026-03');
ok('3 条记录时已还等于三条之和', cs && Math.abs(cs.paid-900)<0.01, cs?'已还 '+cs.paid:'');
ok('3 条记录时欠款清零', cs && cs.remaining===0);
DS.clearAll();DS.importJSON(JSON.stringify(creditFx(three.slice(0,2))),'replace');
cs=w.PlanMath.getState('cp','2026-03');
ok('删掉一期后欠款如实回升', cs && Math.abs(cs.paid-600)<0.01 && Math.abs(cs.remaining-300)<0.01,
   cs?'已还 '+cs.paid+' 剩 '+cs.remaining:'');
ok('credit 仍不计入虚拟月供（避免双重扣减）',
   w.StatsEngine.getSpendablePlan('2026-02').planDueVirtual===0,
   String(w.StatsEngine.getSpendablePlan('2026-02').planDueVirtual));

L('【P1-09】推定月份自报可信度');
const borrowFx={records:[],categories:DS.getCategories(),monthlyIncome:{'2026-01':2000},
  purchasePlans:[{id:'bp',name:'手机',icon:'📱',totalAmount:600,mode:'borrow',startMonth:'2026-01',months:3,categoryId:'',status:'active',overrides:{},note:''}]};
DS.clearAll();DS.importJSON(JSON.stringify(borrowFx),'replace');
let bs=w.PlanMath.getState('bp','2026-03');
ok('暴露 estimatedMonths', bs && typeof bs.estimatedMonths==='number', JSON.stringify(bs&&bs.estimatedMonths));
ok('缺 2 个月收入 → estimatedMonths 为 2', bs && bs.estimatedMonths===2, bs?String(bs.estimatedMonths):'');
ok('hasEstimates 为真', bs && bs.hasEstimates===true);
const fullIncome=JSON.parse(JSON.stringify(borrowFx));
fullIncome.monthlyIncome={'2026-01':2000,'2026-02':2000,'2026-03':2000};
DS.clearAll();DS.importJSON(JSON.stringify(fullIncome),'replace');
bs=w.PlanMath.getState('bp','2026-03');
ok('收入齐全时 hasEstimates 为假', bs && bs.hasEstimates===false, bs?String(bs.estimatedMonths):'');
// Excel 里能看到实测/推定
DS.clearAll();DS.importJSON(JSON.stringify(borrowFx),'replace');
let capX=null; const oc=w.URL.createObjectURL;
w.URL.createObjectURL=b=>{capX=b;return 'x';}; w.HTMLAnchorElement.prototype.click=function(){};
w.exportToExcel(); const xmlX=await capX.text(); w.URL.createObjectURL=oc;
ok('Excel 逐月子行含「实测」', xmlX.indexOf('实测')!==-1);
ok('Excel 逐月子行含「推定」', xmlX.indexOf('推定')!==-1);
ok('Excel 状态列附注推定月数', /无收入记录/.test(xmlX));


L('【P0-08】手机版不再抹掉主应用的数据');
{
  const mhtml=fs.readFileSync(path.join(__dirname,'..','money-wise-mobile.html'),'utf8');
  const md=new JSDOM(mhtml,{runScripts:'dangerously',url:'http://localhost/',
    beforeParse(mw){const q=()=>{};mw.console={log:q,warn:q,error:q,info:q,debug:q};}});
  const mw=md.window;
  await new Promise(r=>setTimeout(r,600));
  const M=mw.DataStore;
  const seedCats=JSON.parse(JSON.stringify(M.getCategories()));
  const seed={records:[{id:'s1',amount:30,categoryId:seedCats[0].id,date:'2026-08-01',note:'手机记的',tags:[],createdAt:'2026-08-01T00:00:00.000Z'}],
    categories:seedCats,budgets:{'2026-08':4000},categoryBudgets:{},savingsTarget:{type:'percent',fixedAmount:0,percent:20},
    colorIndex:77,billCategories:[{id:'bc',name:'房租',icon:'🏠'}],billAmounts:{'bc:2026-08':1200},
    monthlyIncome:{'2026-08':6000},percentBase:'net',lastActiveMonth:'2026-08',whatIfParams:{s:1},
    contacts:[{id:'ct',name:'Alice'}],
    splitBills:[{id:'sb',payer:'self',amount:300,date:'2026-08-01',categoryId:seedCats[0].id,selfShare:100,mode:'equal',archived:false,
      participants:[{contactId:'ct',name:'Alice',share:200,paid:false,paidAmount:50,unknown:false}]}],
    purchasePlans:[{id:'pp',name:'MacBook',icon:'💻',totalAmount:6000,mode:'borrow',startMonth:'2026-06',months:12,categoryId:'',status:'active',overrides:{},note:''}],
    allTags:['聚餐'],tagColors:{'聚餐':'#ff8800'}};
  const allKeys=Object.keys(seed);
  mw.localStorage.setItem('budgetAppData',JSON.stringify(seed));
  M.init();
  M.importJSON(JSON.stringify({records:seed.records,categories:seedCats}),'replace');
  let after=JSON.parse(mw.localStorage.getItem('budgetAppData'));
  let lost=allKeys.filter(k=>!(k in after));
  ok('replace 导入后未知键全部保留', lost.length===0, '丢失 '+lost.join(','));
  ok('replace 后分摊账单仍在', (after.splitBills||[]).some(b=>b.id==='sb'));
  ok('replace 后大额计划仍在', (after.purchasePlans||[]).some(p=>p.id==='pp'));
  M.clearAll();
  after=JSON.parse(mw.localStorage.getItem('budgetAppData'));
  lost=allKeys.filter(k=>!(k in after));
  ok('clearAll 后未知键全部保留', lost.length===0, '丢失 '+lost.join(','));
  ok('clearAll 确实清空了记录', (after.records||[]).length===0);
  ok('手机版默认 savingsTarget.type 为 fixed', after.savingsTarget.type==='fixed', after.savingsTarget.type);
  // merge 去重
  M.importJSON(JSON.stringify({records:seed.records,categories:seedCats}),'replace');
  const before=M._data.records.length;
  M.importJSON(JSON.stringify({records:seed.records,categories:seedCats}),'merge');
  M.importJSON(JSON.stringify({records:seed.records,categories:seedCats}),'merge');
  ok('手机版 merge 也按 id 去重', M._data.records.length===before, before+' → '+M._data.records.length);
}


L('【P1-11】归档账单的欠款不再永久挂账');
function archFx(arch){return{records:[{id:'r1',amount:300,categoryId:cat,date:'2026-08-01',note:'x',tags:[],splitBillId:'sb1',createdAt:'2026-08-01T10:00:00.000Z'}],
  categories:DS.getCategories(),contacts:[{id:'c1',name:'A'}],
  splitBills:[{id:'sb1',payer:'self',amount:300,date:'2026-08-01',categoryId:cat,selfShare:100,mode:'equal',note:'x',archived:arch,
    participants:[{contactId:'c1',name:'A',share:200,paid:false,paidAmount:50,unknown:false}]}]};}
DS.clearAll();DS.importJSON(JSON.stringify(archFx(false)),'replace');
const un=[S.getSplitUnpaid('2026-08'),S.getSplitContrib('2026-08'),S.getMonthTotal('2026-08')];
DS.clearAll();DS.importJSON(JSON.stringify(archFx(true)),'replace');
const ar=[S.getSplitUnpaid('2026-08'),S.getSplitContrib('2026-08'),S.getMonthTotal('2026-08')];
ok('未归档时待收 150', un[0]===150, String(un[0]));
ok('归档后待收归零', ar[0]===0, String(ar[0]));
ok('归档不改变已收回金额', ar[1]===un[1], un[1]+' → '+ar[1]);
ok('归档不改变月度净支出', ar[2]===un[2], un[2]+' → '+ar[2]);

L('【P1-12 / P2-15】Excel 分摊 sheet');
DS.clearAll();DS.importJSON(JSON.stringify(archFx(false)),'replace');
let capE=null; const oe=w.URL.createObjectURL;
w.URL.createObjectURL=b=>{capE=b;return 'x';}; w.HTMLAnchorElement.prototype.click=function(){};
w.exportToExcel(); const xE=await capE.text(); w.URL.createObjectURL=oe;
{
  const st=xE.indexOf('<Worksheet ss:Name="分摊账单">');
  const sheet=xE.slice(st,xE.indexOf('</Worksheet>',st));
  const row=(sheet.split('<Row>').filter(r=>r.indexOf('↳')!==-1)||[])[0]||'';
  const cells=row.match(/<Cell[^>]*>[\s\S]*?<\/Cell>/g)||[];
  let col=0; const placed={};
  cells.forEach(c=>{const m=c.match(/ss:Index="(\d+)"/);col=m?parseInt(m[1],10):col+1;
    placed[col]=((c.match(/<Data[^>]*>([\s\S]*?)<\/Data>/)||[])[1])||'';});
  ok('参与人份额落在 D 列', /^[\d.]+$/.test(placed[4]||''), 'D='+JSON.stringify(placed[4]||''));
  ok('参与人已还落在 G 列', /^[\d.]+$/.test(placed[7]||''), 'G='+JSON.stringify(placed[7]||''));
  ok('参与人状态落在 H 列', /[已待未❓🟡✅⏳]/.test(placed[8]||''), 'H='+JSON.stringify(placed[8]||''));
}

L('【P2-16 / P2-17 / P2-18】');
ok('_deleted 死代码已清除', !/_deleted/.test(fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8')));
{
  const csv=DS.exportCSV(); const head=csv.split('\n')[0].replace(/^\uFEFF/,'');
  ok('CSV 含子分类列', head.indexOf('子分类')!==-1, head);
  ok('CSV 含所属计划列', head.indexOf('所属计划')!==-1, head);
  ok('CSV 自份额两位小数', /自份额 100\.00/.test(csv), (csv.split('\n')[1]||'').slice(-40));
  // 正规解析：字段可带引号，引号内的逗号不算分隔符
  const parseCsvLine = line => {
    const out=[]; let cur='', q=false;
    for (let i=0;i<line.length;i++){
      const ch=line[i];
      if (q){ if(ch==='"'){ if(line[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=ch; }
      else if (ch==='"') q=true;
      else if (ch===',') { out.push(cur); cur=''; }
      else cur+=ch;
    }
    out.push(cur); return out;
  };
  const cols=parseCsvLine(csv.split('\n')[1]||'').length;
  ok('CSV 数据列数与表头一致', cols===head.split(',').length, '表头 '+head.split(',').length+' 列，数据 '+cols+' 列');
}
{
  const keep=DS._data;
  DS.lockData();
  ok('锁定后 exportJSON 不返回 "null" 字符串', DS.exportJSON()===null, JSON.stringify(DS.exportJSON()));
  DS._data=keep;
}

console.log('\n验收: '+pass+' 通过 / '+fail+' 失败');
process.exit(fail?1:0);},1500);
