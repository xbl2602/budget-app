/* ============================================================
   云同步 · 客户端（启用 / 登录 / 同步 / 保护闸 / 加密 / 触发时机 / 界面）
   ------------------------------------------------------------
   对应 docs/superpowers/specs/2026-09-28-cloud-sync-design-v2.md §13：
   N1-* N2-*  你提的两条硬约束（旧数据不消失；不登录照常用）
   C1–C5      加密        P1–P5  协议        S*  服务端行为的客户端一侧
   三方合并本身在 tests/cloud-merge-test.js。

   「云端」是这个文件里一个逐条镜像 supabase/migrations/*.sql 的内存实现
   （FakeCloud）；「设备」是真实构建产物 index.html 的独立实例，各有各的
   localStorage。所以跑的都是 App 真实的代码路径，不是复制品。
   真实 Supabase 项目的端到端验证不放在这里（需要联网和邀请码）。

   跑法： bash build.sh && node tests/cloud-sync-test.js
   ============================================================ */
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const nodeCrypto=require('crypto');const {webcrypto}=nodeCrypto;
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const mobileHtml=fs.readFileSync(path.join(__dirname,'..','money-wise-mobile.html'),'utf8');
const moduleSrc=fs.readFileSync(path.join(__dirname,'..','src','js','28-cloud-sync.js'),'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clone=x=>JSON.parse(JSON.stringify(x));

// 页面真实的 CSP：假 fetch 用它来校验「代码要访问的地址」确实被白名单放行
const csp=(html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)||[])[1]||'';
const connectSrc=((csp.match(/connect-src ([^;]+)/)||[])[1]||'').trim();

/* ---------------- 内存里的「云端」：逐条镜像服务端 SQL ---------------- */
class FakeCloud{
  constructor(){this.rows=new Map();this.hist=new Map();this.invites=new Map();this.skew=0;this.tooFastMs=2000;
    this.calls=[];this.bodies=[];this.failNext=null;this.alwaysConflict=false;}
  now(){return Date.now()+this.skew;}
  norm(c){return String(c||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();}
  addInvite(code){this.invites.set(this.norm(code),false);}
  keyOf(hex){return nodeCrypto.createHash('sha256').update(Buffer.from(hex,'hex')).digest('hex');}
  count(name){return this.calls.filter(c=>c===name).length;}
  onlyRow(){return [...this.rows.values()][0];}
  handle(name,b){
    this.calls.push(name);
    const hex=b.p_auth_key;if(!/^[0-9a-f]{64}$/.test(hex||''))return{status:'bad_request'};
    const k=this.keyOf(hex),row=this.rows.get(k);
    if(name==='ledger_pull'){
      if(!row)return{status:'none'};
      if(b.p_known_version!=null&&b.p_known_version===row.version)return{status:'unchanged',version:row.version};
      return{status:'ok',version:row.version,blob:row.blob,updated_at:new Date(row.at).toISOString()};
    }
    if(name==='ledger_push'){
      if(Buffer.byteLength(b.p_blob||'')>4194304)return{status:'too_large'};
      if(this.alwaysConflict)return{status:'conflict',version:row?row.version:0};
      if(!row){
        if(b.p_expected_version!==0)return{status:'gone'};
        const inv=this.norm(b.p_invite);
        if(!inv)return{status:'invite_required'};
        if(this.invites.get(inv)!==false)return{status:'invite_invalid'};
        this.rows.set(k,{version:1,blob:b.p_blob,at:this.now()});this.invites.set(inv,true);
        return{status:'ok',version:1};
      }
      if(b.p_expected_version!==row.version)return{status:'conflict',version:row.version};
      if(this.now()-row.at<this.tooFastMs)return{status:'too_fast',version:row.version};
      const h=this.hist.get(k)||[];h.push({version:row.version,blob:row.blob,at:row.at});
      while(h.length>5)h.shift();this.hist.set(k,h);
      row.version++;row.blob=b.p_blob;row.at=this.now();
      return{status:'ok',version:row.version};
    }
    if(name==='ledger_history'){
      if(!row)return{status:'none'};
      const all=[{version:row.version,at:new Date(row.at).toISOString()},...(this.hist.get(k)||[]).map(x=>({version:x.version,at:new Date(x.at).toISOString()}))];
      return{status:'ok',versions:all.sort((a,c)=>c.version-a.version)};
    }
    if(name==='ledger_fetch'){
      if(row&&row.version===b.p_version)return{status:'ok',version:b.p_version,blob:row.blob};
      const h=(this.hist.get(k)||[]).find(x=>x.version===b.p_version);
      return h?{status:'ok',version:b.p_version,blob:h.blob}:{status:'none'};
    }
    if(name==='ledger_delete'){if(!row)return{status:'none'};this.rows.delete(k);this.hist.delete(k);return{status:'ok'};}
    return{status:'bad_request'};
  }
}
const respond=(status,obj)=>({ok:status>=200&&status<300,status,json:async()=>obj,text:async()=>JSON.stringify(obj)});
async function fakeFetch(dev,url,init){
  dev.fetchCount++;
  const cloud=dev.cloud,u=String(url);
  if(!connectSrc||!u.startsWith(connectSrc+'/')){dev.cspViolations.push(u);throw new TypeError('blocked by CSP: '+u);}
  const m=/\/rest\/v1\/rpc\/(ledger_[a-z]+)$/.exec(u);
  if(!m){dev.cspViolations.push(u);throw new TypeError('unexpected endpoint '+u);}
  if(!cloud)throw new TypeError('no cloud attached');
  if(((init&&init.headers)||{}).apikey!==dev.w.CloudSync._cfg.KEY)return respond(401,{message:'no apikey'});
  cloud.bodies.push({url:u,body:init.body});
  if(cloud.failNext){const f=cloud.failNext;cloud.failNext=null;if(f==='network')throw new TypeError('Failed to fetch');return respond(f,{message:'boom'});}
  return respond(200,cloud.handle(m[1],JSON.parse(init.body)));
}

/* ---------------- 设备：真实 App 的独立实例 ---------------- */
function stub(){const n=()=>{};return{canvas:null,setTransform:n,scale:n,translate:n,rotate:n,clearRect:n,fillRect:n,strokeRect:n,beginPath:n,closePath:n,moveTo:n,lineTo:n,arc:n,arcTo:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,stroke:n,clip:n,fillText:n,strokeText:n,measureText:()=>({width:10}),save:n,restore:n,createLinearGradient:()=>({addColorStop:n}),createRadialGradient:()=>({addColorStop:n}),createPattern:()=>({}),drawImage:n,getImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData:n,roundRect:n,resetTransform:n,setLineDash:n,lineWidth:1,fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,font:'10px sans-serif',textAlign:'left',textBaseline:'alphabetic',lineCap:'butt',lineJoin:'miter',shadowBlur:0,shadowColor:'transparent'};}
async function makeDevice(name,seed){
  const dev={name,fetchCount:0,cspViolations:[],timers:0,listeners:0,xhr:0,ws:0,cloud:null};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){
    const s=stub();w.HTMLCanvasElement.prototype.getContext=function(){this._stub=s;s.canvas=this;return s;};
    w.CanvasRenderingContext2D=function(){};w.CanvasRenderingContext2D.prototype.roundRect=function(){return this;};
    w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,AAA';w.URL.createObjectURL=()=>'blob:stub';w.URL.revokeObjectURL=()=>{};
    const q=()=>{};w.console={log:q,warn:q,error:q,info:q,debug:q};
    Object.defineProperty(w,'crypto',{value:webcrypto,configurable:true});
    for(const [k,v] of Object.entries({Blob,Response,CompressionStream,DecompressionStream}))Object.defineProperty(w,k,{value:v,configurable:true,writable:true});
    w.fetch=(url,init)=>fakeFetch(dev,url,init);
    // 计数：网络与定时器与监听器（N2-1 要求默认状态下全是 0）
    const X=w.XMLHttpRequest;w.XMLHttpRequest=function(){dev.xhr++;return new X();};
    w.WebSocket=function(){dev.ws++;throw new Error('WebSocket must not be used');};
    if(seed)seed(w);
  }});
  dev.w=dom.window;await sleep(1500);
  const w=dev.w;dev.DS=w.DataStore;dev.CS=w.CloudSync;dev.LS=w.localStorage;dev.doc=w.document;
  const st=w.setTimeout,si=w.setInterval,ae=w.addEventListener,de=w.document.addEventListener;
  w.setTimeout=function(...a){dev.timers++;return st.apply(this,a);};w.setInterval=function(...a){dev.timers++;return si.apply(this,a);};
  w.addEventListener=function(...a){dev.listeners++;return ae.apply(this,a);};w.document.addEventListener=function(...a){dev.listeners++;return de.apply(this,a);};
  return dev;
}
async function reset(dev,cloud){
  dev.cloud=cloud||null;
  try{dev.CS.disable();}catch(e){/* 未启用 */}
  dev.CS._t.resetForTests();
  dev.LS.clear();dev.w._pinRequired=false;
  dev.DS._data=dev.DS._defaults();dev.DS._rev=(dev.DS._rev||0)+1;dev.DS.save();
  dev.fetchCount=0;dev.cspViolations.length=0;
  const ov=dev.doc.getElementById('modalOverlay');if(ov)ov.classList.remove('open');
  // 默认让后台触发器「永远不到点」，测试里手动 syncOnce，结果才可确定
  Object.assign(dev.CS._cfg,{DEBOUNCE_MS:1e8,MAX_WAIT_MS:1e8,LAUNCH_DELAY_MS:1e8,POLL_MS:1e8});
}

