import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const files=fs.readdirSync(path.join(root,'public')).sort();
if(JSON.stringify(files)!==JSON.stringify(['.nojekyll','index.html']))throw new Error('Unexpected files in public/');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const config=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.apiUrl||''))throw new Error('config.json の apiUrl に Apps Script の /exec URL を設定してください。index.html はビルド時に再生成されます。');
const embedded=html.match(/<script id="cloud-config" type="application\/json">([\s\S]*?)<\/script>/);
if(!embedded||JSON.stringify(JSON.parse(embedded[1]))!==JSON.stringify(config))throw new Error('公開HTMLの接続設定がconfig.jsonと一致しません。node tools/build.mjs を実行してください。');
if(/localStorage|sessionStorage|initialAccount_|TOKEN_SECRET|"birthDate"\s*:\s*"\d{4}/.test(html))throw new Error('Private data or persisted session in public HTML');
if(!html.includes('id="auth-screen"')||!html.includes('class="app-shell" hidden'))throw new Error('Login gate missing');
if(fs.existsSync(path.join(root,'.local','InitialAccount.gs'))){const privateText=fs.readFileSync(path.join(root,'.local','InitialAccount.gs'),'utf8');for(const part of privateText.match(/[a-f0-9]{32,}/g)||[])if(html.includes(part))throw new Error('Private account material in public HTML');}
console.log('Public artifact contains only the login-gated app, no private account or roster data.');
