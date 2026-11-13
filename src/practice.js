(function(root){
  'use strict';
  function mount({getState,commit,toast,today,esc}){
    const M=SwimMenus,$=id=>document.getElementById(id),uid=()=>crypto.randomUUID();
    let draft=null,cardId=null,dirty=false;
    const blank=()=>({id:uid(),title:'練習メニュー',date:today(),start:'16:00',group:'',minutes:60,note:'',items:[]});
    function resetDraft(){draft=blank();dirty=false;fill();}
    function clear(){draft=blank();cardId=null;dirty=false;fill();$('menu-library').textContent='';$('lesson-list').innerHTML='<option value="">保存したレッスン</option>';$('lesson-preview-content').textContent='';}
    function fill(){if(!draft)draft=blank();for(const key of ['title','date','start','group','minutes','note'])$('lesson-'+key).value=draft[key];renderTimeline();}
    function read(){if(!draft)draft=blank();for(const key of ['title','date','start','group','note'])draft[key]=$('lesson-'+key).value;draft.minutes=Number($('lesson-minutes').value);return draft;}
    function renderLibrary(){
      const state=getState(),query=$('menu-search').value.trim().toLowerCase();
      $('menu-library').innerHTML=state.menuCards.filter(c=>(c.title+c.category+c.note).toLowerCase().includes(query)).map(c=>`<article class="menu-card"><div><span class="menu-category">${esc(c.category)}</span><strong>${M.duration(c.seconds)}</strong></div><h3>${esc(c.title)}</h3><p>${c.distance?`${c.distance}m × ${c.reps}本 · ${c.distance*c.reps}m`:'時間で組むメニュー'}</p>${c.note?`<p class="menu-note">${esc(c.note)}</p>`:''}<footer><button class="button primary" data-add-menu="${esc(c.id)}">＋ 追加</button><button class="text-button" data-edit-menu="${esc(c.id)}">編集</button></footer></article>`).join('')||'<p class="small">練習カードがありません。「カードを作成」から登録できます。</p>';
      const selected=$('lesson-list').value;
      $('lesson-list').innerHTML='<option value="">保存したレッスン</option>'+[...state.lessons].sort((a,b)=>b.date.localeCompare(a.date)).map(l=>`<option value="${esc(l.id)}">${esc(l.date+' '+l.group+' '+l.title)}</option>`).join('');
      if(state.lessons.some(l=>l.id===selected))$('lesson-list').value=selected;
    }
    function renderTimeline(){
      if(!draft)return;const result=M.summary(draft),limit=draft.minutes*60;
      $('lesson-used').textContent=M.duration(result.seconds);$('lesson-remaining').textContent=(result.remaining<0?'超過 ':'残り ')+M.duration(result.remaining);
      $('lesson-remaining').classList.toggle('over-time',result.remaining<0);$('lesson-distance').textContent=result.distance+'m';
      $('lesson-meter').value=Math.min(result.seconds,limit||1);$('lesson-meter').max=limit||1;
      $('lesson-dirty').textContent=dirty?'未保存の変更があります':'レッスンを編集して保存できます';
      $('lesson-items').innerHTML=result.rows.map((i,n)=>`<li class="lesson-item"><div class="item-time">${M.clock(draft.start||'00:00',i.from)}<span>${M.clock(draft.start||'00:00',i.to)}</span></div><div class="item-main"><strong>${esc(i.title)}</strong><span>${i.distance?`${i.distance}m × ${i.reps}本`:'時間指定'}</span><label>予定時間 <input type="number" min="0.5" max="240" step="0.5" data-item-minutes="${esc(i.id)}" aria-label="${esc(i.title)}の予定時間" value="${i.seconds/60}"> 分</label>${i.note?`<p>${esc(i.note)}</p>`:''}</div><div class="item-actions"><button class="text-button" data-move-item="${esc(i.id)}" data-direction="-1" ${n===0?'disabled':''} aria-label="${esc(i.title)}を上へ">↑</button><button class="text-button" data-move-item="${esc(i.id)}" data-direction="1" ${n===result.rows.length-1?'disabled':''} aria-label="${esc(i.title)}を下へ">↓</button><button class="text-button danger-text" data-remove-item="${esc(i.id)}" aria-label="${esc(i.title)}を外す">外す</button></div></li>`).join('')||'<li class="lesson-empty">左のカードから練習を追加してください。</li>';
    }
    function render(){if(!draft)resetDraft();renderLibrary();renderTimeline();}
    function changed(){dirty=true;renderTimeline();}
    ['title','date','start','group','minutes','note'].forEach(key=>$('lesson-'+key).addEventListener('input',()=>{read();changed();}));
    $('menu-search').addEventListener('input',renderLibrary);
    $('menu-library').addEventListener('click',e=>{
      const add=e.target.closest('[data-add-menu]'),edit=e.target.closest('[data-edit-menu]');
      if(add){const card=getState().menuCards.find(c=>c.id===add.dataset.addMenu);if(card){read();if(draft.items.length>=100){toast('1レッスンは100項目までです。');return;}draft.items.push({...card,id:uid()});changed();}}
      if(edit)openCard(edit.dataset.editMenu);
    });
    $('lesson-items').addEventListener('change',e=>{const input=e.target.closest('[data-item-minutes]');if(!input)return;const seconds=Number(input.value)*60;if(!Number.isInteger(seconds)||seconds<30||seconds>14400){toast('予定時間は0.5〜240分で入力してください。');renderTimeline();return;}draft.items.find(i=>i.id===input.dataset.itemMinutes).seconds=seconds;changed();});
    $('lesson-items').addEventListener('click',e=>{const move=e.target.closest('[data-move-item]'),remove=e.target.closest('[data-remove-item]');if(move){const index=draft.items.findIndex(i=>i.id===move.dataset.moveItem),target=index+Number(move.dataset.direction);if(target>=0&&target<draft.items.length)[draft.items[index],draft.items[target]]=[draft.items[target],draft.items[index]];changed();}if(remove){draft.items=draft.items.filter(i=>i.id!==remove.dataset.removeItem);changed();}});
    function openCard(id){const card=getState().menuCards.find(c=>c.id===id);cardId=card?.id||null;$('menu-card-form').reset();$('menu-card-error').hidden=true;$('delete-menu-card').hidden=!card;
      for(const key of ['title','category','distance','reps','note'])$('card-'+key).value=card?.[key]??({category:'練習',distance:25,reps:4}[key]||'');$('card-minutes').value=card?card.seconds/60:5;$('menu-card-dialog').showModal();}
    $('create-menu-card').addEventListener('click',()=>openCard());
    $('menu-card-form').addEventListener('submit',async e=>{e.preventDefault();try{const card=M.item({id:cardId||uid(),title:$('card-title').value,category:$('card-category').value,seconds:Number($('card-minutes').value)*60,distance:Number($('card-distance').value),reps:Number($('card-reps').value),note:$('card-note').value});const state=getState(),menuCards=cardId?state.menuCards.map(c=>c.id===cardId?card:c):[...state.menuCards,card];if(await commit({...state,menuCards})){$('menu-card-dialog').close();toast('練習カードを保存しました。');}}catch(error){$('menu-card-error').textContent=error.message;$('menu-card-error').hidden=false;}});
    $('delete-menu-card').addEventListener('click',async()=>{if(!cardId||!confirm('この練習カードを削除しますか？ 作成済みのレッスンには残ります。'))return;const state=getState();if(await commit({...state,menuCards:state.menuCards.filter(c=>c.id!==cardId)})){$('menu-card-dialog').close();toast('練習カードを削除しました。');}});
    $('new-lesson').addEventListener('click',()=>{if(dirty&&!confirm('未保存の変更を破棄して新しいレッスンを作りますか？'))return;resetDraft();$('lesson-list').value='';});
    $('lesson-list').addEventListener('change',()=>{const plan=getState().lessons.find(l=>l.id===$('lesson-list').value);if(!plan)return;if(dirty&&!confirm('未保存の変更を破棄して、選んだレッスンを開きますか？'))return;draft=JSON.parse(JSON.stringify(plan));dirty=false;fill();});
    async function saveLesson(copy){try{let plan=M.lesson(read());if(copy)plan={...plan,id:uid()};if(M.summary(plan).remaining<0){toast('レッスン時間を超えています。項目の時間かレッスン時間を調整してください。');return;}const state=getState(),exists=state.lessons.some(l=>l.id===plan.id),lessons=exists?state.lessons.map(l=>l.id===plan.id?plan:l):[...state.lessons,plan];if(await commit({...state,lessons})){draft=plan;dirty=false;renderLibrary();$('lesson-list').value=plan.id;fill();toast('レッスンを保存しました。');}}catch(error){toast(error.message);}}
    $('save-lesson').addEventListener('click',()=>saveLesson(false));$('copy-lesson').addEventListener('click',()=>saveLesson(true));
    $('delete-lesson').addEventListener('click',async()=>{const state=getState();if(!draft||!state.lessons.some(l=>l.id===draft.id)){toast('保存済みのレッスンを選択してください。');return;}if(!confirm('このレッスンを削除しますか？'))return;if(await commit({...state,lessons:state.lessons.filter(l=>l.id!==draft.id)})){resetDraft();renderLibrary();toast('レッスンを削除しました。');}});
    $('preview-lesson').addEventListener('click',()=>{try{const plan=M.lesson(read()),s=M.summary(plan);$('lesson-preview-content').innerHTML=`<h1>${esc(plan.title)}</h1><p>${esc(plan.date)} · ${esc(plan.group||'クラス指定なし')} · ${plan.start}〜${M.clock(plan.start,plan.minutes*60)} / ${plan.minutes}分</p><div class="preview-metrics">練習 ${M.duration(s.seconds)} · ${s.remaining<0?'超過':'残り'} ${M.duration(s.remaining)} · 合計 ${s.distance}m</div><ol>${s.rows.map(i=>`<li><time>${M.clock(plan.start,i.from)}〜${M.clock(plan.start,i.to)}</time><div><strong>${esc(i.title)}</strong><p>${i.distance?`${i.distance}m × ${i.reps}本 · `:''}${M.duration(i.seconds)}</p>${i.note?`<p>${esc(i.note)}</p>`:''}</div></li>`).join('')}</ol>${plan.note?`<p class="preview-note">${esc(plan.note)}</p>`:''}`;$('lesson-preview-dialog').showModal();}catch(error){toast(error.message);}});
    $('print-lesson').addEventListener('click',()=>{document.body.classList.add('printing-lesson');window.print();});
    window.addEventListener('afterprint',()=>document.body.classList.remove('printing-lesson'));
    $('lesson-preview-dialog').addEventListener('close',()=>document.body.classList.remove('printing-lesson'));
    return {render,renderLibrary,resetDraft,clear};
  }
  root.SwimPractice={mount};
})(globalThis);
