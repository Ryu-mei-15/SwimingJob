/* Google Apps Script V8. Helper names end in _ so they cannot be called by google.script.run. */
var SWIM_IDLE_MS_ = 10 * 60 * 1000;
function doGet() { return HtmlService.createHtmlOutput('スイムノートの保存APIです。GitHub Pagesの画面からログインしてください。'); }
function doPost(e) {
  var request,origin=PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGIN'),result;
  try {
    var raw=e && e.parameter && e.parameter.payload;
    if(typeof raw!=='string'||raw.length>8500000)throw apiError_('BAD_REQUEST','送信データのサイズ・形式を確認してください。');
    request=JSON.parse(raw);
    if(!origin||request.origin!==origin||!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(origin)||!/^[-a-zA-Z0-9]{10,80}$/.test(request.requestId||''))throw apiError_('BAD_REQUEST','接続元の設定が一致していません。');
    result={channel:'swim-api-v1',requestId:request.requestId,ok:true,value:handleApi_(request)};
  }catch(error){result={channel:'swim-api-v1',requestId:request&&request.requestId||'',ok:false,error:{code:error.code||'SERVER_ERROR',message:error.code?error.message:'Google側の処理を完了できませんでした。管理者に確認してください。'}};}
  var escape=function(value){return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,function(c){return '\\u'+c.charCodeAt(0).toString(16).padStart(4,'0');});};
  // Only the configured Pages origin can receive the response. No cookies or URL credentials are used.
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+escape(result)+','+escape(origin||'https://invalid.invalid')+');</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function apiError_(code,message){var e=new Error(message);e.code=code;return e;}
function locked_(fn){var lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw apiError_('BUSY','別の保存処理が進行中です。少し待って再試行してください。');try{return fn();}finally{lock.releaseLock();}}
function props_(){return PropertiesService.getScriptProperties();}
function propertyJson_(key,fallback){var value=props_().getProperty(key);return value?JSON.parse(value):fallback;}
function bytes_(s){return Uint8Array.from(Utilities.newBlob(s).getBytes().map(function(n){return n&255;}));}
function sha_(s){return AuthCrypto.bytesToHex(AuthCrypto.sha256(bytes_(s)));}
function equal_(a,b){if(typeof a!=='string'||typeof b!=='string')return false;var mismatch=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++)mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return mismatch===0;}
function sessions_(){var now=Date.now(),sessions=propertyJson_('SESSIONS',{});Object.keys(sessions).forEach(function(key){if(now-sessions[key].lastSeen>=SWIM_IDLE_MS_)delete sessions[key];});return sessions;}
function authorize_(token,touch){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw apiError_('AUTH_REQUIRED','ログインしてください。');
  var sessions=sessions_(),key=sha_(token),session=sessions[key];
  if(!session)throw apiError_('AUTH_REQUIRED','10分間操作がなかったか、ログインの有効期限が切れました。再ログインしてください。');
  if(touch){session.lastSeen=Date.now();props_().setProperty('SESSIONS',JSON.stringify(sessions));}
  return {key:key,session:session,sessions:sessions};
}
function login_(request){
  var account=propertyJson_('ACCOUNT',null);
  if(!account||!props_().getProperty('DB_SPREADSHEET_ID'))throw apiError_('NOT_CONFIGURED','管理者による初期設定が必要です。');
  if(typeof request.username!=='string'||request.username.length>100||typeof request.password!=='string'||request.password.length>256)throw apiError_('INVALID_LOGIN','IDまたはパスワードが違います。');
  // Reserve an attempt before the expensive KDF, so concurrent requests cannot bypass throttling.
  locked_(function(){var now=Date.now(),attempt=propertyJson_('LOGIN_ATTEMPTS',{count:0,until:0});if(attempt.until<=now)attempt={count:0,until:now+15*60*1000};if(attempt.count>=5)throw apiError_('RATE_LIMIT','ログイン試行が続いています。15分ほど待ってから再試行してください。');attempt.count++;props_().setProperty('LOGIN_ATTEMPTS',JSON.stringify(attempt));});
  var actual=AuthCrypto.bytesToHex(AuthCrypto.pbkdf2(AuthCrypto.sha256,bytes_(request.password),AuthCrypto.hexToBytes(account.salt),{c:account.iterations,dkLen:32}));
  if(!equal_(actual,account.hash)||!equal_(request.username,account.username))throw apiError_('INVALID_LOGIN','IDまたはパスワードが違います。');
  return locked_(function(){
    var sessions=sessions_(),keys=Object.keys(sessions);if(keys.length>=40){keys.sort(function(a,b){return sessions[a].lastSeen-sessions[b].lastSeen;});delete sessions[keys[0]];}
    var secret=props_().getProperty('TOKEN_SECRET');
    var token=Utilities.computeHmacSha256Signature(Utilities.getUuid()+Utilities.getUuid()+Date.now(),secret).map(function(n){return (n&255).toString(16).padStart(2,'0');}).join('');
    sessions[sha_(token)]={username:account.username,lastSeen:Date.now()};
    props_().setProperties({SESSIONS:JSON.stringify(sessions),LOGIN_ATTEMPTS:JSON.stringify({count:0,until:0})});
    var snapshot=readSnapshot_();return {token:token,username:account.username,revision:snapshot.revision,state:snapshot.state,idleMs:SWIM_IDLE_MS_};
  });
}
function handleApi_(request){
  if(request.action==='login')return login_(request);
  return locked_(function(){
    var auth=authorize_(request.token,true);
    if(request.action==='logout'){delete auth.sessions[auth.key];props_().setProperty('SESSIONS',JSON.stringify(auth.sessions));return {loggedOut:true};}
    if(request.action==='ping')return {idleMs:SWIM_IDLE_MS_};
    if(request.action==='load')return readSnapshot_();
    if(request.action==='save')return saveSnapshot_(request);
    throw apiError_('BAD_REQUEST','対応していない操作です。');
  });
}
function encodeState_(state){
  var rows=[['種類','ID','分割番号','内容（アプリ管理用JSON）']];
  function append(type,id,value){var json=JSON.stringify(value);for(var i=0;i<json.length;i+=35000)rows.push([type,'id:'+id,String(i/35000),'json:'+json.slice(i,i+35000)]);}
  append('設定','settings',{format:state.format,version:state.version,dataRevision:state.dataRevision,testDate:state.testDate,classes:state.classes});
  state.pupils.forEach(function(p){append('子ども',p.id,p);});
  state.menuCards.forEach(function(c){append('練習カード',c.id,c);});
  state.lessons.forEach(function(l){append('レッスン',l.id,l);});
  return rows;
}
function decodeRows_(rows){
  var records={},ordered=[];
  rows.slice(1).forEach(function(row){var key=JSON.stringify([row[0],row[1]]);if(!Object.prototype.hasOwnProperty.call(records,key)){records[key]={type:row[0],chunks:[]};ordered.push(key);}var n=Number(row[2]);if(!Number.isInteger(n)||n<0||records[key].chunks[n]!==undefined||!String(row[3]).startsWith('json:'))throw new Error('Invalid database chunk');records[key].chunks[n]=String(row[3]).slice(5);});
  var state={pupils:[],menuCards:[],lessons:[]};
  ordered.forEach(function(key){var record=records[key];for(var n=0;n<record.chunks.length;n++)if(record.chunks[n]===undefined)throw new Error('Missing database chunk');var data=JSON.parse(record.chunks.join(''));if(record.type==='設定')Object.assign(state,data);else if(record.type==='子ども')state.pupils.push(data);else if(record.type==='練習カード')state.menuCards.push(data);else if(record.type==='レッスン')state.lessons.push(data);else throw new Error('Unknown record');});
  return SwimCore.validateBackup(state);
}
function readSnapshot_(){
  var meta=propertyJson_('DB_META',null);if(!meta)throw apiError_('NOT_CONFIGURED','初期設定が完了していません。');
  var sheet=SpreadsheetApp.openById(props_().getProperty('DB_SPREADSHEET_ID')).getSheetByName(meta.sheet);
  var state=decodeRows_(sheet.getRange(1,1,meta.rows,4).getDisplayValues());
  if(sha_(JSON.stringify(state))!==meta.hash)throw apiError_('DB_CHANGED','保存先のデータがアプリ外で変更されています。管理者に確認してください。');
  return {state:state,revision:meta.revision};
}
function saveSnapshot_(request){
  if(!Number.isInteger(request.expectedRevision)||!/^[-a-zA-Z0-9]{10,80}$/.test(request.mutationId||''))throw apiError_('BAD_REQUEST','保存情報を確認してください。');
  var state;try{state=SwimCore.validateBackup(request.state);}catch(e){throw apiError_('VALIDATION',e.message);}
  var json=JSON.stringify(state);if(json.length>8000000)throw apiError_('VALIDATION','データが大きすぎます。管理者に確認してください。');
  var meta=propertyJson_('DB_META',null),hash=sha_(json);
  if(meta&&meta.mutationId===request.mutationId){if(meta.hash!==hash)throw apiError_('BAD_REQUEST','再試行の内容が一致しません。');return {revision:meta.revision};}
  if(!meta||request.expectedRevision!==meta.revision)throw apiError_('CONFLICT','別のPCでデータが更新されています。');
  // Validate the active snapshot before writing. A failed inactive-buffer write never changes DB_META.
  readSnapshot_();
  var target=meta.sheet==='DB_A'?'DB_B':'DB_A';
  writeSnapshot_(state,{sheet:target,revision:meta.revision+1,mutationId:request.mutationId,hash:hash});
  return {revision:meta.revision+1};
}
function writeSnapshot_(state,meta){
  var db=SpreadsheetApp.openById(props_().getProperty('DB_SPREADSHEET_ID')),sheet=db.getSheetByName(meta.sheet)||db.insertSheet(meta.sheet),rows=encodeState_(state);
  if(sheet.getMaxRows()<rows.length)sheet.insertRowsAfter(sheet.getMaxRows(),rows.length-sheet.getMaxRows());
  sheet.clearContents();sheet.getRange(1,1,rows.length,4).setNumberFormat('@').setValues(rows);sheet.setFrozenRows(1);SpreadsheetApp.flush();
  var verified=decodeRows_(sheet.getRange(1,1,rows.length,4).getDisplayValues());if(sha_(JSON.stringify(verified))!==meta.hash)throw new Error('Database verification failed');
  props_().setProperty('DB_META',JSON.stringify({sheet:meta.sheet,rows:rows.length,revision:meta.revision,hash:meta.hash,mutationId:meta.mutationId}));
}
// Run this function manually in the Apps Script editor, after adding private InitialAccount.gs.
function setupSwimNote_(){return locked_(function(){
  if(props_().getProperty('DB_META'))throw new Error('初期設定済みです。既存データは変更していません。');
  if(typeof initialAccount_!=='function')throw new Error('非公開のInitialAccount.gsを追加してください。');
  var seed=initialAccount_();
  if(!seed.username||seed.iterations<600000||!/^[a-f0-9]{64}$/.test(seed.hash)||!/^[a-f0-9]{32,}$/.test(seed.salt)||!/^[a-f0-9]{64}$/.test(seed.tokenSecret))throw new Error('初期アカウント設定が正しくありません。');
  var dbId=props_().getProperty('DB_SPREADSHEET_ID');if(!dbId)dbId=SpreadsheetApp.create('スイムノートDB').getId();
  props_().setProperties({DB_SPREADSHEET_ID:dbId,ALLOWED_ORIGIN:'https://ryu-mei-15.github.io',ACCOUNT:JSON.stringify({username:seed.username,salt:seed.salt,hash:seed.hash,iterations:seed.iterations}),TOKEN_SECRET:seed.tokenSecret,SESSIONS:'{}',LOGIN_ATTEMPTS:'{"count":0,"until":0}'});
  var state=SwimCore.validateBackup({format:'swim-local',version:1,dataRevision:2,testDate:'',classes:[],pupils:[],menuCards:SwimMenus.seedCards(),lessons:[]});
  writeSnapshot_(state,{sheet:'DB_A',revision:0,mutationId:'initial-setup',hash:sha_(JSON.stringify(state))});
  console.log('データベースを作成しました: https://docs.google.com/spreadsheets/d/'+dbId+'/edit');
  return {spreadsheetId:dbId};
});}
