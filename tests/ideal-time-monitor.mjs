import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';process.env.TZ='Asia/Muscat';
const src=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8'),mark=src.indexOf('V247 IDEAL TIME MONITOR'),start=src.indexOf("(function(){'use strict';",mark),end=src.indexOf('window.v247IdealTimeReady=true',start),block=src.slice(start,end+'window.v247IdealTimeReady=true'.length+7);
assert.ok(start>0&&end>start,'Ideal Time monitor block exists');
const om=s=>Date.parse(s),now=om('2026-10-01T11:10:00Z');
class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
const users=[{id:'E1',role:'Employee',name:'Babu',department:'Denter'}],state={sessions:[],assign:[],leaves:[],workshopHolidays:[]};
const ctx={state,users,Date:Clock,window:{v75IsClosedWorkshopDay(t){const d=new Clock(t);return d.getDay()===5||state.workshopHolidays.some(h=>h.dateKey===d.toISOString().slice(0,10))},v63IsOnLeave(){return false}},activeSession(id){return state.sessions.find(s=>s.emp===id&&!s.end)||null},fmt:m=>m+'m',me:{role:'Supervisor'},document:{getElementById(){return null},createElement(){return{}},head:{appendChild(){}}},setInterval(){},setTimeout(){},openModal(){}};
ctx.window.window=ctx.window;ctx.window.state=state;ctx.window.users=users;ctx.window.Date=Clock;ctx.window.activeSession=ctx.activeSession;ctx.window.fmt=ctx.fmt;ctx.window.me=ctx.me;ctx.window.document=ctx.document;ctx.window.setInterval=ctx.setInterval;ctx.window.setTimeout=ctx.setTimeout;ctx.window.openModal=ctx.openModal;vm.runInNewContext(block,ctx.window);
const S=(job,start,end,extra={})=>({emp:'E1',job,start:om(start),end:end?om(end):null,...extra});
state.sessions=[S('A','2026-10-01T05:55:00Z','2026-10-01T06:00:00Z')];assert.equal(ctx.window.v247CurrentIdealRows()[0].minutes,190,'current idle counts valid duty minutes only');
state.sessions=[S('A','2026-10-01T08:58:00Z','2026-10-01T08:58:00Z')];assert.equal(ctx.window.v247CurrentIdealRows()[0].minutes,12,'12:58 pause crosses lunch and counts 2+10 duty minutes');
state.sessions=[S('A','2026-10-01T08:58:00Z','2026-10-01T08:58:00Z'),S('ID001','2026-10-01T11:00:00Z','2026-10-01T11:10:00Z')];assert.equal(ctx.window.v247CurrentIdealRows().length,0,'ID001 coverage prevents unexplained idle listing');
state.sessions=[S('A','2026-10-01T04:00:00Z','2026-10-01T05:00:00Z'),S('B','2026-10-01T05:04:00Z','2026-10-01T06:00:00Z')];let h=ctx.window.v247IdealHistory('E1',om('2026-10-01T04:00:00Z'),om('2026-10-01T06:00:00Z'),false);assert.equal(h[0].minutes,4,'closed gap history retains full gap under 5-minute live grace');
state.sessions=[S('A','2026-10-01T04:00:00Z','2026-10-01T05:00:00Z'),S('B','2026-10-01T04:30:00Z','2026-10-01T05:30:00Z'),S('C','2026-10-01T05:40:00Z','2026-10-01T06:00:00Z')];h=ctx.window.v247IdealHistory('E1',om('2026-10-01T04:00:00Z'),om('2026-10-01T06:00:00Z'),false);assert.equal(h.length,1);assert.equal(h[0].minutes,10,'overlapping productive sessions merge before gap calculation');
const before=JSON.stringify(state);ctx.window.v247IdealHistory('E1',om('2026-10-01T04:00:00Z'),now,false);assert.equal(JSON.stringify(state),before,'Ideal Time reporting is read-only');
console.log('Ideal Time monitor passed: duty grace, lunch, ID001, short gaps, overlap merge, read-only.');

const stable=fs.readFileSync('app/src/main/assets/supervisor_stable.js','utf8');
assert.match(stable,/Today at a Glance[\s\S]*class="ideal-worker"/,'Ideal Worker placement targets the authoritative Today at a Glance renderer');
assert.match(stable,/\.v143-glance\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,'Ideal Worker remains inside the 3x2 stable glance grid');
assert.match(stable,/onclick="v143OpenIdealWorker\(\)"/,'Ideal Worker tile opens the Ideal Time details');
assert.doesNotMatch(stable,/class="ready" onclick="v143OpenReadyForDelivery\(\)"/,'Ready for Delivery does not reclaim the Ideal Worker glance slot');
console.log('Ideal Worker placement passed: authoritative stable glance tile with no lower-action duplicate.');
