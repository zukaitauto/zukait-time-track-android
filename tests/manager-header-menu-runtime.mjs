import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');new vm.Script(src);
const v135=src.slice(src.indexOf('/* V135 MODERN MANAGER MENU'),src.indexOf('/* V110 SUPERVISOR ID001 REPORT'));
const v111=src.slice(src.indexOf('/* V111 MANAGER LAYOUT AUTHORITY'),src.indexOf('(function(){if(document.getElementById(\'v111LeaveBadgeStyle\')'));
let header=null,html='',opened=0;const actions=[];
function element(){const button={setAttribute(){},innerHTML:''},online={innerHTML:''},name={textContent:''},attrs={};return{style:{},attrs,classList:{add(){}},setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],querySelector:s=>s==='b'?name:s==='.v91-role-online'?online:button,appendChild(){},remove(){header=null}}}
const root={get firstElementChild(){return header},get firstChild(){return header},insertBefore(el){header=el},querySelector:s=>['.v91-role-identity','.v135-manager-header,.v91-role-identity'].includes(s)?header:null,querySelectorAll:s=>s==='.v91-role-identity'&&header?[header]:[]};
const ctx={me:{id:'m1',name:'Test Manager',role:'Manager'},document:{getElementById:id=>id==='managerView'?root:null,createElement:element,head:{appendChild(){}}},setTimeout(){},openModal:s=>{html=s;opened++},closeModal(){actions.push('close')},v42SyncNow(){actions.push('sync')},v112OpenLeaveMarking(){actions.push('leave')},v63OpenAbout(){actions.push('about')},logout(){actions.push('logout')}};ctx.window=ctx;
vm.runInNewContext(v135+v111,ctx);
for(let i=0;i<3;i++){
 const previous=header;ctx.v135ApplyManagerMenu();if(previous)assert.equal(header,previous,'header updates preserve the existing row');assert.equal(header.attrs.role,undefined);assert.equal(header.onclick,null);
 header.querySelector('.v91-role-menu').onclick({preventDefault(){},stopPropagation(){}});
 assert.match(html,/Leave Marking/);assert.match(html,/About \/ Update/);assert.match(html,/Logout/);
}
assert.equal(opened,3,'one modal open per click across header rebuilds');
for(const cls of ['leave','update','logout']){const handler=html.match(new RegExp('class="v135-action '+cls+'" onclick="([^"]+)"'))[1];vm.runInNewContext(handler,ctx)}
assert.deepEqual(actions,['leave','close','about','close','logout']);
ctx.me.role='Employee';ctx.v135OpenManagerMenu();assert.equal(opened,3,'manager menu preserves role access');
console.log('PASS: canonical header menu, Leave Marking/About/Logout handlers, one open per click, rebuild stability, no nested button, manager access.');