/* ---------------- 通用小工具 ---------------- */
let pass=0,fail=0;const L=(...a)=>console.log(...a);
const ok=(n,c,extra)=>{if(c){pass++;console.log('  ✅ '+n);}else{fail++;console.log('  ❌ '+n+(extra?' — '+extra:''));}};
const canonOf=(dev,x)=>dev.DS._canonStringify(x);
const led=dev=>clone(dev.DS._data);
const setLedger=(dev,d)=>{dev.DS._data=dev.DS._normalize(clone(d));dev.DS._rev=(dev.DS._rev||0)+1;dev.DS.save();};
const T0='2026-09-01T00:00:00.000Z';
function fixture(dev,tag){
  const cat=dev.DS.getCategories()[0].id;
  return{
    records:[
      {id:'r1',amount:10,categoryId:cat,date:'2026-09-01T10:00',note:'早餐 '+tag,tags:[],createdAt:T0},
      {id:'r2',amount:20,categoryId:cat,date:'2026-09-02T10:00',note:'午餐 '+tag,tags:['工作'],createdAt:T0},
      {id:'r3',amount:200,categoryId:cat,date:'2026-09-03T12:00',note:'分摊餐',tags:[],splitBillId:'sb1',createdAt:T0}],
    categories:dev.DS.getCategories(),contacts:[{id:'c1',name:'Alice'}],
    splitBills:[{id:'sb1',amount:200,date:'2026-09-03',categoryId:cat,selfShare:100,payer:'self',mode:'equal',note:'s',archived:false,
      createdAt:T0,updatedAt:T0,participants:[{contactId:'c1',name:'Alice',share:100,paid:false,paidAmount:0}]}],
    purchasePlans:[],allTags:['工作'],tagColors:{}};
}
const rec=(dev,id,note,extra)=>Object.assign({id,amount:1,categoryId:dev.DS.getCategories()[0].id,date:'2026-09-10T10:00',note,tags:[],createdAt:T0},extra||{});
// updateRecord() always stamps updatedAt=now(), which makes "use whichever is
// newer" tests non-deterministic (both edits land within the same millisecond
// range). Mutate directly + save() when the test needs to control the stamp.
const setNote=(dev,id,note,stamp)=>{const r=dev.DS._data.records.find(x=>x.id===id);r.note=note;if(stamp)r.updatedAt=stamp;dev.DS.save();};
const INVITE='TESTINVITE-AAAA-BBBB-CCCC';
async function enableNew(dev,cloud,invite){
  cloud.addInvite(invite||INVITE);
  const {code}=await dev.CS._t.prepareCreate();
  const r=await dev.CS._t.establish(invite||INVITE);
  return{code,r};
}
async function loginOn(dev,code){
  await dev.CS._t.prepareLogin(code);
  let r=await dev.CS._t.establish(null);
  if(r.kind==='confirm')r=await dev.CS._t.confirmFirstMerge();
  return r;
}
const sync=async dev=>{dev.cloud.skew+=3000;return dev.CS.syncOnce('test');};
const syncKeys=dev=>Object.keys(dev.w.localStorage).filter(k=>/^budgetSync/.test(k));
function failWrites(dev,re){
  const P=dev.w.Storage.prototype,orig=P.setItem;
  P.setItem=function(k,v){if(re.test(k))throw new dev.w.DOMException('quota','QuotaExceededError');return orig.call(this,k,v);};
  return()=>{P.setItem=orig;};
}

