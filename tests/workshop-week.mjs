import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('app/src/main/assets/workshop_periods.js','utf8'),ctx={Date};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);const bounds=ctx.zukaitWorkshopPeriods.bounds;
const iso=t=>new Date(t).toISOString();
for(const now of ['2026-10-17T08:00:00+04:00','2026-10-18T20:00:00+04:00','2026-10-19T01:38:00+04:00','2026-10-22T23:59:59+04:00','2026-10-23T20:00:00+04:00']){
 const [a,b]=bounds('week',Date.parse(now));assert.equal(iso(a),'2026-10-16T20:00:00.000Z');assert.equal(iso(b),'2026-10-22T20:00:00.000Z');
}
assert.equal(iso(bounds('week',Date.parse('2026-10-24T00:00:00+04:00'))[0]),'2026-10-23T20:00:00.000Z');
assert.equal(iso(bounds('week',Date.parse('2026-11-01T09:00:00+04:00'))[0]),'2026-10-30T20:00:00.000Z','week crosses month boundary');
assert.equal(iso(bounds('week',Date.parse('2027-01-01T09:00:00+04:00'))[0]),'2026-12-25T20:00:00.000Z','Friday retains previous workshop week across year boundary');
const at=Date.parse('2026-10-19T01:38:00+04:00');
class Clock extends Date{constructor(...args){super(...(args.length?args:[at]))}static now(){return at}}
const stamp=t=>Date.parse(t+'+04:00'),sessions=[
 {emp:'E',job:'J1',start:stamp('2026-10-17T08:00:00'),end:stamp('2026-10-17T10:00:00')},
 {emp:'E',job:'J2',start:stamp('2026-10-18T08:00:00'),end:stamp('2026-10-18T11:00:00')},
 {emp:'E',job:'J0',start:stamp('2026-10-16T08:00:00'),end:stamp('2026-10-16T09:00:00')},
 {emp:'E',job:'ID001',start:stamp('2026-10-17T12:00:00'),end:stamp('2026-10-17T13:00:00')}
];
const model={Date:Clock,state:{sessions},users:[{id:'E',name:'Technician',role:'Employee'}],HOLD:'ID001',startDay:t=>{const d=new Clock(t);return new Clock(d.getFullYear(),d.getMonth(),d.getDate()).getTime()},sessionNormalMinutes:s=>(s.end-s.start)/60000};model.window=model;vm.createContext(model);vm.runInContext(source,model);
function extract(text,name){const start=text.indexOf('function '+name+'(');assert.ok(start>=0);let depth=0,b=text.indexOf('{',start);for(let i=b;i<text.length;i++){if(text[i]==='{')depth++;if(text[i]==='}'&&!--depth)return text.slice(start,i+1);}throw Error('Missing function end')}
const manager=fs.readFileSync('app/src/main/assets/v67_updates.js','utf8');vm.runInContext(extract(manager,'period')+';'+extract(manager,'worked'),model);
assert.equal(vm.runInContext("worked('week')",model),300,'Saturday and Sunday remain in Monday weekly card');
assert.equal(vm.runInContext("worked('day')",model),0,'new Monday daily total is correctly zero before duty');
for(const file of ['v63_updates.js','v65_updates.js']){
 const text=fs.readFileSync('app/src/main/assets/'+file,'utf8');vm.runInContext(extract(text,'periodBounds')+';'+extract(text,'employeeMinutes'),model);
 const [a,b]=vm.runInContext("periodBounds('week')",model);const sum=model.users.reduce((n,u)=>n+model.employeeMinutes(u.id,a,b),0);assert.equal(sum,300,file+' drilldown equals dashboard');
}
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');assert.ok(html.indexOf('src="workshop_periods.js')<html.indexOf('src="v63_updates.js'));
assert.match(fs.readFileSync('app/src/main/assets/v66_updates.js','utf8'),/zukaitWorkshopPeriods.bounds\(kind\)/);
console.log('Workshop week: Oman Saturday–Thursday, Friday retention, Saturday reset, month/year boundaries, Monday 0 daily / 5h weekly, ID001 exclusion and card/detail parity passed');
