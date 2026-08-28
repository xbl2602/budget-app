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

console.log('\n验收: '+pass+' 通过 / '+fail+' 失败');
process.exit(fail?1:0);},1500);