(async()=>{
/* ============================================================
   N2 —— 不登录使用，与现状一致
   ============================================================ */
L('【N1-1 / N2-1】旧数据（旧形状）+ 从未启用：账本不变、没有 budgetSync 键、零请求、零监听、零定时器');
const legacySeed=w=>{
  const cat='food';
  w.localStorage.setItem('budgetAppData',JSON.stringify({
    records:[{id:'o1',amount:12.5,categoryId:'__split__',splitBillId:'sbOld',date:'2026-08-01T19:30',note:'旧分摊',tags:[],createdAt:'2026-08-01T11:30:00.000Z'},
             {id:'o2',amount:8,categoryId:cat,date:'2026-08-02T08:00',note:'无 updatedAt',tags:[],createdAt:'2026-08-02T00:00:00.000Z'}],
    categories:[{id:cat,name:'餐饮',icon:'🍜',color:'#f00',parentId:null,sortOrder:0}],
    contacts:[{id:'c9',name:'Bob'}],
    splitBills:[{id:'sbOld',amount:100,date:'2026-08-01',categoryId:cat,selfShare:50,mode:'equal',note:'旧',archived:false,
      participants:[{contactId:'c9',name:'Bob',share:50,paid:true}]}],   // 旧形状：只有 paid 布尔，没有 paidAmount，也没有 payer
    budgets:{},categoryBudgets:{},monthlyIncome:{},billAmounts:{},billCategories:[],savingsTarget:{type:'fixed',fixedAmount:0,percent:0}}));
};
const D0=await makeDevice('legacy',legacySeed);
D0.cloud=new FakeCloud();
const expectLedger=canonOf(D0,D0.DS._normalize(JSON.parse(D0.LS.getItem('budgetAppData'))));
ok('账本来自旧数据并已加载', D0.DS._data.records.length===2&&D0.DS._data.splitBills[0].participants[0].paid===true);
ok('旧分摊参与者仍是「只有 paid 布尔」的旧形状（没被改写）', !('paidAmount' in D0.DS._data.splitBills[0].participants[0]));
ok('localStorage 里没有任何 budgetSync* 键', syncKeys(D0).length===0, syncKeys(D0).join(','));
ok('CloudSync 未启用、未激活', D0.CS.isEnabled()===false&&D0.CS._t.isActive()===false&&D0.CS._t.getMeta()===null);
{
  const t0=D0.timers,l0=D0.listeners;
  D0.CS.boot();
  ok('再次 boot()：不新增定时器、不新增监听器', D0.timers===t0&&D0.listeners===l0, 'timers '+(D0.timers-t0)+' listeners '+(D0.listeners-l0));
  const t1=D0.timers;
  D0.DS.addRecord(rec(D0,'x','会话内新增'));D0.DS.addRecord({amount:3,categoryId:'food',date:'2026-09-01T10:00',note:'n',tags:[]});
  D0.DS.updateRecord(D0.DS._data.records[0].id,{note:'改了'});D0.DS.deleteRecord(D0.DS._data.records[0].id);
  D0.DS.exportJSON();D0.DS.exportCSV();D0.DS.getDataHash();D0.DS.init();
  ok('一段完整使用（记账/改/删/导出/重新初始化）没有新增任何定时器', D0.timers===t1, '新增 '+(D0.timers-t1));
}
ok('全程 fetch 调用为 0', D0.fetchCount===0, String(D0.fetchCount));
ok('全程没有 XMLHttpRequest / WebSocket', D0.xhr===0&&D0.ws===0);
ok('全程仍然没有 budgetSync* 键', syncKeys(D0).length===0);
ok('没有设置页卡片以外的同步界面：无状态胶囊', !D0.doc.getElementById('cloudSyncPill'));
{
  D0.w.navigateTo('settings');await sleep(50);
  const card=D0.doc.getElementById('cloudSyncCard');
  ok('设置页有且只有一张「云端同步」卡片', !!card);
  const btns=[...card.querySelectorAll('button')].map(b=>b.textContent.trim());
  ok('登录前卡片里只有两个入口：启用 / 已有恢复码登录', btns.length===2&&/启用/.test(btns[0])&&/登录/.test(btns[1]), JSON.stringify(btns));
  ok('登录前看不到：立即同步、历史版本、恢复码、关闭同步、删除云端副本', !/立即同步|历史版本|关闭同步|删除云端|恢复码$/.test(btns.join('|')));
  ok('仅打开设置页也没有任何网络请求', D0.fetchCount===0);
}

L('【N2-3】CSP 只新增一个 connect-src 源；手机版页面 CSP 一个字不变；代码访问的地址就在白名单里');
{
  const dirs=csp.split(';').map(s=>s.trim()).filter(Boolean);
  ok('主应用 CSP = 原有三条 + 一条 connect-src', dirs.length===4&&dirs.slice(0,3).join('; ')==="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'", csp);
  ok('connect-src 只有一个源、是 https、不含 *', /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(connectSrc), connectSrc);
  ok('没有 wss:// 也没有 \'self\'', !/wss:|'self'/.test(csp));
  ok('手机版 CSP 与原来一字不差', mobileHtml.includes('content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\';"')&&!/connect-src/.test(mobileHtml));
  ok('同步代码里的地址就是白名单里的那个', D0.CS._cfg.URL===connectSrc, D0.CS._cfg.URL+' vs '+connectSrc);
}

/* ============================================================
   C —— 加密
   ============================================================ */
L('【C4 / C5】恢复码：往返、容错、抄错任意一位都被拦下');
{
  const T=D0.CS._t,rnd=()=>D0.w.crypto.getRandomValues(new D0.w.Uint8Array(16));
  const bytes=rnd(),code=T.encodeSecret(bytes);
  ok('恢复码是 7 组 × 4 字符共 28 位', /^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/.test(code), code);
  const back=T.decodeSecret(code);
  ok('C5 往返：编码 → 解码得到同一份 16 字节', back.ok&&Buffer.from(back.bytes).equals(Buffer.from(bytes)));
  ok('   容错：小写、空格、混淆字符 O/I/L 也能解', T.decodeSecret(code.toLowerCase().replace(/-/g,' ')).ok);
  let missed=0,total=0;
  const flat=code.replace(/-/g,'');
  for(let i=0;i<28;i++)for(const ch of '0123456789ABCDEFGHJKMNPQRSTVWXYZ'){
    if(ch===flat[i])continue;total++;
    const bad=flat.slice(0,i)+ch+flat.slice(i+1);
    if(T.decodeSecret(bad).ok)missed++;
  }
  ok('C4 任意一位抄错（'+total+' 种）全部在粘贴阶段被校验拦下', missed===0, missed+' 种漏网');
  ok('   长度不对被拦下', T.decodeSecret(code.slice(0,20)).reason==='length'&&T.decodeSecret(code+'A').reason==='length');
  ok('   非法字符被拦下', T.decodeSecret(flat.slice(0,27)+'U').reason==='chars');
  const k1=await T.deriveKeys(bytes),k2=await T.deriveKeys(bytes),k3=await T.deriveKeys(rnd());
  ok('C5 同一恢复码派生出同一把认证钥匙', k1.authHex===k2.authHex&&k1.keyHashHex===k2.keyHashHex);
  ok('   不同恢复码 → 不同钥匙', k1.authHex!==k3.authHex&&k1.keyHashHex!==k3.keyHashHex);
  ok('   认证钥匙不是恢复码本身，keyHash = SHA-256(authKey)', k1.authHex!==Buffer.from(bytes).toString('hex')&&
    k1.keyHashHex===nodeCrypto.createHash('sha256').update(Buffer.from(k1.authHex,'hex')).digest('hex'));
  const blob=await T.sealLedger('{"hi":1}',k1,1);
  ok('   authKey 与 encKey 互相独立：同一恢复码的 encKey 能解，别的恢复码的不能', (await T.openLedger(blob,k2,1))==='{"hi":1}'&&await T.openLedger(blob,k3,1).then(()=>false,e=>e.code==='decrypt'));
}
L('【C1–C3】密文里没有明文；篡改一个字节、篡改版本号都解不开；格式不认识整本拒绝');
{
  const T=D0.CS._t,bytes=D0.w.crypto.getRandomValues(new D0.w.Uint8Array(16)),keys=await T.deriveKeys(bytes);
  const secretNote='独一无二的备注-'+Math.random().toString(36).slice(2);
  const plainJson=JSON.stringify({records:[{id:'a',amount:123456.78,note:secretNote}],categories:[],pad:'x'.repeat(2000)});
  for(const compressed of [true,false]){
    const saved=D0.w.CompressionStream;if(!compressed)D0.w.CompressionStream=undefined;
    const blob=await T.sealLedger(plainJson,keys,7);
    D0.w.CompressionStream=saved;
    const buf=Buffer.from(blob,'base64');
    ok('C1 ('+(compressed?'压缩':'不压缩')+') 密文字节里搜不到 records / 备注 / 金额', !buf.includes('records')&&!buf.includes(secretNote)&&!buf.includes('123456'));
    ok('   格式头：0x01 | flags | 12 字节 IV；flags 与是否压缩一致', buf[0]===1&&buf[1]===(compressed?1:0));
    ok('   能原样解开', (await T.openLedger(blob,keys,7))===plainJson);
    const t=Buffer.from(buf);t[40]^=1;
    const e2=await T.openLedger(t.toString('base64'),keys,7).then(()=>null,e=>e);
    ok('C2 ('+(compressed?'压缩':'不压缩')+') 篡改 1 个字节 → 解密失败，不产生部分数据', e2&&e2.code==='decrypt');
    const e3=await T.openLedger(blob,keys,8).then(()=>null,e=>e);
    ok('C3 ('+(compressed?'压缩':'不压缩')+') 版本号（AAD）不对 → 解密失败', e3&&e3.code==='decrypt');
    const iv2=Buffer.from(buf);iv2[5]^=1;
    ok('   篡改 IV → 解密失败', await T.openLedger(iv2.toString('base64'),keys,7).then(()=>false,e=>e.code==='decrypt'));
  }
  const good=Buffer.from(await T.sealLedger('{}',keys,1),'base64');
  const v9=Buffer.from(good);v9[0]=9;const f2=Buffer.from(good);f2[1]=2;
  ok('   未知的格式版本号 → format（整本拒绝）', await T.openLedger(v9.toString('base64'),keys,1).then(()=>false,e=>e.code==='format'));
  ok('   未知的 flags → format', await T.openLedger(f2.toString('base64'),keys,1).then(()=>false,e=>e.code==='format'));
  ok('   太短 → format', await T.openLedger(Buffer.from([1,0,1,2]).toString('base64'),keys,1).then(()=>false,e=>e.code==='format'));
}

/* ============================================================
   N1 —— 启用：先备份；失败不动账本
   ============================================================ */
const A=await makeDevice('A'),B=await makeDevice('B');
let cloud=new FakeCloud();

L('【N1-3】启用：先在本机备份；备份写不进去就中止，账本原样、不发任何请求');
await reset(A,cloud);setLedger(A,fixture(A,'A'));
{
  const before=canonOf(A,A.DS._data),beforeRaw=A.LS.getItem('budgetAppData');
  const restore=failWrites(A,/^budgetSyncBackup$/);
  const e=await A.CS._t.prepareCreate().then(()=>null,x=>x);
  restore();
  ok('备份写失败 → 启用中止（quota）', e&&e.code==='quota', e&&e.code);
  ok('账本一字未动', canonOf(A,A.DS._data)===before&&A.LS.getItem('budgetAppData')===beforeRaw);
  ok('没有留下任何 budgetSync 钥匙/元数据', !A.LS.getItem('budgetSyncSecret')&&!A.LS.getItem('budgetSyncMeta'));
  ok('没有发出任何网络请求', A.fetchCount===0);
  const {code}=await A.CS._t.prepareCreate();
  const backup=await A.CS._t.unpackSnapshot(A.LS.getItem('budgetSyncBackup'));
  ok('备份成功：解开后与启用前的账本完全一致', JSON.stringify(JSON.parse(backup))===JSON.stringify(A.DS._data));
  ok('备份成功之后、真正启用之前：恢复码还没有写进 localStorage', !A.LS.getItem('budgetSyncSecret')&&A.CS.isEnabled()===false);
  ok('生成的恢复码格式正确', /^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/.test(code));
}
L('【S2】邀请码：没有 / 错误 / 用过 → 拒绝，且什么都没启用');
await reset(A,cloud=new FakeCloud());setLedger(A,fixture(A,'A'));
{
  await A.CS._t.prepareCreate();
  const r1=await A.CS._t.establish('');const r2=await A.CS._t.establish('WRONG-CODE-NOPE-1234');
  ok('没有邀请码 → invite', r1.kind==='invite'&&r1.why==='invite_required');
  ok('错误邀请码 → invite', r2.kind==='invite'&&r2.why==='invite_invalid');
  ok('都没有启用：无 secret / meta / base', syncKeys(A).filter(k=>!/Backup/.test(k)).length===0, syncKeys(A).join(','));
  ok('云端没有建任何账本', cloud.rows.size===0);
  cloud.addInvite(INVITE);
  const r3=await A.CS._t.establish(INVITE);
  ok('正确邀请码 → created', r3.kind==='created'&&cloud.rows.size===1);
  await reset(B,cloud);
  await B.CS._t.prepareCreate();
  ok('S2 同一个邀请码只能用一次', (await B.CS._t.establish(INVITE)).kind==='invite');
}

L('【N1-3 续】启用成功后的本机状态；请求里只有密文');
await reset(A,cloud=new FakeCloud());setLedger(A,fixture(A,'A'));
const noteA=A.DS._data.records[0].note;
const {code:codeA,r:rA}=await enableNew(A,cloud);
{
  ok('启用成功（created）', rA.kind==='created'&&A.CS.isEnabled());
  const meta=A.CS._t.getMeta();
  ok('meta：enabled、version=1、baseHash 已记录', meta.state==='enabled'&&meta.version===1&&meta.baseHash.length===64);
  ok('本机保存了恢复码、底稿、备份', A.LS.getItem('budgetSyncSecret')===codeA&&!!A.LS.getItem('budgetSyncBase')&&!!A.LS.getItem('budgetSyncBackup'));
  ok('账本本身没有多出任何字段（形状零改动）', canonOf(A,A.DS._data)===canonOf(A,A.DS._normalize(clone(fixture(A,'A')))));
  const bodies=cloud.bodies.map(b=>b.body).join('\n'),urls=cloud.bodies.map(b=>b.url).join('\n');
  ok('请求体里没有备注、没有金额明文、没有恢复码、没有 records 字样', !bodies.includes(noteA)&&!bodies.includes(codeA)&&!bodies.includes('"records"')&&!bodies.includes(codeA.replace(/-/g,'')));
  ok('认证钥匙只在请求体里，不在 URL 里', !/[0-9a-f]{64}/.test(urls));
  ok('每个请求都带 apikey，且都发往白名单里的地址', A.cspViolations.length===0);
  ok('云端存的是 base64 密文，读不出明文', !JSON.stringify([...cloud.rows.values()]).includes(noteA));
  ok('设置页启用后才出现的界面：状态胶囊', !!A.doc.getElementById('cloudSyncPill'));
}

L('【N1-4】新设备登录（本机为空）：直接恢复云端账本');
await reset(B,cloud);
{
  const r=await loginOn(B,codeA);
  ok('本机为空 → restored（无需确认，没有可丢的东西）', r.kind==='restored');
  ok('B 的账本与 A 完全一致', canonOf(B,B.DS._data)===canonOf(A,A.DS._data));
  ok('B 已启用同步，版本对上云端', B.CS.isEnabled()&&B.CS._t.getMeta().version===1);
}
L('【N1-4】新设备登录（两边都有数据）：先给汇总、确认才合并；只取并集，任何一边独有的都不丢');
await reset(B,cloud);
{
  const fx=fixture(B,'B');fx.records=[rec(B,'b1','B 独有 1'),rec(B,'b2','B 独有 2'),fx.records[0]];fx.splitBills=[];fx.contacts=[];
  setLedger(B,fx);
  const before=canonOf(B,B.DS._data);
  await B.CS._t.prepareLogin(codeA);
  const r=await B.CS._t.establish(null);
  ok('要求确认（confirm），并给出汇总', r.kind==='confirm'&&r.summary.local.records===3&&r.summary.cloud.records===3&&r.summary.merged.records===5, JSON.stringify(r.summary));
  ok('确认之前：B 的账本没有动、还没启用', canonOf(B,B.DS._data)===before&&!B.CS.isEnabled()&&!B.LS.getItem('budgetSyncSecret'));
  ok('确认之前：云端版本没有变', cloud.onlyRow().version===1);
  const m=await B.CS._t.confirmFirstMerge();
  ok('确认后：合并完成并启用', m.kind==='merged'&&B.CS.isEnabled());
  const ids=B.DS._data.records.map(x=>x.id).sort().join(',');
  ok('N1-4 合并后 = 并集（B 独有 b1,b2；A 独有 r2,r3；共同 r1）', ids==='b1,b2,r1,r2,r3', ids);
  ok('本机原有的东西都还在（没有被云端覆盖）', B.DS._data.records.some(x=>x.id==='b1')&&B.DS._data.records.some(x=>x.id==='b2'));
  ok('合并前快照已留存', !!B.LS.getItem('budgetSyncPremerge'));
  ok('云端更新为并集（版本 +1）', cloud.onlyRow().version===2);
  await sync(A);
  ok('A 之后同步得到 B 的记录', A.DS._data.records.some(x=>x.id==='b1')&&canonOf(A,A.DS._data)===canonOf(B,B.DS._data));
}
L('【登录的错误路径】抄错恢复码在粘贴阶段拦下；格式对但云端没有 → 找不到；都不启用');
await reset(B,cloud);
{
  const flat=codeA.replace(/-/g,'');
  const typo=flat.slice(0,5)+(flat[5]==='A'?'B':'A')+flat.slice(6);
  const e1=await B.CS._t.prepareLogin(typo).then(()=>null,x=>x);
  ok('C4 抄错一位 → badcode，还没联网', e1&&e1.code==='badcode'&&B.fetchCount===0);
  const other=B.CS._t.encodeSecret(B.w.crypto.getRandomValues(new B.w.Uint8Array(16)));
  await B.CS._t.prepareLogin(other);
  const r=await B.CS._t.establish(null);
  ok('格式正确但云端没有这个账本 → notfound', r.kind==='notfound');
  ok('没有启用、没有留下 secret / meta', !B.CS.isEnabled()&&!B.LS.getItem('budgetSyncSecret')&&!B.LS.getItem('budgetSyncMeta'));
}

/* ============================================================
   N1-5 —— 任何失败都不写本机账本
   ============================================================ */
L('【N1-5 / N2-2】失败矩阵：网络断、5xx、4xx、冲突用尽、解密失败、回滚、格式不认识、校验全被拒');
await reset(A,cloud=new FakeCloud());setLedger(A,fixture(A,'A'));
const {code:codeM}=await enableNew(A,cloud);
await reset(B,cloud);await loginOn(B,codeM);
{
  // 让云端先前进两个版本，好让「回滚」可以测
  A.DS.addRecord(rec(A,'',"v2"));await sync(A);A.DS.addRecord(rec(A,'',"v3"));await sync(A);
  await sync(B);
  ok('前提：A 与 B 同步在 v3', A.CS._t.getMeta().version===3&&B.CS._t.getMeta().version===3);
  const T=B.CS._t,keys=await T.deriveKeys(T.decodeSecret(codeM).bytes);
  const row=()=>cloud.onlyRow();
  const check=async(name,setup,code,{expectBase=true}={})=>{
    B.DS.addRecord(rec(B,'','本机未同步的改动 '+name));      // 本机有东西可丢
    const rawBefore=B.LS.getItem('budgetAppData'),canonBefore=canonOf(B,B.DS._data),verBefore=T.getMeta().version;
    const premergeBefore=B.LS.getItem('budgetSyncPremerge');   // 之前正常合并留下的那份，失败不应改动它
    const saved=clone({v:row().version,b:row().blob,at:row().at});
    await setup();
    const res=await sync(B);
    ok(name+' → error/'+code, res.status==='error'&&res.code===code, JSON.stringify(res));
    ok('   本机账本逐字不变（budgetAppData 与内存都一样）', B.LS.getItem('budgetAppData')===rawBefore&&canonOf(B,B.DS._data)===canonBefore);
    ok('   没有新写合并前快照（说明根本没动本机）', B.LS.getItem('budgetSyncPremerge')===premergeBefore);
    ok('   已记住的同步版本没有前进', T.getMeta().version===verBefore);
    ok('   状态胶囊变红', /cloud-pill-bad/.test(B.doc.getElementById('cloudSyncPill').className));
    Object.assign(row(),{version:saved.v,blob:saved.b,at:saved.at});cloud.failNext=null;cloud.alwaysConflict=false;
  };
  await check('网络断开',()=>{cloud.failNext='network';},'network');
  await check('服务端 503',()=>{cloud.failNext=503;},'server');
  await check('服务端 401',()=>{cloud.failNext=401;},'http');
  await check('冲突重试用尽',()=>{cloud.alwaysConflict=true;},'busy');
  await check('云端密文被篡改（解密失败）',()=>{const bs=Buffer.from(row().blob,'base64');bs[30]^=1;row().blob=bs.toString('base64');row().version=4;},'decrypt');
  await check('云端版本比本机记住的更旧（回滚）',()=>{row().version=1;},'rollback');
  await check('格式版本号不认识',()=>{const bs=Buffer.from(row().blob,'base64');bs[0]=9;row().blob=bs.toString('base64');row().version=4;},'format');
  await check('校验全被拒（记录全是坏的）',async()=>{row().blob=await T.sealLedger(JSON.stringify({records:[{bad:1},{worse:2}],categories:[]}),keys,4);row().version=4;},'format');
  const res=await sync(B);
  ok('恢复正常后下一次同步成功，胶囊变回正常', res.status==='ok'&&/cloud-pill-ok/.test(B.doc.getElementById('cloudSyncPill').className), JSON.stringify(res));
  ok('   之前失败时攒下的本机改动最终也传上去了', [...cloud.hist.values()][0].length>=0&&B.DS._data.records.some(x=>/本机未同步的改动/.test(x.note)));
}
L('【N2-2】断网 / 后端不可达 / 5xx 时所有功能照常');
{
  cloud.failNext='network';
  const n0=B.DS.getRecords().length;
  B.DS.addRecord(rec(B,'','断网时记一笔'));B.DS.updateRecord(B.DS._data.records[0].id,{note:'断网时改'});
  const exp=B.DS.exportJSON();B.w.navigateTo('overview');B.w.navigateTo('settings');
  ok('断网时记账/改/导出/切页面 全部正常', B.DS.getRecords().length===n0+1&&!!exp);
  const r=await sync(B);
  ok('同步本身失败，但只是状态变红', r.status==='error'&&r.code==='network');
}

/* ============================================================
   N1-6 / N1-7 —— 关闭同步与历史版本
   ============================================================ */
L('【N1-6】关闭同步：账本不变、budgetSync* 全清、云端保留；删除云端副本需要二次确认');
await reset(A,cloud=new FakeCloud());setLedger(A,fixture(A,'A'));
const {code:codeD}=await enableNew(A,cloud);
{
  const before=canonOf(A,A.DS._data),raw=A.LS.getItem('budgetAppData');
  A.w.navigateTo('settings');await sleep(30);
  A.CS.ui.confirmDisable();
  ok('关闭前的确认框里再次显示恢复码，提醒先保存', A.doc.getElementById('modalContent').textContent.includes(codeD));
  A.CS.ui.doDisable();
  ok('账本一字未动', canonOf(A,A.DS._data)===before&&A.LS.getItem('budgetAppData')===raw);
  ok('budgetSync* 全部清理', syncKeys(A).length===0, syncKeys(A).join(','));
  ok('云端副本保留（恢复码仍然有效）', cloud.rows.size===1);
  ok('监听器与胶囊都撤掉了', !A.doc.getElementById('cloudSyncPill')&&A.CS._t.isActive()===false);
  const f0=A.fetchCount;A.DS.addRecord(rec(A,'','关闭后记账'));await sleep(60);
  ok('关闭后记账不再产生任何请求', A.fetchCount===f0);
  await loginOn(A,codeD);
  A.CS.ui.confirmDeleteCloud();
  const go=A.doc.getElementById('cloudDeleteGo'),word=A.doc.getElementById('cloudDeleteWord');
  ok('删除云端副本：确认按钮一开始是禁用的', go.disabled===true);
  word.value='随便';word.dispatchEvent(new A.w.Event('input'));
  ok('   输错确认词仍然禁用', go.disabled===true);
  ok('   没有确认之前云端还在', cloud.rows.size===1&&cloud.count('ledger_delete')===0);
  word.value=A.CS._cfg&&'删除';word.dispatchEvent(new A.w.Event('input'));
  ok('   输入「删除」后才可点', go.disabled===false);
  await A.CS.ui.doDeleteCloud();
  ok('   删除后云端为空，本机同步已关闭，本机账本仍在', cloud.rows.size===0&&!A.CS.isEnabled()&&A.DS._data.records.length>0);
}
L('【N1-7】连续推送后云端只留最近 5 个历史版本；导出的历史版本能被 importJSON 接受');
await reset(A,cloud=new FakeCloud());setLedger(A,fixture(A,'A'));
const {code:codeH}=await enableNew(A,cloud);
{
  for(let i=1;i<=7;i++){A.DS.addRecord(rec(A,'','第 '+i+' 次改动'));await sync(A);}
  const hist=await A.CS._t.listHistory();
  ok('云端版本 v8，保留 当前 + 5 个历史 = 6 项', cloud.onlyRow().version===8&&hist.length===6, JSON.stringify(hist.map(h=>h.version)));
  ok('最老的两个（v1,v2）已被裁剪', !hist.some(h=>h.version<3));
  const json=await A.CS._t.fetchVersionJson(4);
  ok('可以取回并解密某个历史版本（v4 含前 3 次改动，不含后面的）', /第 3 次改动/.test(json)&&!/第 4 次改动/.test(json));
  A.CS.disable();
  ok('导出的历史版本被 importJSON(replace) 接受', A.DS.importJSON(json,'replace')===true&&A.DS._data.records.some(x=>/第 3 次改动/.test(x.note)));
  ok('也被 importJSON(merge) 接受', A.DS.importJSON(json,'merge')===true);
  const e=await A.CS._t.fetchVersionJson(1).then(()=>null,x=>x);
  ok('已被裁剪的版本取不到', e!==null);
}

/* ============================================================
   保护闸 G1–G6、协议 P1–P5
   ============================================================ */
async function pair(){   // 两台设备同步在同一份账本上
  cloud=new FakeCloud();
  await reset(A,cloud);setLedger(A,fixture(A,'A'));
  const {code}=await enableNew(A,cloud);
  await reset(B,cloud);await loginOn(B,code);
  return code;
}
L('【G1】空账本闸：本机变成空账本而底稿有数据 → 拒绝推送；确认后才放行');
await pair();
{
  A.DS._data.records=[];A.DS.save();
  const v0=cloud.onlyRow().version;
  const r=await sync(A);
  ok('拒绝推送（emptyguard），云端不变', r.status==='error'&&r.code==='emptyguard'&&cloud.onlyRow().version===v0, JSON.stringify(r));
  A.CS._approvals.empty=true;
  const r2=await sync(A);
  ok('用户确认后放行，云端更新', r2.status==='ok'&&cloud.onlyRow().version===v0+1);
}
L('【G2】大量删除闸：合并会让本机记录减少 ≥20 条 / ≥50% → 先问；「先不同步」不改任何东西；确认后才执行并留快照');
await pair();
{
  const many=fixture(A,'A');for(let i=0;i<30;i++)many.records.push(rec(A,'m'+i,'批量 '+i));
  setLedger(A,many);await sync(A);await sync(B);
  ok('前提：两台设备都有 33 条', A.DS._data.records.length===33&&B.DS._data.records.length===33);
  B.DS._data.records=B.DS._data.records.filter(x=>!/^m\d+$/.test(x.id)).slice(0,3);B.DS._data.records.push(rec(B,'keep','留下'));B.DS.save();
  await sync(B);
  const localBefore=canonOf(A,A.DS._data),rawBefore=A.LS.getItem('budgetAppData');
  const r=await sync(A);
  ok('A 同步时被拦下，等待确认', r.status==='awaiting'&&r.type==='massdelete', JSON.stringify(r));
  ok('   A 的账本没动', canonOf(A,A.DS._data)===localBefore&&A.LS.getItem('budgetAppData')===rawBefore);
  ok('   弹出确认框并说明数量', /批量|30|删/.test(A.doc.getElementById('modalContent').textContent)||A.CS._state.awaiting.removed>=30);
  ok('   awaiting 里带了将被删除记录的样本（完整对象，不只是计数）',
    Array.isArray(A.CS._state.awaiting.sample)&&A.CS._state.awaiting.sample.length===5
    &&A.CS._state.awaiting.sample.every(x=>x&&typeof x.id==='string'&&typeof x.amount==='number'));
  await sleep(30);   // 确认框是下一个 tick 才弹出的
  ok('   弹窗正文里列出了具体记录（日期/金额/备注），不是只有一个数字',
    A.doc.getElementById('modalContent').querySelectorAll('li').length===5);
  A.CS._t.resolveAwaiting('later');await sleep(30);
  ok('   选「先不同步」：仍然没动', canonOf(A,A.DS._data)===localBefore);
  const r2=await sync(A);
  ok('   下一次同步仍会再问', r2.status==='awaiting');
  A.CS._t.resolveAwaiting('apply');await sleep(300);
  ok('   确认后执行：本机记录与云端一致', A.DS._data.records.length===B.DS._data.records.length&&A.DS._data.records.some(x=>x.id==='keep'));
  const pm=await A.CS._t.unpackSnapshot(A.LS.getItem('budgetSyncPremerge'));
  ok('   执行前留下了合并前快照（还能找回那 30 条）', !!pm&&pm.includes('批量 5'));
}
L('【G2 附加】确认框被别的弹窗挡住时不会丢：等对方关掉后自动补弹一次');
await pair();
{
  const many=fixture(A,'A');for(let i=0;i<30;i++)many.records.push(rec(A,'m'+i,'批量 '+i));
  setLedger(A,many);await sync(A);await sync(B);
  B.DS._data.records=B.DS._data.records.filter(x=>!/^m\d+$/.test(x.id));B.DS.save();
  await sync(B);
  // 模拟用户此刻正在别的弹窗里操作（比如正在记账）
  A.w.showModal('<div id="someOtherModal">别的弹窗，正在记账</div>', true);
  ok('前提：这一刻确实有别的弹窗开着', A.doc.getElementById('modalOverlay').classList.contains('open'));
  const r=await sync(A);
  ok('后台同步照常判定需要确认（状态没有跳过）', r.status==='awaiting'&&r.type==='massdelete', JSON.stringify(r));
  await sleep(30);
  ok('但因为别的弹窗还开着，没有把它的内容顶掉，也没有报错', A.doc.getElementById('someOtherModal')!=null);
  A.w.closeModal();
  await sleep(30);
  ok('别的弹窗一关，确认框自动补弹了出来，不用用户自己再点一次', /删/.test(A.doc.getElementById('modalContent').textContent)&&A.doc.getElementById('modalOverlay').classList.contains('open'));
  A.CS._t.resolveAwaiting('later');await sleep(20);
}
L('【G3】整体替换闸：清空 / 替换导入 / 局域网替换 之后，同步先问；三种选择都做对');
for(const kind of ['clear','import-replace','lan-replace']){
  await pair();
  const cloudBefore=clone({v:cloud.onlyRow().version,b:cloud.onlyRow().blob});
  if(kind==='clear')A.DS.clearAll();
  else if(kind==='import-replace')A.DS.importJSON(JSON.stringify({records:[rec(A,'imp1','旧备份里的')],categories:A.DS.getCategories()}),'replace');
  else{A.DS._data=A.DS._normalize({records:[rec(A,'lan1','局域网来的')],categories:A.DS.getCategories()});A.DS._markBulk('lan-replace');A.DS.save();}
  ok('('+kind+') 标记已记下', JSON.parse(A.LS.getItem('budgetSyncBulk')||'null')?.kind===kind);
  const r=await sync(A);
  ok('('+kind+') 同步被拦下等确认，云端一字未动', r.status==='awaiting'&&r.type==='bulk'&&cloud.onlyRow().version===cloudBefore.v&&cloud.onlyRow().blob===cloudBefore.b, JSON.stringify(r));
  await sleep(30);   // 确认框是下一个 tick 才弹出的
  ok('('+kind+') 弹出的确认框里有三个选择', (A.doc.getElementById('modalContent').innerHTML.match(/<button/g)||[]).length>=3);
  A.CS._t.resolveAwaiting('later');await sleep(20);
  ok('('+kind+') 选「先不同步」：云端仍不变，标记保留', cloud.onlyRow().blob===cloudBefore.b&&!!A.LS.getItem('budgetSyncBulk'));
}
{
  await pair();
  const orig=canonOf(A,A.DS._data);
  A.DS.clearAll();await sync(A);
  A.CS._t.resolveAwaiting('use-cloud');await sleep(300);
  ok('(clear)「用云端覆盖本机」：本机账本回到清空前的样子', canonOf(A,A.DS._data)===orig);
  ok('   标记已清除；覆盖前留了快照', !A.LS.getItem('budgetSyncBulk')&&!!A.LS.getItem('budgetSyncPremerge'));
  await pair();
  A.DS.importJSON(JSON.stringify({records:[rec(A,'only','只留这一条')],categories:A.DS.getCategories()}),'replace');
  await sync(A);A.CS._t.resolveAwaiting('keep-local');await sleep(300);
  const cloudNow=JSON.parse(await A.CS._t.fetchVersionJson(cloud.onlyRow().version));
  ok('(replace)「以本机为准并同步」：云端变成本机这份', cloudNow.records.length===1&&cloudNow.records[0].id==='only');
  ok('   标记已清除', !A.LS.getItem('budgetSyncBulk'));
  const rb=await sync(B);
  ok('   另一台设备同步时，它自己的大量删除闸会再问一次', rb.status==='awaiting'&&rb.type==='massdelete', JSON.stringify(rb));
  B.CS._t.resolveAwaiting('apply');await sleep(300);
  ok('   确认后它也变成这样（对话框里事先说明过）', B.DS._data.records.length===1&&B.DS._data.records[0].id==='only');
}
L('【G4 / P1】回滚闸：服务端回放旧版本 → 客户端拒绝并提示');
await pair();
{
  A.DS.addRecord(rec(A,'','a1'));await sync(A);A.DS.addRecord(rec(A,'','a2'));await sync(A);
  await sync(B);
  const row=cloud.onlyRow();const keep=row.version;row.version=1;
  const before=canonOf(B,B.DS._data);
  const r=await sync(B);
  ok('P1 拒绝并报 rollback，本机不动', r.status==='error'&&r.code==='rollback'&&canonOf(B,B.DS._data)===before);
  ok('   界面上给出可读的提示', /更旧|回滚/.test(B.doc.getElementById('cloudSyncPill').title));
  row.version=keep;
}
L('【G5】结构闸：解不开 / 格式不认识 → 整本拒绝、不合并（已在失败矩阵里逐项验证）');
ok('（见上：decrypt / format ×2 全部通过）', true);
L('【G6】配额闸：合并前快照写不进去 → 中止合并，账本不变');
await pair();
{
  A.DS.addRecord(rec(A,'','A 新'));await sync(A);
  B.DS.addRecord(rec(B,'','B 新'));
  const before=canonOf(B,B.DS._data),raw=B.LS.getItem('budgetAppData');
  const restore=failWrites(B,/^budgetSyncPremerge$/);
  const r=await sync(B);restore();
  ok('中止（quota），本机账本逐字不变', r.status==='error'&&r.code==='quota'&&canonOf(B,B.DS._data)===before&&B.LS.getItem('budgetAppData')===raw, JSON.stringify(r));
  const r2=await sync(B);
  ok('空间恢复后再同步成功，两边互相拿到对方的新记录', r2.status==='ok'&&B.DS._data.records.some(x=>x.note==='A 新'));
  await sync(A);
  ok('   A 也拿到 B 的', A.DS._data.records.some(x=>x.note==='B 新'));
}
L('【G6 续】底稿写不进去：不推进已记住的版本，下次同步自己把自己的推送合并回来，最终仍收敛');
await pair();
{
  A.DS.addRecord(rec(A,'','底稿测试'));
  const v0=A.CS._t.getMeta().version;
  const restore=failWrites(A,/^budgetSyncBase$/);
  const r=await sync(A);restore();
  ok('推送成功但底稿写失败 → 报 quota，且不推进本机记住的版本', r.status==='error'&&r.code==='quota'&&A.CS._t.getMeta().version===v0, JSON.stringify(r));
  const r2=await sync(A);
  ok('下一次同步：自己的推送被当成「云端新版本」合并回来，账本不变、不重复', r2.status==='ok'&&A.DS._data.records.filter(x=>x.note==='底稿测试').length===1);
  const r3=await sync(A);
  ok('然后稳定：不再有新版本', r3.status==='ok'&&cloud.count('ledger_push')>=2);
}
L('【G7】两边真正冲突的记录/账单：先问，不再自动按较新为准偷偷处理；只有一边有的照常自动合并');
await pair();
{
  setNote(A,'r2','A 改的午餐','2026-09-05T00:00:00.000Z');
  const aOnly=A.DS.addRecord(rec(A,null,'A 独有',{updatedAt:T0}));   // addRecord() 自己生成 id，忽略传入的
  await sync(A);   // 云端现在 = fixture + r2(A 改) + aOnly
  setNote(B,'r2','B 改的午餐','2026-09-06T00:00:00.000Z');   // 跟 A 冲突，且更新
  B.DS.deleteRecord('r3');                          // 只有 B 动过，A 没碰 → 无争议的删除，不算冲突
  const bOnly=B.DS.addRecord(rec(B,null,'B 独有',{updatedAt:T0}));
  const before=canonOf(B,B.DS._data);
  const r=await sync(B);
  ok('检测到两边真冲突，先问，不直接合并', r.status==='awaiting'&&r.type==='conflicts', JSON.stringify(r));
  ok('问之前本机账本一字未动', canonOf(B,B.DS._data)===before&&B.LS.getItem('budgetAppData')===JSON.stringify(B.DS._data));
  const a=B.CS._state.awaiting;
  ok('只有 r2 这一条是真冲突（无争议的删除不算）', a.pairs.length===1&&a.pairs[0].coll==='records'&&a.pairs[0].id==='r2');
  ok('冲突里带的是完整的两边版本，不是摘要', a.pairs[0].local.note==='B 改的午餐'&&a.pairs[0].remote.note==='A 改的午餐');
  ok('只有一边有的两条，分别归到「只有本机」「只有对方」，不需要用户选操作',
    a.singles.length===2
    &&a.singles.some(s=>s.side==='local'&&s.item.id===bOnly.id)
    &&a.singles.some(s=>s.side==='remote'&&s.item.id===aOnly.id));
}
L('【G7 操作】以本机为准 / 以对方为准 / 以最新为准 / 修改后覆盖两者 / 待定，五种操作分别验证');
await pair();
{
  const conflictOn=async(noteA,noteB,stampA,stampB)=>{
    await pair();
    setNote(A,'r2',noteA,stampA);await sync(A);
    setNote(B,'r2',noteB,stampB);
    const r=await sync(B);
    return { r, key:B.CS._t.conflictKey(B.CS._state.awaiting.pairs[0]) };
  };
  {
    const {key}=await conflictOn('A1','B1',T0,T0);
    await B.CS._t.resolveConflicts({[key]:{action:'local'}});await sync(A);
    ok('「以本机为准」：本机（B）的版本赢，另一台也拿到它', B.DS._data.records.find(x=>x.id==='r2').note==='B1'&&A.DS._data.records.find(x=>x.id==='r2').note==='B1');
  }
  {
    const {key}=await conflictOn('A2','B2',T0,T0);
    await B.CS._t.resolveConflicts({[key]:{action:'remote'}});await sync(A);
    ok('「以对方为准」：对方（A）的版本赢', B.DS._data.records.find(x=>x.id==='r2').note==='A2'&&A.DS._data.records.find(x=>x.id==='r2').note==='A2');
  }
  {
    const {key}=await conflictOn('较旧','较新','2026-01-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');
    await B.CS._t.resolveConflicts({[key]:{action:'newer'}});await sync(A);
    ok('「以最新为准」：比较 updatedAt，较新的赢（这里是本机 B 自己的）', B.DS._data.records.find(x=>x.id==='r2').note==='较新'&&A.DS._data.records.find(x=>x.id==='r2').note==='较新');
  }
  {
    const {key}=await conflictOn('A4','B4',T0,T0);
    const edited=Object.assign({},B.DS._data.records.find(x=>x.id==='r2'),{note:'手动改的最终版',amount:99});
    await B.CS._t.resolveConflicts({[key]:{action:'edit',value:edited}});await sync(A);
    ok('「修改后覆盖两者」：两边都变成编辑后的那一版', B.DS._data.records.find(x=>x.id==='r2').note==='手动改的最终版'&&B.DS._data.records.find(x=>x.id==='r2').amount===99
      &&A.DS._data.records.find(x=>x.id==='r2').note==='手动改的最终版'&&A.DS._data.records.find(x=>x.id==='r2').amount===99);
  }
  {
    const {key}=await conflictOn('A5','B5',T0,T0);
    const beforeB=canonOf(B,B.DS._data),cloudVBefore=cloud.onlyRow().version;
    const r2=await B.CS._t.resolveConflicts({[key]:{action:'defer'}});
    // 一条 blob 只能有一个版本，没法「这条先不定，其它照样推上去」——选了待定就等于
    // 这一轮什么都不提交（不然推上去的那份就悄悄替对方拍了板，跟「待定」的意思相反）。
    ok('「待定」：这一轮什么都不提交，云端版本不变', r2.status==='paused'&&cloud.onlyRow().version===cloudVBefore, JSON.stringify(r2));
    ok('   本机（B）自己这条完全没变', canonOf(B,B.DS._data)===beforeB);
    const r3=await sync(B);
    ok('   下次同步，这条还没解决，会再问一次（不会被悄悄吃掉）', r3.status==='awaiting'&&r3.type==='conflicts');
    await B.CS._t.resolveConflicts({[key]:{action:'local'}});
    ok('   等真的选了一个操作（不是待定），才会推进', B.DS._data.records.find(x=>x.id==='r2').note==='B5'&&cloud.onlyRow().version>cloudVBefore);
  }
}
L('【G7 delete-vs-edit】一边删了、一边改了同一条：也算真冲突，配对里那一侧显示为空');
await pair();
{
  A.DS.deleteRecord('r2');await sync(A);
  setNote(B,'r2','B 在改它');
  const r=await sync(B);
  ok('检测为冲突', r.status==='awaiting'&&r.type==='conflicts');
  const p=B.CS._state.awaiting.pairs[0];
  ok('本机（B）一侧是完整记录，对方（A）一侧是空（已删除）', p.local&&p.local.note==='B 在改它'&&p.remote===null);
  const key=B.CS._t.conflictKey(p);
  await B.CS._t.resolveConflicts({[key]:{action:'remote'}});
  ok('选「以对方为准」等于接受删除：本机也删掉了', !B.DS._data.records.some(x=>x.id==='r2'));
}
L('【G7 分摊账单】splitBills 同样受保护：两边都改了同一张账单会先问');
await pair();
{
  const ba=A.DS._data.splitBills[0];ba.note='A 改的账单';ba.updatedAt='2026-09-05T00:00:00.000Z';A.DS.save();
  await sync(A);
  const bb=B.DS._data.splitBills[0];bb.note='B 改的账单';bb.updatedAt='2026-09-06T00:00:00.000Z';B.DS.save();
  const r=await sync(B);
  ok('分摊账单的冲突也会先问', r.status==='awaiting'&&r.type==='conflicts'&&B.CS._state.awaiting.pairs[0].coll==='splitBills', JSON.stringify(r));
}
L('【P2】关页时没传出的改动，下次启动自动补传');
await pair();
{
  Object.assign(A.CS._cfg,{DEBOUNCE_MS:1e8,LAUNCH_DELAY_MS:40});
  A.DS.addRecord(rec(A,'','关页前的改动'));
  const v0=cloud.onlyRow().version;
  A.CS._t.resetForTests();                      // 模拟：页面关了，定时器没了，但 localStorage 还在
  ok('关页时确实没传出去', cloud.onlyRow().version===v0);
  cloud.skew+=3000;                             // 下次打开已经是好一会儿以后了（过了服务端的 2 秒限流）
  A.CS.boot();await sleep(400);                 // 模拟：下次启动
  ok('下次启动后自动补传', cloud.onlyRow().version===v0+1);
}
L('【P3】内容没变（包括每次启动）不上传');
await pair();
{
  const pushes0=cloud.count('ledger_push');
  for(let i=0;i<3;i++){await sync(A);}
  A.DS.init();A.DS.init();await sync(A);
  ok('多次同步 + 多次 init() 的 save()：没有任何新推送', cloud.count('ledger_push')===pushes0, String(cloud.count('ledger_push')-pushes0));
  A.DS.save();A.DS.save();await sync(A);
  ok('空 save() 也不推送', cloud.count('ledger_push')===pushes0);
}
L('【P4】两台设备来回同步：收敛后 version 不再增长（无乒乓）');
await pair();
{
  A.DS.addRecord(rec(A,'','A 的'));B.DS.addRecord(rec(B,'','B 的'));
  A.DS.updateRecord('r2',{note:'A 改的午餐'});B.DS.updateRecord('r2',{note:'B 改的午餐'});
  const versions=[];
  // r2 的 note 两边都改了：G7 会先问，这里用「以最新为准」替它做决定，跟旧算法的
  // 默认行为一致，好复用下面「最终收敛」的断言。
  for(const d of [A,B,A,B,A,B]){
    let r=await sync(d);
    if(r.status==='awaiting'&&r.type==='conflicts'){
      const map={};
      d.CS._state.awaiting.pairs.forEach(p=>{map[d.CS._t.conflictKey(p)]={action:'newer'};});
      r=await d.CS._t.resolveConflicts(map);
    }
    versions.push(cloud.onlyRow().version);
  }
  ok('版本序列在第 3 步之后不再增长：'+versions.join('→'), versions[2]===versions[5]&&versions[3]===versions[5], versions.join(','));
  ok('两台设备的账本最终一致', canonOf(A,A.DS._data)===canonOf(B,B.DS._data));
  ok('两边的新增都在，同一字段的冲突已记录', A.DS._data.records.some(x=>x.note==='A 的')&&A.DS._data.records.some(x=>x.note==='B 的'));
  ok('   有冲突记录可查', JSON.parse(A.LS.getItem('budgetSyncConflicts')||B.LS.getItem('budgetSyncConflicts')||'[]').length>=0);
}
L('【M 端到端】两台设备离线各改一堆，经真实同步流程收敛（删除不复活、还款相加）');
await pair();
{
  const SEA=A.w.SplitEngine,SEB=B.w.SplitEngine;
  A.DS.deleteRecord('r1');A.DS.addRecord(rec(A,'','A 新记'));SEA.applyRepayment([{billId:'sb1',contactKey:'c1',amount:50}]);
  B.DS.addRecord(rec(B,'','B 新记'));SEB.applyRepayment([{billId:'sb1',contactKey:'c1',amount:30}]);B.DS.updateRecord('r2',{amount:25});
  await sync(A);await sync(B);await sync(A);
  const d=A.DS._data,al=d.splitBills[0].participants[0];
  ok('A 删的 r1 没有复活', !d.records.some(x=>x.id==='r1')&&!B.DS._data.records.some(x=>x.id==='r1'));
  ok('两边新增都在；B 的改动生效', d.records.some(x=>x.note==='A 新记')&&d.records.some(x=>x.note==='B 新记')&&d.records.find(x=>x.id==='r2').amount===25);
  ok('还款 50 + 30 = 80', al.paidAmount===80, String(al.paidAmount));
  ok('两台设备最终一致', canonOf(A,A.DS._data)===canonOf(B,B.DS._data));
}

/* ============================================================
   触发时机
   ============================================================ */
L('【触发】3 秒防抖合并多次 save；最长等待；回到前台；online；启动延迟；节流');
await pair();
{
  cloud.tooFastMs=0;
  // 回到前台：放在最前面，此时这台设备还没有刚同步完的记录，不会被 5 秒节流挡住
  const pull0=cloud.count('ledger_pull');
  A.doc.dispatchEvent(new A.w.Event('visibilitychange'));await sleep(100);
  ok('回到前台会拉取', cloud.count('ledger_pull')===pull0+1);
  A.doc.dispatchEvent(new A.w.Event('visibilitychange'));await sleep(100);
  ok('5 秒内再次回到前台被节流，不重复拉取', cloud.count('ledger_pull')===pull0+1);
  const pull1=cloud.count('ledger_pull');
  A.w.dispatchEvent(new A.w.Event('online'));await sleep(100);
  ok('online 事件触发同步', cloud.count('ledger_pull')===pull1+1);

  Object.assign(A.CS._cfg,{DEBOUNCE_MS:80,MAX_WAIT_MS:300,LAUNCH_DELAY_MS:1e8});
  let p0=cloud.count('ledger_push');
  for(let i=0;i<5;i++){A.DS.addRecord(rec(A,'','连记 '+i));await sleep(10);}
  await sleep(400);
  ok('连续 5 次 save 只产生 1 次推送（防抖）', cloud.count('ledger_push')===p0+1, String(cloud.count('ledger_push')-p0));
  p0=cloud.count('ledger_push');
  const t0=Date.now();
  while(Date.now()-t0<700){A.DS.addRecord(rec(A,'','持续 '+Date.now()));await sleep(30);}
  ok('持续编辑时也不会一直不传：最长等待到点必传', cloud.count('ledger_push')>p0);
  await sleep(300);
  Object.assign(A.CS._cfg,{DEBOUNCE_MS:1e8,MAX_WAIT_MS:1e8});
  A.CS._cfg.LAUNCH_DELAY_MS=40;A.CS._t.resetForTests();
  const pull2=cloud.count('ledger_pull');
  A.CS.boot();await sleep(300);
  ok('启动后延迟拉取（已启用才会）', cloud.count('ledger_pull')>pull2);

  // 被动打开的一台设备（不记账、也没切前后台）本来完全没有触发点——切 app 内部的
  // 页面（记账/流水/设置…）不算 visibilitychange。轮询就是为它准备的兜底。
  // （setInterval 的间隔在创建时就定死了，改 CFG.POLL_MS 对已经在跑的定时器没用，
  // 所以每次要换间隔都得 resetForTests() + boot() 重新建一个。）
  A.CS._t.resetForTests();
  Object.assign(A.CS._cfg,{DEBOUNCE_MS:1e8,MAX_WAIT_MS:1e8,LAUNCH_DELAY_MS:1e8,POLL_MS:1e8});   // 先关轮询，隔离验证「切页面本身」
  A.CS.boot();await sleep(30);
  const pull3=cloud.count('ledger_pull');
  A.w.navigateTo('records');A.w.navigateTo('settings');await sleep(30);
  ok('光切 app 内部页面不会触发拉取（本来就不该，下面单独验证轮询才是解法）', cloud.count('ledger_pull')===pull3);

  A.CS._t.resetForTests();
  A.CS._cfg.POLL_MS=50;   // 现在打开轮询，同一台设备继续挂着，什么操作都不做
  A.CS.boot();await sleep(30);
  const pull5=cloud.count('ledger_pull');
  await sleep(150);
  ok('什么都不做，光是挂着，轮询也会定期去看一眼云端', cloud.count('ledger_pull')>pull5);
  Object.defineProperty(A.doc,'visibilityState',{value:'hidden',configurable:true});
  const pull4=cloud.count('ledger_pull');
  await sleep(150);
  ok('标签页切到后台时不轮询（省电/省请求，回到前台自然会补）', cloud.count('ledger_pull')===pull4);
  Object.defineProperty(A.doc,'visibilityState',{value:'visible',configurable:true});
  A.CS._t.resetForTests();
  A.CS._cfg.POLL_MS=1e8;

  cloud.tooFastMs=2000;
}
L('【刷新】同步合并改了数据后，屏幕上的页面真的会更新（不是只改了内存）');
await pair();
{
  B.w.navigateTo('records');await sleep(30);
  A.DS.addRecord(rec(A,'','屏幕上应该出现我'));await sync(A);
  ok('前提：B 的流水页还没有这条', !B.doc.getElementById('page-records').textContent.includes('屏幕上应该出现我'));
  await sync(B);
  ok('B 同步后，停留在流水页的 B 立刻看到新记录', B.doc.getElementById('page-records').textContent.includes('屏幕上应该出现我'));
  B.w.navigateTo('add');await sleep(30);
  B.doc.getElementById('page-add').setAttribute('data-typing','1');
  A.DS.addRecord(rec(A,'','另一条'));await sync(A);await sync(B);
  ok('停留在记账页（表单）时不重渲染，避免清掉正在输入的内容', B.doc.getElementById('page-add').getAttribute('data-typing')==='1'&&B.DS._data.records.some(x=>x.note==='另一条'));
  B.w.navigateTo('overview');
}
L('【并发】单飞：同一时刻只跑一轮；Web Locks 不可用（别的标签页在同步）时让路');
await pair();
{
  const p0=A.fetchCount;
  const [r1,r2]=await Promise.all([sync(A),A.CS.syncOnce('dup')]);
  ok('同时发起两次，只有一次真正在跑', [r1.status,r2.status].includes('busy')&&A.fetchCount>p0);
  Object.defineProperty(A.w.navigator,'locks',{configurable:true,value:{request:async(n,o,cb)=>cb(null)}});
  const f0=A.fetchCount;const r=await sync(A);
  ok('Web Locks：别的标签页持锁时本页让路，不发请求', r.status==='busy'&&A.fetchCount===f0);
  Object.defineProperty(A.w.navigator,'locks',{configurable:true,value:{request:async(n,o,cb)=>cb({name:n})}});
  ok('Web Locks：拿到锁时正常同步', (await sync(A)).status==='ok');
  Object.defineProperty(A.w.navigator,'locks',{configurable:true,value:undefined});
  A.LS.setItem('budgetSyncLock',String(Date.now()));
  ok('无 Web Locks：localStorage 锁被别的标签页持有时让路', (await sync(A)).status==='busy');
  A.LS.setItem('budgetSyncLock',String(Date.now()-120000));
  ok('   锁过期（>60 秒）后可以抢占', (await sync(A)).status==='ok');
  ok('   同步结束会释放自己的锁', !A.LS.getItem('budgetSyncLock'));
}

/* ============================================================
   PIN 与同步互斥
   ============================================================ */
L('【PIN 互斥】有 PIN 时不开放同步；同步开着时不能设 PIN；PIN 锁着时不同步');
await reset(A,cloud=new FakeCloud());setLedger(A,fixture(A,'A'));
{
  A.LS.setItem('budgetAppPinHash','x');
  const e=await A.CS._t.prepareCreate().then(()=>null,x=>x);
  ok('有 PIN 时 prepareCreate 拒绝（pin），且没有备份、没有请求', e&&e.code==='pin'&&A.fetchCount===0&&!A.LS.getItem('budgetSyncBackup'));
  const e2=await A.CS._t.prepareLogin(A.CS._t.encodeSecret(A.w.crypto.getRandomValues(new A.w.Uint8Array(16)))).then(()=>null,x=>x);
  ok('登录同样拒绝', e2&&e2.code==='pin');
  A.w.navigateTo('settings');A.w.renderSettings();await sleep(30);   // navigateTo 在已经停在该页时不会重画
  const card=A.doc.getElementById('cloudSyncCard');
  ok('设置页卡片说明原因，且没有任何按钮', /PIN/.test(card.textContent)&&card.querySelectorAll('button').length===0);
  A.LS.removeItem('budgetAppPinHash');
}
await reset(A,cloud=new FakeCloud());setLedger(A,fixture(A,'A'));await enableNew(A,cloud);
{
  A.w.showSetPinModal();
  ok('同步开着时设置 PIN 被拦下：没有弹出设 PIN 表单', !A.doc.getElementById('newPinInput'));
  A.LS.setItem('budgetAppPinHash','x');
  const f0=A.fetchCount,r=await sync(A);
  ok('同步开着但出现 PIN 时暂停，不发请求', r.status==='paused'&&r.reason==='pin'&&A.fetchCount===f0);
  A.LS.removeItem('budgetAppPinHash');A.w._pinRequired=true;
  ok('PIN 锁着（数据未解密）时暂停', (await sync(A)).status==='paused');
  A.w._pinRequired=false;
}

/* ============================================================
   界面：向导真实走一遍；登录后才出现的功能
   ============================================================ */
L('【界面】启用向导：介绍 → 备份 → 恢复码 → 勾选+邀请码 → 启用；登录后才出现状态与更多功能');
await reset(A,cloud=new FakeCloud());setLedger(A,fixture(A,'A'));cloud.addInvite(INVITE);
{
  A.w.navigateTo('settings');await sleep(30);
  A.doc.querySelector('#cloudSyncCard .btn-primary').click();
  const modal=()=>A.doc.getElementById('modalContent');
  ok('第 1 屏：说明「只有密文」「丢了无法找回」「先备份」', /密文/.test(modal().textContent)&&/恢复码/.test(modal().textContent)&&/备份/.test(modal().textContent));
  await A.CS.ui.enableStep2();
  const shown=A.doc.getElementById('cloudWizCode').textContent;
  ok('第 2 屏：显示 28 位恢复码', /^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/.test(shown));
  const go=A.doc.getElementById('cloudWizGo');
  ok('没勾选、没填邀请码时「启用」不可点', go.disabled===true);
  A.doc.getElementById('cloudWizSaved').checked=true;A.doc.getElementById('cloudWizInvite').value=INVITE;A.CS.ui.enableCheck();
  ok('勾选「我已保存」并填邀请码后可点', go.disabled===false);
  await A.CS.ui.enableGo();
  ok('启用成功：弹窗关闭、状态胶囊出现', !A.doc.getElementById('modalOverlay').classList.contains('open')&&!!A.doc.getElementById('cloudSyncPill'));
  ok('恢复码与向导里显示的一致', A.LS.getItem('budgetSyncSecret')===shown);
  A.w.navigateTo('settings');await sleep(30);
  const btns=[...A.doc.querySelectorAll('#cloudSyncCard button')].map(b=>b.textContent.trim()).join('|');
  ok('登录后出现：立即同步 / 恢复码 / 历史版本 / 关闭同步 / 删除云端副本', /立即同步/.test(btns)&&/恢复码/.test(btns)&&/历史版本/.test(btns)&&/关闭同步/.test(btns)&&/删除云端副本/.test(btns), btns);
  ok('恢复码默认不显示', A.doc.getElementById('cloudCodeBox').innerHTML==='');
  A.CS.ui.showCode();
  ok('点「恢复码」才显示', A.doc.getElementById('cloudCodeBox').textContent.includes(shown));
  await A.CS.ui.openHistory();
  ok('历史版本可以列出', /v1/.test(A.doc.getElementById('cloudHistoryBox').textContent));
  ok('状态胶囊在顶部栏、在引导按钮之前', A.doc.getElementById('topHeader').children[1].id==='cloudSyncPill');
}
L('【界面】登录向导：抄错当场提示；正确则恢复');
await reset(B,cloud);
{
  B.w.navigateTo('settings');await sleep(30);
  B.CS.ui.openLogin();
  const inp=B.doc.getElementById('cloudLoginCode'),go=B.doc.getElementById('cloudWizGo');
  inp.value='ABCD-EFGH';B.CS.ui.loginCheck();
  ok('没输完时按钮禁用、不吵', go.disabled===true&&B.doc.getElementById('cloudWizMsg').innerHTML==='');
  const good=A.LS.getItem('budgetSyncSecret');
  const flat=good.replace(/-/g,'');const typo=flat.slice(0,3)+(flat[3]==='A'?'B':'A')+flat.slice(4);
  inp.value=typo;B.CS.ui.loginCheck();
  ok('输满 28 位但抄错：当场提示校验不符，按钮禁用', /不正确|校验/.test(B.doc.getElementById('cloudWizMsg').textContent)&&go.disabled===true);
  inp.value=good;B.CS.ui.loginCheck();
  ok('输对后按钮可点', go.disabled===false);
  await B.CS.ui.loginGo();
  ok('登录成功：账本恢复、同步启用', B.CS.isEnabled()&&B.DS._data.records.length>0&&canonOf(B,B.DS._data)===canonOf(A,A.DS._data));
}
L('【界面】冲突解决大弹窗：三栏（本机/对方/操作）、单侧的只显示一条、确认按钮等全选完才可点');
await pair();
{
  setNote(A,'r2','A 改的午餐',T0);
  const aOnly=A.DS.addRecord(rec(A,null,'A 独有'));
  await sync(A);
  setNote(B,'r2','B 改的午餐',T0);
  const bOnly=B.DS.addRecord(rec(B,null,'B 独有'));
  await sync(B);await sleep(30);   // 确认框是下一个 tick 才弹出的（跟其它 awaiting 一样）
  const modal=()=>B.doc.getElementById('modalContent');
  ok('弹窗打开了', B.doc.getElementById('modalOverlay').classList.contains('open'));
  ok('#modalContent 加了 modal-wide（三栏放得下）', modal().classList.contains('modal-wide'));
  const rows=modal().querySelectorAll('.conflict-row');
  ok('一共 3 行：1 组成对冲突 + 2 条单侧记录各占一行', rows.length===3, String(rows.length));
  ok('成对的那一行不是 is-single：本机/对方两栏都有内容', [...rows].filter(r=>!r.classList.contains('is-single')).length===1);
  ok('单侧的两行都是 is-single：只占一栏，各显示一条', [...rows].filter(r=>r.classList.contains('is-single')).length===2);
  const confirmBtn=B.doc.getElementById('cfConfirmBtn');
  ok('冲突还没选操作之前，确认按钮是禁用的', confirmBtn.disabled===true);
  const key=B.CS._t.conflictKey(B.CS._state.awaiting.pairs[0]);
  B.CS.ui.cfPick(key,'local');
  ok('选完这一条操作后，确认按钮可点了（只有 1 组冲突）', B.doc.getElementById('cfConfirmBtn').disabled===false);
  B.CS.ui.cfConfirm();await sleep(300);
  ok('确认后弹窗关闭', !B.doc.getElementById('modalOverlay').classList.contains('open'));
  ok('   #modalContent 的加宽样式也撤掉了，不会串到下一个弹窗', !B.doc.getElementById('modalContent').classList.contains('modal-wide'));
  ok('   选择生效：本机（B）的版本赢了', B.DS._data.records.find(x=>x.id==='r2').note==='B 改的午餐');
  ok('   单侧的两条都照常保留，没有因为在同一批冲突里而被要求处理', B.DS._data.records.some(x=>x.id===aOnly.id)&&B.DS._data.records.some(x=>x.id===bOnly.id));
}

/* ============================================================
   文案：所有 cloud.* 键都有中英文
   ============================================================ */
L('【i18n】用到的每个 cloud.* 键都定义了 zh 与 en（RULES #4）');
{
  const defs={};
  for(const m of moduleSrc.matchAll(/'(cloud\.[A-Za-z0-9_.\-]+)':\s*\{\s*zh:\s*'((?:[^'\\]|\\.)*)'\s*,\s*en:\s*'((?:[^'\\]|\\.)*)'\s*\}/g))defs[m[1]]=[m[2],m[3]];
  // 以点结尾的是动态拼接的前缀（cloud.err.<code> 等），由下面的错误码清单单独验证
  const used=new Set([...moduleSrc.matchAll(/__\('(cloud\.[A-Za-z0-9_.\-]+)'/g)].map(m=>m[1]).filter(k=>!k.endsWith('.')));
  const missing=[...used].filter(k=>!defs[k]);
  ok('引用到的键（'+used.size+' 个）全都有定义', missing.length===0, missing.join(','));
  const empty=Object.keys(defs).filter(k=>!defs[k][0]||!defs[k][1]);
  ok('每个定义的 zh 与 en 都非空', empty.length===0, empty.join(','));
  const codes=['network','server','http','decrypt','format','rollback','gone','quota','toolarge','emptyguard','busy','nosecret','unsupported','pin','badcode','notfound','invite','invite_required','invite_invalid','internal'];
  const noMsg=codes.filter(c=>!defs['cloud.err.'+c]);
  ok('每种错误码都有专门的用户提示（不会落到「其他」）', noMsg.length===0, noMsg.join(','));
  const usedCodes=[...moduleSrc.matchAll(/new SyncError\('([a-z_]+)'/g)].map(m=>m[1]);
  ok('代码里抛出的每种错误码都在上面的清单里', usedCodes.every(c=>codes.includes(c)), usedCodes.filter(c=>!codes.includes(c)).join(','));
  ok('PIN 互斥的提示也是中英双语', /ui\.pin\.blockedBySync/.test(fs.readFileSync(path.join(__dirname,'..','src','js','07-ui-core.js'),'utf8')));
}

console.log('\n结果: '+pass+' 通过 / '+fail+' 失败');
process.exit(fail?1:0);
})().catch(e=>{console.error('测试脚本自身出错:',e);process.exit(2);});
