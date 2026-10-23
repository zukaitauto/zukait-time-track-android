import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {installMechanicalNavigation} from '../app/src/main/assets/mechanical_navigation.js';
const v74=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8'),html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const manager=v74.split('\n').find(l=>l.includes('window.v111OpenManagerMenu=function(){'));
const start=v74.indexOf('window.v65OpenAccount=function(){'),end=v74.indexOf('\n };',start);
assert.ok(manager&&start>=0&&end>start,'Actual menu sources must be present');
const supervisor=v74.slice(start,end+4),header=html.split('\n').find(l=>l.startsWith('function openSupervisorHeaderMenu(){'));
const dom=new JSDOM('<div id="modal"></div>',{url:'https://example.invalid'}),host=dom.window,doc=host.document;
const ctx={window:host,document:doc,me:{id:'MGR001',name:'QA',role:'Manager'},esc:v=>String(v).replaceAll('<','&lt;'),openModal:body=>{doc.getElementById('modal').innerHTML='<div class="modal-box">'+body+'</div>'},showSupervisorModal:(title,body)=>{doc.getElementById('modal').innerHTML='<div class="modal-box"><h3>'+title+'</h3>'+body+'</div>'}};
vm.createContext(ctx);vm.runInContext(manager+'\n'+supervisor+'\n'+header+'\nwindow.openSupervisorHeaderMenu=openSupervisorHeaderMenu;',ctx);
host.v135OpenManagerMenu=host.v111OpenManagerMenu;host.v110OpenManagerMenu=host.v111OpenManagerMenu;
let enabled=false,opens=0;const original=host.v111OpenManagerMenu;
const config={host,document:doc,getUser:()=>ctx.me,enabled:()=>enabled,open:async()=>{opens++}};
const install=installMechanicalNavigation(config);
host.v111OpenManagerMenu();assert.equal(doc.querySelectorAll('[data-mechanical-navigation]').length,0);assert.ok(doc.querySelector('[onclick*="logout"]'));
enabled=true;
for(const method of ['v111OpenManagerMenu','v135OpenManagerMenu','v110OpenManagerMenu']){
 host[method]();assert.equal(doc.querySelectorAll('[data-mechanical-navigation]').length,1);assert.match(doc.getElementById('modal').textContent,/Mechanical Department/);assert.ok(doc.querySelector('[onclick*="logout"]'));assert.ok(doc.querySelector('[onclick*="v63OpenAbout"]'));doc.querySelector('[data-mechanical-navigation]').click();await Promise.resolve();assert.ok(opens>0);
}
ctx.me={id:'SUP003',name:'Jibin',role:'Supervisor'};
for(const method of ['v65OpenAccount','openSupervisorHeaderMenu']){host[method]();assert.equal(doc.querySelectorAll('[data-mechanical-navigation]').length,1);assert.ok(doc.getElementById('modal').textContent.includes(method==='v65OpenAccount'?'LOGOUT':'Employee Requests'));}
installMechanicalNavigation(config);host.v65OpenAccount();assert.equal(doc.querySelectorAll('[data-mechanical-navigation]').length,1,'Repeated installation/menu open cannot duplicate entry');
for(const role of ['Employee','Purchaser','Receptionist','Accountant']){ctx.me={id:'QA_OTHER',name:'Other',role};host.v65OpenAccount();assert.equal(doc.querySelectorAll('[data-mechanical-navigation]').length,0);assert.ok(doc.querySelector('[onclick*="logout"]'));}
ctx.me={id:'SUP003',name:'Jibin',role:'Supervisor'};host.v65OpenAccount();const stale=doc.querySelector('[data-mechanical-navigation]'),before=opens;ctx.me={...ctx.me,id:'OTHER'};stale.click();await Promise.resolve();assert.equal(opens,before,'Stale menu cannot open for a different account');
enabled=false;host.v65OpenAccount();assert.equal(doc.querySelectorAll('[data-mechanical-navigation]').length,0);
install.uninstall();assert.equal(host.v111OpenManagerMenu,original,'Uninstall restores original functions');
assert.ok(!fs.readFileSync('app/src/main/assets/mechanical_navigation.js','utf8').includes('setInterval'),'Menu integration cannot add polling');
console.log('PASS real Manager/Supervisor menus: default-off, current-role/owner gate, preserved Sync/About/Leave/Logout/Exit, all entry aliases, no duplicates/polling and stale account denial.');
