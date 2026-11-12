import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8'),updates=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
// Load real shipped functions; local constructor deterministically models Muscat.
class MuscatDate extends Date{
 constructor(...args){
  if(args.length>1){const [y,m,d=1,h=0,min=0,sec=0,ms=0]=args;super(Date.UTC(y,m,d,h,min,sec,ms)-4*3600000)}
  else super(...args);
 }
 shifted(){return new Date(this.getTime()+4*3600000)}
 getFullYear(){return this.shifted().getUTCFullYear()}getMonth(){return this.shifted().getUTCMonth()}getDate(){return this.shifted().getUTCDate()}getDay(){return this.shifted().getUTCDay()}getHours(){return this.shifted().getUTCHours()}getMinutes(){return this.shifted().getUTCMinutes()}getSeconds(){return this.shifted().getUTCSeconds()}
}
const ctx={Date:MuscatDate,state:{workshopHolidays:['2026-10-08'],sessions:[],assign:[]}};ctx.window=ctx;vm.createContext(ctx);
const helpers=html.slice(html.indexOf('function parseWorkMinutes('),html.indexOf('\nfunction job(no)'));
vm.runInContext(helpers,ctx);
for(const minutes of [1,5,15,30,45,60,90,150,600])assert.equal(ctx.parseWorkMinutes(ctx.formatWorkMinutes(minutes)),minutes,'formatter/parser round trip');
assert.ok(Number.isNaN(ctx.parseWorkMinutes('1:99')));assert.equal(ctx.parseWorkMinutes('2.30'),150,'existing H.MM input preserved');
let start=updates.indexOf(' const HOLD=',updates.indexOf('/* V75.2 HOLIDAY'));let end=updates.indexOf(' const normalAssignmentAvailableMinutes=',start);
vm.runInContext('(function(){'+updates.slice(start,end)+'})();',ctx);
const t=(day,hour)=>Date.parse(day+'T'+String(hour).padStart(2,'0')+':00:00+04:00');
const holidayStart=t('2026-10-08',8),holidayEnd=t('2026-10-08',9);
assert.equal(ctx.sessionNormalMinutes({start:holidayStart,end:holidayEnd},holidayEnd),0);
assert.equal(ctx.normalOverlapMinutes(holidayStart,holidayEnd),0,'incentive function excludes public holidays');
assert.equal(ctx.sessionOvertimeMinutes({start:holidayStart,end:holidayEnd},holidayEnd),60);
for(const [day,h1,h2,normal,overtime] of [['2026-10-10',8,13,300,0],['2026-10-10',13,15,0,120],['2026-10-10',15,19,240,0],['2026-10-10',19,20,0,60],['2026-10-09',8,9,0,60]]){
 const s={start:t(day,h1),end:t(day,h2)};assert.equal(ctx.sessionNormalMinutes(s,s.end),normal);assert.equal(ctx.sessionOvertimeMinutes(s,s.end),overtime);
}
start=updates.indexOf("(function(){'use strict';",updates.indexOf('/* V107 INCENTIVE FINAL'));end=updates.indexOf('})();',start)+5;
vm.runInContext(updates.slice(start,end),ctx);
ctx.state.assign=[{id:'a1',emp:'E1',job:'JC1',suggested:60,completed:false}];ctx.state.sessions=[{id:'s1',emp:'E1',job:'JC1',assignmentId:'a1',start:holidayStart,end:holidayEnd}];
assert.equal(ctx.incentiveFor('E1',holidayStart).achieved,0,'actual final incentive excludes holiday work');
// Execute the actual additional-time approval controller with its parser/default.
const assign={id:'a1',emp:'E1',job:'JC1',suggested:60,completed:false};
ctx.state.assign=[assign];ctx.state.requests=[{id:'r1',emp:'E1',job:'JC1',status:'New',type:'more_time',minutes:30}];
ctx.me={id:'S1',role:'Supervisor'};ctx.alert=msg=>{throw Error(msg)};ctx.confirm=()=>true;ctx.user=id=>({id,name:id});ctx.fmt=n=>String(n);ctx.now=()=>holidayEnd;ctx.uid=()=> 'test';ctx.save=()=>{};ctx.render=()=>{};ctx.prompt=(message,defaultValue)=>defaultValue;
start=updates.lastIndexOf('(function()',updates.indexOf(' window.v124AddAdditionalTime=add;'));end=updates.indexOf('})();',start)+5;
vm.runInContext(updates.slice(start,end),ctx);ctx.approveRequest('r1');
assert.equal(assign.suggested,90,'accepting 30-minute request default adds exactly 30 minutes');
console.log('Review time calculations: H.MM compatibility, approval default, public holiday incentive, duty windows and overtime passed');
