import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const files=fs.readdirSync(path.join(root,'public')).sort();
if(JSON.stringify(files)!==JSON.stringify(['.nojekyll','index.html']))throw new Error('Unexpected files in public/');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
if(/localStorage|sessionStorage|initialAccount_|TOKEN_SECRET|"birthDate"\s*:\s*"\d{4}/.test(html))throw new Error('Private data or persisted session in public HTML');
if(!html.includes('id="auth-screen"')||!html.includes('class="app-shell" hidden'))throw new Error('Login gate missing');
if(fs.existsSync(path.join(root,'.local','InitialAccount.gs'))){const privateText=fs.readFileSync(path.join(root,'.local','InitialAccount.gs'),'utf8');for(const part of privateText.match(/[a-f0-9]{32,}/g)||[])if(html.includes(part))throw new Error('Private account material in public HTML');}
console.log('Public artifact contains only the login-gated app, no private account or roster data.');
