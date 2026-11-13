/* Cross-origin Apps Script transport. Credentials are sent only in HTTPS POST bodies. */
(function(root){
  'use strict';
  function isGoogleOrigin(origin){try{const u=new URL(origin);return u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname==='script.googleusercontent.com'||u.hostname.endsWith('-script.googleusercontent.com'));}catch{return false;}}
  function isFrameSource(source,frame){try{for(let i=0;source&&i<6;i++){if(source===frame)return true;const parent=source.parent;if(parent===source)break;source=parent;}}catch{}return false;}
  function validEndpoint(value){try{const u=new URL(value);return u.origin==='https://script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)&&!u.search&&!u.hash;}catch{return false;}}
  function post(config,payload){
    if(!validEndpoint(config.apiUrl))return Promise.reject(Object.assign(new Error('Google側の接続設定が未完了です。管理者用の導入手順を確認してください。'),{code:'NOT_CONFIGURED'}));
    if(location.protocol!=='https:'&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1')return Promise.reject(new Error('GitHub PagesのURLから開いてください。'));
    return new Promise((resolve,reject)=>{
      const requestId=crypto.randomUUID(),iframe=document.createElement('iframe'),form=document.createElement('form'),field=document.createElement('input');
      iframe.name='swim_'+requestId;iframe.hidden=true;iframe.title='スイムノートの保存通信';
      form.method='POST';form.action=config.apiUrl;form.target=iframe.name;form.hidden=true;
      field.name='payload';field.value=JSON.stringify({...payload,requestId,origin:location.origin});form.append(field);
      const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',onMessage);form.remove();iframe.remove();};
      const onMessage=event=>{
        const data=event.data;
        if(!isGoogleOrigin(event.origin)||!isFrameSource(event.source,iframe.contentWindow)||!data||data.channel!=='swim-api-v1'||data.requestId!==requestId)return;
        cleanup();if(data.ok)resolve(data.value);else reject(Object.assign(new Error(data.error?.message||'処理を完了できませんでした。'),{code:data.error?.code||'SERVER_ERROR'}));
      };
      const timer=setTimeout(()=>{cleanup();reject(Object.assign(new Error('通信が完了しませんでした。接続を確認して再試行してください。'),{code:'NETWORK'}));},60000);
      window.addEventListener('message',onMessage);document.body.append(iframe,form);form.submit();
    });
  }
  const api={post,isGoogleOrigin,isFrameSource,validEndpoint};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SwimCloud=api;
})(typeof globalThis!=='undefined'?globalThis:this);
