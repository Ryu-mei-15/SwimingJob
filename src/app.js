(function () {
  'use strict';
  const C = SwimCore;
  const rules = JSON.parse(document.getElementById('rule-data').textContent);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const today = () => {const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const historyContext = (date = today()) => ({date, at:new Date().toISOString()});
  if(window.top!==window.self){$('login-form').hidden=true;$('login-message').textContent='このページを新しいタブで直接開いてください。';return;}
  let state = C.validateBackup({format:'swim-local',version:1,dataRevision:2,testDate:today(),classes:[],pupils:[]});
  let practice=null;
  let selectedClass = '', onlyReview = false, search = '', archiveSearch = '', editing = null, lifecycleAction = '', pendingImport = null, recordingId = null, undo = null, toastTimer;

  const config=JSON.parse(document.getElementById('cloud-config').textContent);
  let token=null, revision=0, busy=false, epoch=0, pendingWrite=null, lastActivity=0, lastPing=0;
  const emptyState=()=>C.validateBackup({format:'swim-local',version:1,dataRevision:2,testDate:today(),classes:[],pupils:[]});
  function storageAlert(message) {$('storage-alert').textContent=message;$('storage-alert').hidden=!message;}
  function toast(message) {clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},4000);}
  function request(action,data={},session=token){return SwimCloud.post(config,{action,token:session,...data});}
  function setBusy(value){busy=value;$('busy-panel').hidden=!value;document.querySelector('.app-shell').inert=value;document.querySelector('.app-header').inert=value;document.querySelectorAll('dialog[open] button').forEach(el=>{if(value){el.dataset.wasDisabled=String(el.disabled);el.disabled=true;}else if(el.dataset.wasDisabled!==undefined){el.disabled=el.dataset.wasDisabled==='true';delete el.dataset.wasDisabled;}});}
  function lock(message='ログインしてください。'){
    const previous=token;token=null;epoch++;pendingWrite=null;revision=0;lastActivity=0;editing=null;pendingImport=null;recordingId=null;undo=null;
    state=emptyState();selectedClass='';search='';archiveSearch='';onlyReview=false;
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    document.querySelectorAll('form').forEach(f=>f.reset());
    ['history-list','source-detail','pupil-preview','test-context','test-recent','test-pupil-name','undo-text','toast','signed-in-user','class-list','import-description','import-groups','import-impact'].forEach(id=>{$(id).textContent='';});
    document.querySelectorAll('input[type=search]').forEach(i=>{i.value='';});
    if(practice)practice.clear();render();view('roster');setBusy(false);storageAlert('');$('sync-actions').hidden=true;$('toast').hidden=true;
    $('auth-screen').hidden=false;document.querySelector('.app-header').hidden=true;document.querySelector('.app-shell').hidden=true;
    $('login-message').textContent=message;$('login-password').value='';$('login-button').disabled=false;
    if(previous)request('logout',{},previous).catch(()=>{});
  }
  function sessionFailure(error){if(error.code==='AUTH_REQUIRED'){lock('ログインの有効期限が切れました。再ログインしてください。');return true;}return false;}
  async function commit(next) {
    if(!token||busy||pendingWrite){toast(pendingWrite?'未確定の保存を先に再試行するか、最新のデータを取得してください。':'保存処理の完了を待ってください。');return false;}
    pendingWrite={state:C.validateBackup(next),expectedRevision:revision,mutationId:crypto.randomUUID()};
    return savePending();
  }
  async function savePending(){
    if(!pendingWrite||!token||busy)return false;
    const ticket=epoch,change=pendingWrite;setBusy(true);storageAlert('');
    try{
      const result=await request('save',change);
      if(ticket!==epoch||!token)return false;
      revision=result.revision;state=change.state;pendingWrite=null;$('sync-actions').hidden=true;render();return true;
    }catch(error){
      if(ticket!==epoch||sessionFailure(error))return false;
      storageAlert(error.code==='CONFLICT'?'別のPCで更新されています。未確定の変更はバックアップで保存できます。「最新を取得」で最新の名簿に切り替えてください。':error.message+' 未確定の変更は「保存を再試行」できます。');
      $('sync-actions').hidden=false;return false;
    }finally{if(ticket===epoch)setBusy(false);}
  }
  $('retry-save').addEventListener('click',async()=>{if(await savePending()){document.querySelectorAll('dialog[open]').forEach(d=>d.close());if(practice)practice.resetDraft();toast('未確定の変更を保存しました。');}});
  $('refresh-data').addEventListener('click',async()=>{
    if(!token||busy)return;
    if(pendingWrite&&!confirm('未確定の変更を破棄して、Google側の最新データに切り替えますか？ 必要なら先にバックアップを保存してください。'))return;
    const ticket=epoch;setBusy(true);
    try{const data=await request('load');if(ticket!==epoch)return;state=C.validateBackup(data.state);revision=data.revision;pendingWrite=null;undo=null;editing=null;document.querySelectorAll('dialog[open]').forEach(d=>d.close());if(practice)practice.resetDraft();storageAlert('');$('sync-actions').hidden=true;render();toast('最新のデータに更新しました。');}
    catch(error){if(ticket===epoch&&!sessionFailure(error))storageAlert(error.message);}
    finally{if(ticket===epoch)setBusy(false);}
  });
  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();if($('login-button').disabled)return;
    $('login-button').disabled=true;$('login-message').textContent='ログインを確認しています…';const ticket=++epoch;
    const username=$('login-id').value.trim(),password=$('login-password').value;
    try{const result=await request('login',{username,password},null);if(ticket!==epoch)return;
      state=C.validateBackup(result.state);if(!state.testDate)state.testDate=today();token=result.token;revision=result.revision;lastActivity=Date.now();lastPing=Date.now();
      $('login-password').value='';$('auth-screen').hidden=true;document.querySelector('.app-header').hidden=false;document.querySelector('.app-shell').hidden=false;
      $('signed-in-user').textContent=result.username;if(practice)practice.resetDraft();render();view('roster');
    }catch(error){if(ticket===epoch){$('login-message').textContent=error.message;$('login-password').value='';}}
    finally{if(ticket===epoch)$('login-button').disabled=false;}
  });
  $('logout-button').addEventListener('click', async ()=>lock('ログアウトしました。'));
  const IDLE_MS=10*60*1000;
  function activity(){if(!token)return;if(Date.now()-lastActivity>=IDLE_MS){lock('10分間操作がなかったため、ログアウトしました。');return;}lastActivity=Date.now();}
  ['pointerdown','pointermove','keydown','wheel','touchstart'].forEach(type=>document.addEventListener(type,activity,{passive:true}));
  async function checkSession(){
    if(!token)return;
    if(Date.now()-lastActivity>=IDLE_MS){lock('10分間操作がなかったため、ログアウトしました。');return;}
    if(lastActivity>lastPing&&Date.now()-lastPing>=60000&&!busy){const ticket=epoch;lastPing=Date.now();try{await request('ping');}catch(error){if(ticket===epoch)sessionFailure(error);}}
  }
  setInterval(checkSession,15000);document.addEventListener('visibilitychange', async ()=>{if(!document.hidden)checkSession();});
  window.addEventListener('pagehide', async ()=>lock('ログインしてください。'));
  const gradeLabel = C.gradeLabel;
  function gradeOptions(value) {
    return '<option value="">選択</option>' + C.GRADES.map(g => `<option value="${g}"${g === value ? ' selected' : ''}>${gradeLabel(g)}</option>`).join('');
  }
  function issues(p) {const result = C.calculate(p, state.testDate, rules); return p.review || (result.status && result.status !== 'タイム規定なし');}
  function groups() {return [...state.classes].sort((a,b) => a.localeCompare(b,'ja',{numeric:true}));}
  function activePupils() {return state.pupils.filter(p => p.status !== 'withdrawn');}
  function normalize(value) {return value.normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s　]/g,'').replace(/[ぁ-ゖ]/g,c => String.fromCharCode(c.charCodeAt(0) + 0x60));}
  function visiblePupils() {
    const q = normalize(search);
    return C.sortPupils(activePupils().filter(p => (!selectedClass || p.group === selectedClass) && (!onlyReview || issues(p)) && (!q || normalize(p.name + p.group).includes(q))));
  }
  function render() {
    const allGroups = groups();
    if (selectedClass && !allGroups.includes(selectedClass)) selectedClass = '';
    $('test-date').value = state.testDate;
    const active = activePupils();
    $('total-count').innerHTML = `${active.length}<small>人</small>`;
    $('class-count').innerHTML = `${allGroups.length}<small>クラス</small>`;
    const issueCount = active.filter(issues).length;
    $('review-count').innerHTML = `${issueCount}<small>人</small>`;
    $('review-filter').classList.toggle('has-issues', Boolean(issueCount));
    $('review-filter').setAttribute('aria-pressed', String(onlyReview));
    $('class-tabs').innerHTML = [{name:'', label:'すべて', count:active.length}, ...allGroups.map(g => ({name:g,label:g,count:active.filter(p => p.group === g).length}))].map(g => `<button class="class-tab ${g.name === selectedClass ? 'active' : ''}" data-class="${esc(g.name)}" aria-pressed="${g.name === selectedClass}"><span>${esc(g.label)}</span><small>${g.count}<span>人</span></small></button>`).join('');
    $('group-options').innerHTML = allGroups.map(g => `<option value="${esc(g)}"></option>`).join('');
    renderTable();
    renderArchive();
    $('save-status').textContent=pendingWrite?'保存を完了していません':token?'Googleスプレッドシートに保存済み':'ログインが必要です';
    if(practice)practice.renderLibrary();
    $('undo-panel').hidden = !undo;
    if (undo) $('undo-text').textContent = undo.type === 'grade' ? `${undo.name} さんを${gradeLabel(undo.to)}合格にしました。` : `${undo.name} さんを退会として保管しました。`;
  }
  function renderTable() {
    const visible = visiblePupils();
    $('table-description').textContent = `${state.testDate.replaceAll('-', '/')} テスト  ·  ${selectedClass || '全クラス'}  ·  ${visible.length}人`;
    $('list-heading').textContent = selectedClass ? `${selectedClass} のテスト名簿` : 'すべてのテスト名簿';
    $('list-count').textContent = `${visible.length}人`;
    $('hundred-count').textContent = visible.filter(p => C.calculate(p, state.testDate, rules).distance === 100).length;
    $('empty-state').hidden = activePupils().length > 0;
    $('empty-heading').textContent = state.pupils.length ? '在籍中の子どもがいません' : '最初の名簿を登録しましょう';
    $('empty-copy').textContent = state.pupils.length ? '退会した子の情報と履歴は「退会した子」で確認できます。再入会もそこから手続きできます。' : '以前のアプリのバックアップJSONを開くか、子どもを追加してください。';
    $('table-container').hidden = !visible.length;
    $('no-results').hidden = activePupils().length === 0 || visible.length > 0;
    $('filter-notice').hidden = !onlyReview;
    $('filter-notice').textContent = '要確認の子どもだけを表示しています。上の「要確認」をもう一度押すと解除できます。';
    $('csv-button').disabled = $('print-button').disabled = !visible.length;
    $('roster-body').innerHTML = visible.map(p => {
      const r = C.calculate(p, state.testDate, rules);
      const measured = C.latestTest(p,state.testDate,r.next);
      const code = r.stroke === 'Fly/Back' ? 'BFBK' : r.stroke === 'Breast/Free' ? 'BRFR' : r.stroke;
      return `<tr class="${r.distance === 100 ? 'distance-100' : ''}"><td><span class="name-cell">${esc(p.name)}</span><span class="subtext">${esc(r.school)}</span><span class="birth-print print-only">生年月日 ${esc(p.birthDate.replaceAll('-','/'))}</span></td><td><span class="class-tag">${esc(p.group)}</span></td><td class="sex-cell">${p.sex === 'male' ? '男' : p.sex === 'female' ? '女' : '未登録'}</td><td class="age-cell">${r.age ?? '—'}<small>歳</small></td><td class="grade-cell"><select class="grade-select" data-grade-id="${esc(p.id)}" aria-label="${esc(p.name)}の合格級">${gradeOptions(p.grade)}</select><span class="grade-print print-only">${gradeLabel(p.grade)}</span></td><td class="next-grade"><span class="grade-arrow" aria-hidden="true">→</span><span>${r.next ? gradeLabel(r.next) : '—'}</span></td><td>${r.stroke ? `<span class="stroke-tag ${['BF','BK','BR','FR','IM'].includes(r.stroke) ? r.stroke : ''}">${esc(code)}</span><span class="stroke-name">${esc(C.STROKES[r.stroke])}</span>` : '—'}</td><td><span class="distance-badge ${r.distance === 100 ? 'hundred-badge' : ''}">${r.distance === 100 ? '<span class="distance-star" aria-hidden="true">★</span> ' : ''}${r.distance ? r.distance + '<small>m</small>' : '—'}</span></td><td class="time-cell"><span class="time ${p.review ? 'warning' : ''}">${C.formatTime(r.seconds)}</span>${r.status ? `<span class="status-note">${esc(r.status)}</span>` : ''}${measured ? `<span class="measured-inline">実測 ${C.formatMeasuredTime(measured.test.seconds)}</span>` : ''}${p.review ? `<button class="flag" data-edit-id="${esc(p.id)}">元表を確認・計算値は参考</button>` : ''}</td><td class="no-print"><div class="row-actions"><button class="pass-button" data-pass-id="${esc(p.id)}" aria-label="${esc(p.name)}を${r.next ? gradeLabel(r.next) : '次の級'}合格にする" ${r.next ? '' : 'disabled'}>✓ 合格</button><button class="record-button" data-record-id="${esc(p.id)}" aria-label="${esc(p.name)}のタイムを記録">タイム</button><button class="edit-button" data-edit-id="${esc(p.id)}" aria-label="${esc(p.name)}を編集">編集</button></div></td><td class="print-only result-cell"></td></tr>`;
    }).join('');
  }
  function view(name) {
    if(name==='practice'&&practice)practice.render();
    document.querySelectorAll('.view').forEach(el => {el.hidden = el.id !== `view-${name}`;});
    document.querySelectorAll('[data-view]').forEach(el => {el.classList.toggle('active', el.dataset.view === name); el.setAttribute('aria-current', el.dataset.view === name ? 'page' : 'false');});
  }
  function renderArchive() {
    const archived = state.pupils.filter(p => p.status === 'withdrawn');
    $('archive-count').textContent = archived.length;
    const q = normalize(archiveSearch);
    const visible = C.sortPupils(archived.filter(p => !q || normalize(p.name + p.group).includes(q)));
    $('archive-summary').textContent = `${archived.length}人の記録を保管中。再入会しても以前の合格級と履歴を引き継ぎます。`;
    $('archive-empty').hidden = visible.length > 0;
    $('archive-table').hidden = visible.length === 0;
    $('archive-body').innerHTML = visible.map(p => {
      const event = [...p.history].reverse().find(h => h.type === 'withdrawn');
      return `<tr><td><span class="name-cell">${esc(p.name)}</span><span class="subtext">退会済み</span></td><td><span class="class-tag">${esc(p.group)}</span></td><td>${gradeLabel(p.grade)}</td><td>${esc(event?.date || '記録なし')}</td><td class="archive-note">${esc(event?.note || '—')}</td><td><button class="button secondary" data-archive-id="${esc(p.id)}">記録・再入会</button></td></tr>`;
    }).join('');
  }
  $('archive-search').addEventListener('input', async ()=> {archiveSearch = $('archive-search').value; renderArchive();});
  $('archive-body').addEventListener('click', async e=> {const button = e.target.closest('[data-archive-id]'); if (button) openPupil(button.dataset.archiveId);});
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', async ()=> view(button.dataset.view)));
  document.querySelector('.brand').addEventListener('click', async e=> {e.preventDefault(); view('roster');});
  $('test-date').addEventListener('change', async ()=> {
    if (!C.dateParts($('test-date').value)) {$('test-date').value = state.testDate; toast('有効なテスト日を入力してください。'); return;}
    if (!await commit({...state, testDate:$('test-date').value})) $('test-date').value = state.testDate;
  });
  $('class-tabs').addEventListener('click', async e=> {const button=e.target.closest('[data-class]'); if (button) {selectedClass=button.dataset.class; render();}});
  $('review-filter').addEventListener('click', async ()=> {onlyReview = !onlyReview; render();});
  $('search').addEventListener('input', async ()=> {search = $('search').value; renderTable();});
  $('clear-filters').addEventListener('click', async ()=> {selectedClass=''; search=''; onlyReview=false; $('search').value=''; render();});
  $('roster-body').addEventListener('change', async e=> {
    const select=e.target.closest('[data-grade-id]'); if (!select) return;
    const id=select.dataset.gradeId;
    const pupil=state.pupils.find(p => p.id===id);
    if (!pupil) return;
    try {
    const changed = C.recordPupil({...pupil,grade:select.value}, {...historyContext(),type:'grade_changed',from:pupil.grade,to:select.value});
    if (await commit({...state, pupils:state.pupils.map(p => p.id===id ? changed : p)})) {
      toast(`${pupil.name} さんの合格級を更新しました。`);
      [...document.querySelectorAll('[data-grade-id]')].find(el => el.dataset.gradeId===id)?.focus();
    } else renderTable();
    } catch(error) {toast(error.message); renderTable();}
  });
  $('roster-body').addEventListener('click', async e=> {
    const editButton = e.target.closest('[data-edit-id]');
    if (editButton) {openPupil(editButton.dataset.editId); return;}
    const recordButton = e.target.closest('[data-record-id]');
    if (recordButton) {openTestRecord(recordButton.dataset.recordId); return;}
    const passButton = e.target.closest('[data-pass-id]');
    if (!passButton) return;
    const pupil = state.pupils.find(p => p.id === passButton.dataset.passId);
    if (!pupil || !C.nextGrade(pupil.grade)) return;
    try {
    const tested = C.calculate(pupil,state.testDate,rules);
    const promoted = C.promotePupil(pupil, {...historyContext(state.testDate),detail:`${C.STROKES[tested.stroke] || '種目未登録'} ${tested.distance || '—'}m / ${tested.seconds === null ? tested.status : '規定 '+C.formatTime(tested.seconds)} / 当日 ${tested.age ?? '—'}歳`});
    if (await commit({...state, pupils: state.pupils.map(p => p.id === pupil.id ? promoted : p)})) {
      undo = {type:'grade', id:pupil.id, name:pupil.name, from:pupil.grade, to:promoted.grade, date:state.testDate};
      render();
      toast(`${pupil.name} さん：${gradeLabel(promoted.grade)}合格。次回のテストを更新しました。`);
    }
    } catch(error) {toast(error.message);}
  });
  function openTestRecord(id) {
    const pupil = state.pupils.find(p=>p.id===id);
    if (!pupil || pupil.status === 'withdrawn') return;
    recordingId=id;
    $('test-form').reset(); $('test-error').hidden=true;
    $('test-pupil-name').textContent=pupil.name+' さん';
    $('record-date').value=state.testDate;
    const next=C.nextGrade(pupil.grade);
    $('record-grade').innerHTML=C.GRADES.slice(1).map(g=>`<option value="${g}"${g===(next || pupil.grade)?' selected':''}>${gradeLabel(g)}</option>`).join('');
    updateTestContext(); $('test-dialog').showModal(); $('record-time').focus();
  }
  function updateTestContext() {
    const pupil=state.pupils.find(p=>p.id===recordingId); if(!pupil) return;
    const grade=$('record-grade').value, date=$('record-date').value;
    const index=C.GRADES.indexOf(grade);
    const r=C.calculate({...pupil,grade:C.GRADES[index-1]},date,rules);
    $('test-context').innerHTML=`<strong>${esc(C.STROKES[r.stroke] || '日付・受験級を確認')}${r.distance ? ' '+r.distance+'m' : ''}</strong>${r.age ?? '—'}歳 · 規定 ${r.seconds===null ? esc(r.status || '—') : C.formatTime(r.seconds)}`;
    const canPass=C.nextGrade(pupil.grade)===grade;
    $('record-pass').disabled=!canPass;
    if(!canPass) $('record-pass').checked=false;
    $('save-test').textContent=$('record-pass').checked?'記録して合格にする':'タイムを保存する';
    $('record-pass-label').textContent=`この記録で${gradeLabel(grade)}合格にする`;
    $('record-pass-hint').textContent=canPass?'チェックしなければ、タイムだけを保存します。':'現在の合格級のひとつ先を選ぶと、合格も同時に記録できます。';
    const recent=[...pupil.history].reverse().filter(h=>h.type==='test_recorded' && h.test.grade===grade).slice(0,3);
    $('test-recent').textContent=recent.length?'この受験級の最近の記録\n'+recent.map(h=>`${h.date}　${C.formatMeasuredTime(h.test.seconds)}${h.note ? '　'+h.note : ''}`).join('\n'):'';
  }
  ['record-date','record-grade'].forEach(id=>$(id).addEventListener('change',updateTestContext));
  $('record-pass').addEventListener('change', async ()=>{$('save-test').textContent=$('record-pass').checked?'記録して合格にする':'タイムを保存する';});
  $('test-form').addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      const pupil=state.pupils.find(p=>p.id===recordingId);
      if(!pupil) throw new Error('子どもの登録情報が見つかりません。');
      const pass=$('record-pass').checked,date=$('record-date').value;
      const changed=C.recordTest(pupil,$('record-grade').value,$('record-time').value,rules,{...historyContext(date),note:$('record-note').value.trim()},pass);
      if(await commit({...state,pupils:state.pupils.map(p=>p.id===pupil.id?changed:p)})) {
        if(pass) undo={type:'grade',id:pupil.id,name:pupil.name,from:pupil.grade,to:changed.grade,date};
        render(); $('test-dialog').close(); toast(pass?'実測タイムを保存し、合格を記録しました。':'実測タイムを保存しました。編集画面の履歴でも確認できます。');
      }
    } catch(error) {$('test-error').textContent=error.message; $('test-error').hidden=false;}
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', async ()=> $(button.dataset.close).close()));
  function openPupil(id) {
    editing = id ? state.pupils.find(p => p.id === id) : null;
    $('pupil-form').reset(); $('form-error').hidden = true; $('lifecycle-panel').hidden = true; $('profile-actions').hidden = false;
    $('pupil-dialog-title').textContent = editing ? '子どもの情報を編集' : '子どもを追加';
    $('pupil-id').value = editing?.id || '';
    $('pupil-name').value = editing?.name || '';
    $('pupil-birth').value = editing?.birthDate || '';
    $('pupil-sex').value = editing?.sex || '';
    $('pupil-group').value = editing?.group || selectedClass || '';
    $('pupil-grade').innerHTML = gradeOptions(editing?.grade || '');
    $('pupil-note').value = editing?.note || '';
    $('lifecycle-actions').hidden = !editing;
    $('transfer-button').hidden = $('withdraw-button').hidden = editing?.status === 'withdrawn';
    $('rejoin-button').hidden = editing?.status !== 'withdrawn';
    $('pupil-group').disabled = editing?.status === 'withdrawn';
    $('pupil-status').textContent = editing?.status === 'withdrawn' ? '退会済み・記録を保管中' : editing ? '在籍中' : '新規登録';
    $('history-section').hidden = !editing;
    renderHistory(editing);
    $('source-panel').hidden = !editing?.source;
    $('source-review-label').hidden = !editing?.review;
    $('source-reviewed').checked = false;
    if (editing?.source) {
      const s=editing.source;
      $('source-detail').textContent = `${s.file} / ${s.sheet} / ${s.row}行目\n所属級 ${gradeLabel(s.grade)} ・ ${s.stroke} ${s.distance}m ・ 規定タイム ${s.time || 'なし'}${editing.review ? '\n元表の所属級と種目が基準表に一致していません。正しい合格級を確認してください。' : '\n取り込み時点の記録です。現在の計算結果とは日付や級により異なります。'}${s.confirmation ? '\n' + s.confirmation : ''}`;
    }
    updatePreview(); $('pupil-dialog').showModal();
  }
  $('add-button').addEventListener('click', async ()=> openPupil());
  function renderClasses() {
    $('class-list').innerHTML = groups().map(group => {
      const count = activePupils().filter(p => p.group === group).length;
      return `<div class="class-manager-row"><input value="${esc(group)}" maxlength="50" aria-label="${esc(group)}のクラス名"><span>${count}人</span><button class="button secondary" data-rename-class="${esc(group)}">変更</button><button class="text-button danger-text" data-delete-class="${esc(group)}" ${count ? 'disabled title="在籍中の子どもを移動すると削除できます"' : ''}>削除</button></div>`;
    }).join('') || '<p class="small">まだクラスがありません。下の欄から追加できます。</p>';
  }
  $('manage-classes').addEventListener('click', async ()=> {
    $('class-error').hidden = true; $('class-name').value = ''; renderClasses(); $('class-dialog').showModal();
  });
  $('class-form').addEventListener('submit', async e=> {
    e.preventDefault();
    try {
      if (await commit(C.addClass(state, $('class-name').value))) {
        $('class-name').value = ''; $('class-error').hidden = true; renderClasses(); toast('クラスを追加しました。');
      }
    } catch (error) {$('class-error').textContent = error.message; $('class-error').hidden = false;}
  });
  $('class-list').addEventListener('click', async e=> {
    const rename = e.target.closest('[data-rename-class]'), remove = e.target.closest('[data-delete-class]');
    if (!rename && !remove) return;
    try {
      const oldName = rename?.dataset.renameClass || remove.dataset.deleteClass;
      const name = rename ? rename.closest('.class-manager-row').querySelector('input').value.trim() : '';
      const next = rename ? C.renameClass(state, oldName, name, historyContext()) : C.removeClass(state, oldName);
      const wasSelected = selectedClass === oldName;
      if (await commit(next)) {
        if (rename && wasSelected) selectedClass = name;
        undo = null; render(); renderClasses(); $('class-error').hidden = true;
        toast(rename ? 'クラス名を変更しました。' : '空のクラスを削除しました。');
      }
    } catch (error) {$('class-error').textContent = error.message; $('class-error').hidden = false;}
  });
  function formPupil() {
    return {...editing, id:editing?.id || (globalThis.crypto?.randomUUID?.() || `p-${Date.now()}-${Math.random().toString(36).slice(2)}`), name:$('pupil-name').value.trim(), birthDate:$('pupil-birth').value, sex:$('pupil-sex').value, group:$('pupil-group').value.trim(), grade:$('pupil-grade').value, note:$('pupil-note').value.trim(), source:editing?.source || null, status:editing?.status || 'active', history:editing?.history || [], review:Boolean(editing?.review && !$('source-reviewed').checked)};
  }
  function updatePreview() {
    $('pupil-preview').hidden = editing?.status === 'withdrawn';
    const p={birthDate:$('pupil-birth').value,sex:$('pupil-sex').value,grade:$('pupil-grade').value};
    if (!p.birthDate || !p.grade || !p.sex) {$('pupil-preview').textContent='生年月日・性別・合格級を入力すると、次回のテストが表示されます。'; return;}
    const r=C.calculate(p,state.testDate,rules);
    $('pupil-preview').innerHTML=`次回：${r.next ? gradeLabel(r.next) : '基準未登録'} / ${r.age ?? '—'}歳<strong>${esc(C.STROKES[r.stroke] || '種目未登録')}${r.distance ? ` ${r.distance}m` : ''}　${C.formatTime(r.seconds)}</strong>${esc(r.status)}`;
  }
  ['pupil-birth','pupil-sex','pupil-grade'].forEach(id => $(id).addEventListener('input', updatePreview));
  $('pupil-form').addEventListener('submit', async e=> {
    e.preventDefault();
    try {
      if (!$('lifecycle-panel').hidden) throw new Error('手続き欄の確定ボタンで移動・退会・再入会を完了してください。');
      let pupil=formPupil();
      if (!pupil.name || !pupil.group) throw new Error('氏名と所属クラスを入力してください。');
      if (pupil.birthDate > state.testDate) throw new Error('生年月日がテスト日より後です。日付を確認してください。');
      if (!editing) pupil = C.recordPupil(pupil, {...historyContext(),type:'registered',to:pupil.group,detail:`合格級 ${gradeLabel(pupil.grade)}`});
      else {
        if (editing.group !== pupil.group) pupil = C.transferPupil({...pupil,group:editing.group},pupil.group,historyContext());
        if (editing.grade !== pupil.grade) pupil = C.recordPupil(pupil,{...historyContext(),type:'grade_changed',from:editing.grade,to:pupil.grade});
        const fields = [['name','氏名'],['birthDate','生年月日'],['sex','性別'],['note','メモ'],['review','確認状態']].filter(([key])=>editing[key]!==pupil[key]).map(([,label])=>label);
        if (fields.length) pupil = C.recordPupil(pupil,{...historyContext(),type:'profile_updated',detail:fields.join('・')+'を更新'});
      }
      const pupils=editing ? state.pupils.map(p => p.id===editing.id ? pupil : p) : [...state.pupils,pupil];
      const next=C.validateBackup({...state,pupils});
      if (await commit(next)) {$('pupil-dialog').close(); toast(editing ? '情報を更新しました。' : '子どもを追加しました。');}
    } catch (error) {$('form-error').textContent=error.message; $('form-error').hidden=false;}
  });
  function renderHistory(pupil) {
    const labels={registered:'登録',passed:'合格',grade_changed:'合格級の修正',transferred:'クラス移動',class_renamed:'クラス名の変更',withdrawn:'退会',rejoined:'再入会',profile_updated:'登録情報の変更',pass_reverted:'合格の取り消し',withdraw_reverted:'退会の取り消し',test_recorded:'実測タイム'};
    $('history-list').innerHTML = pupil?.history?.length ? [...pupil.history].reverse().map(h => {
      const grades = ['passed','grade_changed','pass_reverted'].includes(h.type);
      const from = grades ? gradeLabel(h.from) : h.from, to = grades ? gradeLabel(h.to) : h.to;
      const change = from && to ? `${from} → ${to}` : from || to;
      const recorded = new Date(h.at).toLocaleString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      return `<li><div><strong>${labels[h.type]}</strong><time>${esc(h.date)}</time></div>${change ? `<p>${esc(change)}</p>` : ''}${h.test ? `<p class="history-time">${C.formatMeasuredTime(h.test.seconds)}</p><p>${gradeLabel(h.test.grade)} · ${esc(C.STROKES[h.test.stroke])} ${h.test.distance}m</p><p class="small">当日 ${h.test.age}歳 · 規定 ${C.formatTime(h.test.standardSeconds)}</p>` : ''}${h.detail ? `<p class="small">${esc(h.detail)}</p>` : ''}${h.note ? `<p class="history-note">${esc(h.note)}</p>` : ''}<small>記録日時 ${esc(recorded)}</small></li>`;
    }).join('') : '<li class="small">まだ操作履歴がありません。今後の合格・移動・退会などを記録します。</li>';
  }
  function openLifecycle(action) {
    if (!editing) return;
    const form = formPupil();
    if (['name','birthDate','sex','group','grade','note','review'].some(key=>form[key]!==editing[key])) {
      $('form-error').textContent='編集中の情報を先に「保存する」で確定してください。'; $('form-error').hidden=false; return;
    }
    lifecycleAction=action; $('form-error').hidden=true;
    $('lifecycle-title').textContent=action==='withdraw' ? `${editing.name} さんの退会` : action==='transfer' ? 'クラスを移動する' : '再入会する';
    $('lifecycle-description').textContent=action==='withdraw' ? '在籍名簿から外し、合格級・生年月日・履歴を保管します。' : action==='transfer' ? '合格級と履歴を引き継いで移動します。' : '以前の合格級と履歴を引き継いで在籍名簿へ戻します。';
    $('lifecycle-class-label').hidden=action==='withdraw';
    $('lifecycle-class').innerHTML='<option value="">クラスを選択</option>'+groups().filter(g=>action!=='transfer' || g!==editing.group).map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
    if(action==='rejoin' && groups().includes(editing.group)) $('lifecycle-class').value=editing.group;
    $('lifecycle-date').value=today(); $('lifecycle-date').max=today(); $('lifecycle-note').value='';
    $('lifecycle-confirm').textContent=action==='withdraw' ? '退会として保管する' : action==='transfer' ? '移動を確定する' : '再入会を確定する';
    $('lifecycle-panel').hidden=false; $('profile-actions').hidden=true; $('lifecycle-date').focus();
  }
  $('withdraw-button').addEventListener('click', async ()=>openLifecycle('withdraw'));
  $('transfer-button').addEventListener('click', async ()=>openLifecycle('transfer'));
  $('rejoin-button').addEventListener('click', async ()=>openLifecycle('rejoin'));
  $('lifecycle-cancel').addEventListener('click', async ()=>{$('lifecycle-panel').hidden=true; $('lifecycle-date').value=''; $('form-error').hidden=true; $('profile-actions').hidden=false;});
  $('lifecycle-confirm').addEventListener('click', async ()=>{
    try {
      const form=formPupil();
      if(['name','birthDate','sex','group','grade','note','review'].some(key=>form[key]!==editing[key])) throw new Error('登録情報が編集中です。手続きをキャンセルし、先に「保存する」で確定してください。');
      const date=$('lifecycle-date').value;
      if(!C.dateParts(date) || date>today() || date<editing.birthDate) throw new Error('手続き日には生年月日以降・今日以前の日付を入力してください。');
      const context={...historyContext(date),note:$('lifecycle-note').value.trim()};
      const pupil=lifecycleAction==='withdraw' ? C.withdrawPupil(editing,context) : lifecycleAction==='transfer' ? C.transferPupil(editing,$('lifecycle-class').value,context) : C.rejoinPupil(editing,$('lifecycle-class').value,context);
      if(await commit(C.validateBackup({...state,pupils:state.pupils.map(p=>p.id===editing.id?pupil:p)}))) {
        undo=lifecycleAction==='withdraw'?{type:'withdraw',id:pupil.id,name:pupil.name,date}:null;
        render(); $('pupil-dialog').close(); toast(lifecycleAction==='withdraw'?'退会した子の一覧へ移し、記録を保管しました。':lifecycleAction==='transfer'?'クラスを移動し、履歴を記録しました。':'再入会を記録しました。');
      }
    } catch(error){$('form-error').textContent=error.message;$('form-error').hidden=false;}
  });
  $('undo-button').addEventListener('click', async ()=> {
    if (!undo) return;
    try {
    if (undo.type === 'grade') {
      const pupil = state.pupils.find(p => p.id === undo.id);
      if (!pupil || pupil.grade !== undo.to) {toast('その後に情報が変更されたため取り消せません。'); return;}
      const changed=C.recordPupil({...pupil,grade:undo.from},{...historyContext(undo.date),type:'pass_reverted',from:undo.to,to:undo.from});
      if (await commit({...state, pupils: state.pupils.map(p => p.id === undo.id ? changed : p)})) {
        undo = null; render(); toast('合格の記録を取り消しました。');
      }
      return;
    }
    const pupil=state.pupils.find(p=>p.id===undo.id);
    if(!pupil || pupil.status!=='withdrawn'){toast('すでに在籍状態が変更されています。');return;}
    const changed=C.recordPupil({...pupil,status:'active'},{...historyContext(undo.date),type:'withdraw_reverted',to:pupil.group});
    if (await commit(C.validateBackup({...state,pupils:state.pupils.map(p=>p.id===undo.id?changed:p)}))) {undo=null; render(); toast('退会を取り消しました。履歴は保持しています。');}
    } catch(error) {toast(error.message);}
  });
  function download(content, filename, type) {
    const url=URL.createObjectURL(new Blob([content],{type}));
    const a=document.createElement('a'); a.href=url; a.download=filename; document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function backup() {
    download(JSON.stringify({...(pendingWrite?.state||state),exportedAt:new Date().toISOString()},null,2),'スイムノート_バックアップ_'+today()+'.json','application/json');
    toast('バックアップを作成しました。ダウンロード先を確認してください。');
  }
  ['backup-button','help-backup'].forEach(id=>$(id).addEventListener('click',backup));
  ['import-button','empty-import','help-import'].forEach(id=>$(id).addEventListener('click', async ()=>{$('import-file').value=''; $('import-file').click();}));
  $('import-file').addEventListener('change', async () => {
    const file=$('import-file').files[0]; if (!file) return;
    try {
      if (file.size>20*1024*1024) throw new Error('ファイルが大きすぎます。20MB以下のJSONを選んでください。');
      const raw=JSON.parse(await file.text());
      pendingImport=C.validateBackup(raw);
      if(raw.menuCards==null)delete pendingImport.menuCards;
      if(raw.lessons==null)delete pendingImport.lessons;
      const archived=pendingImport.pupils.filter(p=>p.status==='withdrawn').length;
      $('import-description').textContent=`「${file.name}」から在籍 ${pendingImport.pupils.length-archived}人・退会 ${archived}人の情報と履歴を反映します。`;
      const counts=new Map(pendingImport.classes.map(g => [g,0])); pendingImport.pupils.filter(p=>p.status==='active').forEach(p=>counts.set(p.group,(counts.get(p.group)||0)+1));
      $('import-groups').textContent=[...counts].map(([g,n])=>`${g || '未所属'}：${n}人`).join(' / ') || '空の名簿';
      document.querySelector('input[name="import-mode"][value="merge"]').checked=true;
      $('import-error').hidden=true;
      updateImportImpact(); $('import-dialog').showModal();
    } catch (error) {toast(error instanceof SyntaxError ? 'JSONを開けませんでした。アプリのバックアップファイルを選んでください。' : error.message);}
  });
  function importMode() {return document.querySelector('input[name="import-mode"]:checked').value;}
  function updateImportImpact() {
    if (!pendingImport) return;
    const matches=pendingImport.pupils.filter(p=>state.pupils.some(old=>old.id===p.id)).length;
    const mode=importMode();
    $('import-impact').textContent=mode==='replace' ? `退会した子・履歴も含め、今の${state.pupils.length}人を${pendingImport.pupils.length}人のデータで置き換えます。テスト日もバックアップに合わせます。` : `${pendingImport.pupils.length-matches}人を追加、${matches}人を更新します。同じIDの登録情報・在籍状態はファイルの値に更新し、履歴は両方を保管します。現在のテスト日は維持します。IDが異なる同名の子どもは別の登録として扱います。`;
  }
  $('import-mode').addEventListener('change',updateImportImpact);
  $('confirm-import').addEventListener('click', async ()=>{
    if (!pendingImport) return;
    try {
      const next=C.importBackup(state,pendingImport,importMode());
      if (await commit(next,{restore:true})) {undo=null; selectedClass=''; search=''; onlyReview=false; $('search').value=''; render(); $('import-dialog').close(); view('roster'); toast(`${pendingImport.pupils.length}人分のデータを反映しました。テスト日を確認してください。`); pendingImport=null;}
    } catch(error) {$('import-error').textContent=error.message; $('import-error').hidden=false;}
  });
  $('csv-button').addEventListener('click', async ()=>{
    const rows=[['テスト日','氏名','生年月日','クラス','学年','年齢','性別','合格級','次の受験級','テスト種目','距離(m)','規定タイム','実測タイム','確認事項','結果']];
    visiblePupils().forEach(p=>{const r=C.calculate(p,state.testDate,rules); rows.push([state.testDate,p.name,p.birthDate,p.group,r.school,r.age,p.sex==='male'?'男':p.sex==='female'?'女':'未登録',gradeLabel(p.grade),r.next?gradeLabel(r.next):'',C.STROKES[r.stroke]||'',r.distance,r.seconds===null?'':C.formatTime(r.seconds),C.latestTest(p,state.testDate,r.next) ? C.formatMeasuredTime(C.latestTest(p,state.testDate,r.next).test.seconds) : '',[p.review?'元表の級・種目を確認（計算値は参考）':'',r.status].filter(Boolean).join(' / '),'']);});
    download('\ufeff'+rows.map(row=>row.map(C.csvCell).join(',')).join('\r\n'),'テスト一覧_'+state.testDate+'.csv','text/csv;charset=utf-8');
  });
  $('print-button').addEventListener('click', async ()=>window.print());
  function renderRules() {
    const sex=$('rule-sex').value;
    $('rules-body').innerHTML=rules.map(r=>`<tr><td><strong>${gradeLabel(r.grade)}</strong></td><td>${esc(C.STROKES[r.stroke])}</td><td>${r.distance}m</td>${r[sex].map(t=>`<td>${C.formatTime(t)}</td>`).join('')}</tr>`).join('');
  }
  $('rule-sex').addEventListener('change',renderRules);
  practice=SwimPractice.mount({getState:()=>state,commit,toast,today,esc});
  render(); renderRules();lock(SwimCloud.validEndpoint(config.apiUrl)?'IDとパスワードでログインしてください。':'Google側の接続設定が未完了です。管理者用の導入手順を確認してください。');
})();
