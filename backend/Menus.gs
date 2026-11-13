(function(root){
  'use strict';
  const text=(v,max,label)=>{if(typeof v!=='string'||v.length>max)throw new Error(label+'を確認してください。');return v.trim();};
  const number=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)throw new Error(label+'を確認してください。');return v;};
  function item(raw){
    if(!raw||typeof raw!=='object')throw new Error('練習メニューの形式が正しくありません。');
    const value={id:text(raw.id,100,'メニューID'),title:text(raw.title,100,'メニュー名'),category:text(raw.category||'練習',40,'分類'),seconds:number(raw.seconds,30,14400,'所要時間'),distance:number(raw.distance??0,0,10000,'距離'),reps:number(raw.reps??1,1,200,'本数'),note:text(raw.note||'',1000,'メニューのメモ')};
    if(!value.id||!value.title)throw new Error('メニュー名を入力してください。');
    return value;
  }
  function lesson(raw){
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.items)||raw.items.length>100)throw new Error('レッスンの形式が正しくありません。');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)||new Date(raw.date+'T00:00:00Z').toISOString().slice(0,10)!==raw.date)throw new Error('レッスン日を確認してください。');
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.start))throw new Error('開始時刻を確認してください。');
    const value={id:text(raw.id,100,'レッスンID'),title:text(raw.title,100,'レッスン名'),date:raw.date,start:raw.start,group:text(raw.group||'',50,'クラス'),minutes:number(raw.minutes,5,240,'レッスン時間'),note:text(raw.note||'',2000,'レッスンのメモ'),items:raw.items.map(item)};
    if(!value.id||!value.title)throw new Error('レッスン名を入力してください。');
    if(new Set(value.items.map(i=>i.id)).size!==value.items.length)throw new Error('練習項目のIDが重複しています。');
    return value;
  }
  function validate(raw){
    const cards=raw.menuCards??[],lessons=raw.lessons??[];
    if(!Array.isArray(cards)||cards.length>500||!Array.isArray(lessons)||lessons.length>2000)throw new Error('練習データの件数・形式を確認してください。');
    const checked={menuCards:cards.map(item),lessons:lessons.map(lesson)};
    for(const list of [checked.menuCards,checked.lessons])if(new Set(list.map(x=>x.id)).size!==list.length)throw new Error('練習データのIDが重複しています。');
    if(checked.lessons.some(l=>summary(l).remaining<0))throw new Error('レッスンの予定時間が上限を超えています。');
    return checked;
  }
  function summary(plan){
    let elapsed=0;
    const rows=plan.items.map(i=>{const start=elapsed;elapsed+=i.seconds;return {...i,from:start,to:elapsed};});
    return {seconds:elapsed,remaining:(Number.isFinite(plan.minutes)?plan.minutes:0)*60-elapsed,distance:plan.items.reduce((n,i)=>n+i.distance*i.reps,0),rows};
  }
  const duration=seconds=>`${Math.floor(Math.abs(seconds)/60)}分${Math.abs(seconds)%60 ? Math.abs(seconds)%60+'秒' : ''}`;
  function clock(start,seconds){const [h,m]=start.split(':').map(Number);const n=h*3600+m*60+seconds;return `${String(Math.floor(n/3600)%24).padStart(2,'0')}:${String(Math.floor(n%3600/60)).padStart(2,'0')}${n%60?':'+String(n%60).padStart(2,'0'):''}`;}
  function seedCards(){return [['warmup','ウォーミングアップ','準備',5,25,4],['kick','キック練習','基礎',10,25,4],['drill','フォーム・ドリル','技術',10,25,4],['main','メインスイム','メイン',15,25,8],['cooldown','クールダウン','整理',5,25,2],['review','振り返り・移動','その他',5,0,1]].map(([id,title,category,minutes,distance,reps])=>({id:'sample-'+id,title,category,seconds:minutes*60,distance,reps,note:'時間や内容をクラスに合わせて調整してください。'}));}
  const api={item,lesson,validate,summary,duration,clock,seedCards};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SwimMenus=api;
})(typeof globalThis!=='undefined'?globalThis:this);
