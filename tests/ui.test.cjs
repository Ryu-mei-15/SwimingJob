const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom');const C=require('../src/core.js'),M=require('../src/menus.js');const root=path.resolve(__dirname,'..');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://ryu-mei-15.github.io/SwimingJob/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;let now=Date.parse('2026-11-14T07:00:00Z'),state=C.validateBackup({...JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/roster.json'),'utf8')),menuCards:M.seedCards(),lessons:[],testDate:'2026-11-14'}),revision=0,lastMutation='',failSave=false;
  const timers=[],calls=[];Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.Date.now=()=>now;w.setInterval=fn=>{timers.push(fn);return timers.length;};w.confirm=()=>true;w.print=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  for(const name of ['menus.js','core.js','cloud.js','practice.js'])w.eval(fs.readFileSync(path.join(root,'src',name),'utf8'));
  w.SwimCloud.post=async(config,p)=>{calls.push(structuredClone(p));if(p.action==='login')return {token:'a'.repeat(64),username:'test-user',state:structuredClone(state),revision};if(p.action==='save'){if(p.mutationId!==lastMutation){assert.equal(p.expectedRevision,revision);state=C.validateBackup(p.state);revision++;lastMutation=p.mutationId;}if(failSave){failSave=false;throw Object.assign(Error('通信失敗'),{code:'NETWORK'});}return {revision};}if(p.action==='load')return {state:structuredClone(state),revision};return {};};
  w.eval(fs.readFileSync(path.join(root,'src/app.js'),'utf8'));await tick();
  const $=id=>w.document.getElementById(id),click=async selector=>{w.document.querySelector(selector).click();await tick();await tick();},fill=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));},submit=async id=>{$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();};
  async function login(){fill('login-id','test-user');fill('login-password','test-password');await submit('login-form');}
  return {dom,w,$,click,fill,submit,login,calls,timers,advance:ms=>{now+=ms;},snapshot:()=>state,failNextSave:()=>{failSave=true;}};
}
test('login gate hides all pupils, login reveals print school year and birthday, idle logout clears names',async()=>{
  const h=await harness();try{
    assert.equal(h.$('auth-screen').hidden,false);assert.equal(h.w.document.querySelector('.app-shell').hidden,true);assert.equal(h.$('roster-body').children.length,0);
    await h.login();assert.equal(h.$('auth-screen').hidden,true);assert.equal(h.$('roster-body').children.length,28);
    assert.match(h.$('roster-body').textContent,/生年月日 2013\/05\/10/);assert.match(h.$('roster-body').textContent,/中学1年/);
    const name=h.snapshot().pupils[0].name;await h.click('[data-edit-id="D5-2"]');assert.equal(h.$('pupil-name').value,name);
    h.advance(600000);await h.timers[0]();await tick();assert.equal(h.$('auth-screen').hidden,false);assert.equal(h.$('roster-body').children.length,0);assert.equal(h.$('pupil-name').value,'');assert.equal(h.w.document.body.textContent.includes(name),false);assert.match(h.$('login-message').textContent,/10分間/);assert.equal(h.w.localStorage.length,0);assert.equal(h.w.sessionStorage.length,0);
  }finally{h.dom.window.close();}
});
test('menu builder previews time slots, prevents over-budget saves, saves cards and independent lessons',async()=>{
  const h=await harness();try{await h.login();await h.click('[data-view="practice"]');assert.equal(h.$('menu-library').children.length,6);
    for(const card of M.seedCards())await h.click('[data-add-menu="'+card.id+'"]');assert.equal(h.$('lesson-used').textContent,'50分');assert.equal(h.$('lesson-remaining').textContent,'残り 10分');
    h.fill('lesson-minutes','40');await h.click('#save-lesson');assert.equal(h.snapshot().lessons.length,0);assert.match(h.$('toast').textContent,/超え/);
    h.fill('lesson-minutes','60');h.fill('lesson-title','J2 練習');h.fill('lesson-date','2026-11-14');h.fill('lesson-group','J2');await h.click('#preview-lesson');assert.match(h.$('lesson-preview-content').textContent,/16:50/);assert.match(h.$('lesson-preview-content').textContent,/550m/);
    await h.click('[data-close="lesson-preview-dialog"]');await h.click('#save-lesson');assert.equal(h.snapshot().lessons.length,1);assert.equal(h.snapshot().lessons[0].items.length,6);
    await h.click('[data-edit-menu="sample-warmup"]');h.fill('card-title','変更後の練習');await h.submit('menu-card-form');assert.equal(h.snapshot().menuCards[0].title,'変更後の練習');assert.equal(h.snapshot().lessons[0].items[0].title,'ウォーミングアップ');
    await h.click('#logout-button');assert.equal(h.$('lesson-items').textContent.includes('ウォーミングアップ'),false);assert.equal(h.$('lesson-preview-content').textContent,'');
  }finally{h.dom.window.close();}
});
test('uncertain save retains its mutation ID and only updates the visible roster after confirmed retry',async()=>{
  const h=await harness();try{await h.login();const before=h.snapshot().pupils.find(p=>p.id==='D5-2').grade;h.failNextSave();await h.click('[data-pass-id="D5-2"]');assert.equal(h.$('sync-actions').hidden,false);assert.equal(h.w.document.querySelector('[data-grade-id="D5-2"]').value,before);await h.click('#retry-save');assert.equal(h.$('sync-actions').hidden,true);assert.equal(h.w.document.querySelector('[data-grade-id="D5-2"]').value,C.nextGrade(before));const saves=h.calls.filter(p=>p.action==='save');assert.equal(saves.length,2);assert.equal(saves[0].mutationId,saves[1].mutationId);
  }finally{h.dom.window.close();}
});
test('activity refreshes a session; closing a tab clears the login state',async()=>{
  const h=await harness();try{await h.login();h.advance(61000);h.w.document.dispatchEvent(new h.w.Event('keydown'));await h.timers[0]();assert.ok(h.calls.some(p=>p.action==='ping'));h.w.dispatchEvent(new h.w.Event('pagehide'));await tick();assert.equal(h.$('auth-screen').hidden,false);assert.equal(h.$('roster-body').children.length,0);}
  finally{h.dom.window.close();}
});
