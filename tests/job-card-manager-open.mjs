import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const source=html.slice(html.indexOf('function esc(value)'),html.indexOf('function save()'));
const ctx={state:{jobs:[{no:'12001',vehicle:'TOYOTA <TEST>',reg:'QA'}],assign:[]},jobManagerStatus:()=> 'NEW',isRepeatJob:()=>false,jobAssignedDate:()=>0,user:()=>({name:'QA'}),jobAgeText:()=>'',statusHTML:x=>x,openModal:s=>ctx.result=s};vm.createContext(ctx);
// Execute the actual shared helpers and actual Manager opening/list/row functions.
vm.runInContext(source.slice(0,source.indexOf('const KEY')),ctx);
vm.runInContext(html.slice(html.indexOf('function openJobCardManager('),html.indexOf('function filterJobManagerList(')),ctx);
vm.runInContext("openJobCardManager('all')",ctx);assert.match(ctx.result,/Job Card Control Center/);assert.match(ctx.result,/12001/);assert.match(ctx.result,/&lt;Test&gt;/);assert.equal(ctx.state.jobs[0].vehicle,'TOYOTA <TEST>');
console.log('PASS actual Job Card Manager opens populated list with shared vehicle formatter/escaping and preserves records');
