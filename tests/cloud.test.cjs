const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const C=require('../src/core.js'),M=require('../src/menus.js'),Cloud=require('../src/cloud.js');
const root=path.resolve(__dirname,'..');
function server(){
  let now=Date.parse('2026-11-14T00:00:00Z'),failWrite=false,locked=false;
  const props=new Map(),sheets=new Map();
  const store={getProperty:k=>props.get(k)??null,setProperty(k,v){props.set(k,String(v));return this;},setProperties(o){for(const [k,v]of Object.entries(o))props.set(k,String(v));return this;}};
  function sheet(name){
    const data=[];
    return {name,data,clearContents(){data.length=0;},getMaxRows:()=>1000,insertRowsAfter(){},setFrozenRows(){},
      getRange(r,c,h,w){
        return {
          setNumberFormat(){return this;},
          setValues(values){if(failWrite)throw Error('Simulated Sheets failure');for(let y=0;y<h;y++){data[r-1+y]??=[];for(let x=0;x<w;x++)data[r-1+y][c-1+x]=values[y][x];}return this;},
          getDisplayValues(){return Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>String(data[r-1+y]?.[c-1+x]??'')));}
        };
      }
    };
  }
  const db={getId:()=>'test-sheet',getSheetByName:n=>sheets.get(n),insertSheet(n){const s=sheet(n);sheets.set(n,s);return s;}};
  const ctx=vm.createContext({console:{log(){}},Uint8Array,TextEncoder,TextDecoder,Date:class extends Date{static now(){return now;}},PropertiesService:{getScriptProperties:()=>store},LockService:{getScriptLock:()=>({tryLock(){if(locked)return false;locked=true;return true;},releaseLock(){locked=false;}})},SpreadsheetApp:{create:()=>db,openById:()=>db,flush(){}},Utilities:{newBlob:s=>({getBytes:()=>[...Buffer.from(s,'utf8')]}),getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(data,key)=>[...crypto.createHmac('sha256',key).update(data).digest()]},HtmlService:{XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createHtmlOutput:content=>({content,setXFrameOptionsMode(){return this;}})}});
  for(const name of ['Core.gs','Server.gs','Menus.gs','AuthCrypto.gs'])vm.runInContext(fs.readFileSync(path.join(root,'backend',name),'utf8'),ctx,{filename:name});
  const account={username:'test-user',salt:'a1'.repeat(32),iterations:600000,hash:crypto.pbkdf2Sync('test-password',Buffer.from('a1'.repeat(32),'hex'),600000,32,'sha256').toString('hex'),tokenSecret:'b2'.repeat(32)};
  ctx.initialAccount_=()=>account;ctx.setupSwimNote_();
  return {ctx,props,sheets,advance:ms=>{now+=ms;},failWrite:value=>{failWrite=value;},login:()=>ctx.handleApi_({action:'login',username:'test-user',password:'test-password'})};
}
const pupil=()=>({id:'safe',name:'確認用の子',birthDate:'2015-04-02',sex:'male',group:'J',grade:'2',note:'',history:[],status:'active',review:false,source:null});
const json=v=>JSON.parse(JSON.stringify(v));
test('server authentication, persisted cloud state, stale writes, idempotent retry and logout',()=>{
  const s=server();assert.throws(()=>s.ctx.handleApi_({action:'load',token:'x'}),e=>e.code==='AUTH_REQUIRED');
  const login=s.login();assert.equal(login.state.pupils.length,0);assert.equal(login.state.menuCards.length,6);
  assert.equal(s.props.get('SESSIONS').includes(login.token),false);
  const state=json(login.state);state.pupils.push(pupil());state.classes=['J'];state.testDate='2026-11-14';
  const request={action:'save',token:login.token,state,expectedRevision:0,mutationId:'save-request-0001'};
  assert.equal(s.ctx.handleApi_(request).revision,1);assert.equal(s.ctx.handleApi_(request).revision,1);
  assert.throws(()=>s.ctx.handleApi_({...request,mutationId:'save-request-0002'}),e=>e.code==='CONFLICT');
  const loaded=s.ctx.handleApi_({action:'load',token:login.token});assert.equal(loaded.state.pupils[0].name,'確認用の子');
  const before=s.props.get('DB_META');s.failWrite(true);
  assert.throws(()=>s.ctx.handleApi_({...request,expectedRevision:1,mutationId:'save-request-0003'}));assert.equal(s.props.get('DB_META'),before);
  s.failWrite(false);assert.equal(s.ctx.handleApi_({action:'load',token:login.token}).state.pupils.length,1);
  s.ctx.handleApi_({action:'logout',token:login.token});assert.throws(()=>s.ctx.handleApi_({action:'load',token:login.token}),e=>e.code==='AUTH_REQUIRED');
});
test('ten minutes of inactivity expires server session; active pings extend it',()=>{
  const s=server(),login=s.login();s.advance(599999);s.ctx.handleApi_({action:'ping',token:login.token});s.advance(599999);s.ctx.handleApi_({action:'load',token:login.token});s.advance(600000);assert.throws(()=>s.ctx.handleApi_({action:'load',token:login.token}),e=>e.code==='AUTH_REQUIRED');
});
test('wrong credentials fail and login attempts are throttled before password calculation',()=>{
  const s=server();assert.throws(()=>s.ctx.handleApi_({action:'login',username:'test-user',password:'wrong'}),e=>e.code==='INVALID_LOGIN');
  s.props.set('LOGIN_ATTEMPTS',JSON.stringify({count:5,until:Date.parse('2026-11-14T00:15:00Z')}));assert.throws(()=>s.login(),e=>e.code==='RATE_LIMIT');s.advance(15*60*1000);assert.ok(s.login().token);
});
test('sheet encoding round-trips long histories and never creates formula cells',()=>{
  const s=server(),p=pupil();p.id='=HYPERLINK("bad")';p.note='=IMPORTXML("bad")';p.history=Array.from({length:100},(_,i)=>({type:'profile_updated',date:'2026-11-14',at:'2026-11-14T00:00:00.000Z',from:'',to:'',note:'あ'.repeat(1000),detail:String(i)}));
  const state=C.validateBackup({format:'swim-local',version:1,pupils:[p]});const rows=s.ctx.encodeState_(state);assert.ok(rows.length>4);for(const row of rows)for(const cell of row)assert.doesNotMatch(String(cell),/^[=+@-]/);assert.deepEqual(json(s.ctx.decodeRows_(rows)),state);
});
test('API responses escape user content and reject an unconfigured origin',()=>{
  const s=server();const output=s.ctx.doPost({parameter:{payload:JSON.stringify({action:'load',requestId:'request-123456',origin:'https://evil.example',token:'invalid'})}});assert.ok(output.content.includes('BAD_REQUEST'));assert.ok(output.content.includes('https://ryu-mei-15.github.io'));assert.doesNotMatch(output.content,/test-password/);
});
test('transport accepts only the configured Apps Script URL and Google reply origins',()=>{
  assert.equal(Cloud.validEndpoint('https://script.google.com/macros/s/example-123/exec'),true);
  for(const url of ['https://evil.example/exec','http://script.google.com/macros/s/example/exec','https://script.google.com/macros/s/id/exec?token=x'])assert.equal(Cloud.validEndpoint(url),false);
  assert.equal(Cloud.isGoogleOrigin('https://n-abc-script.googleusercontent.com'),true);for(const origin of ['https://evil.googleusercontent.com','https://script.google.com.evil.example','null'])assert.equal(Cloud.isGoogleOrigin(origin),false);
  const outer={},inner={parent:outer};assert.equal(Cloud.isFrameSource(inner,outer),true);assert.equal(Cloud.isFrameSource({},outer),false);
});
test('lesson duration, time slots, distance, copied cards and backups remain consistent',()=>{
  const cards=M.seedCards();const plan={id:'lesson1',title:'確認レッスン',date:'2026-11-14',start:'16:00',group:'J',minutes:60,note:'',items:cards.map((c,i)=>({...c,id:'item'+i}))};
  const summary=M.summary(plan);assert.equal(summary.seconds,3000);assert.equal(summary.remaining,600);assert.equal(summary.distance,550);assert.equal(M.clock(plan.start,3000),'16:50');
  const state=C.validateBackup({format:'swim-local',version:1,pupils:[],menuCards:cards,lessons:[plan]});state.menuCards[0].seconds=60;assert.equal(state.lessons[0].items[0].seconds,300);assert.deepEqual(C.validateBackup(json(state)),state);
  assert.throws(()=>M.validate({lessons:[{...plan,minutes:40}]}));assert.throws(()=>M.lesson({...plan,date:'2026-02-30'}));
  const old=C.validateBackup({format:'swim-local',version:1,pupils:[]});assert.equal(C.importBackup(state,old,'merge').lessons.length,1);
  assert.equal(C.importBackup(state,{format:'swim-local',version:1,pupils:[]},'replace').lessons.length,1);
  assert.equal(C.importBackup(state,old,'replace').lessons.length,0);
});
