import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Test the actual Employee dashboard renderer with synthetic sessions.
// No real employee, customer or workshop records are accessed.
const src=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const start=src.indexOf('window.v253OpenEmployeeDailyReport=function(');
const end=src.indexOf('   const lower=',start);
assert.ok(start>=0&&end>start,'Employee daily report implementation present');
const script=src.slice(start,end);
const t=s=>Date.parse(s);
const own='EMP_SYNTH';
const sessions=[
 {id:'prior1',emp:own,job:'12086',start:t('2026-10-31T15:00:00Z'),end:t('2026-10-31T15:30:00Z'),paused:true},
 {id:'prior2',emp:own,job:'12021',start:t('2026-10-31T16:00:00Z'),end:t('2026-10-31T16:30:00Z'),paused:true},
 {id:'i1',emp:own,job:'ID001',start:t('2026-11-01T04:15:00Z'),end:t('2026-11-01T04:30:00Z'),finished:true},
 {id:'j1',emp:own,job:'12086',start:t('2026-11-01T04:30:00Z'),end:t('2026-11-01T09:00:00Z'),paused:true},
 {id:'j2',emp:own,job:'12086',start:t('2026-11-01T11:04:10Z'),end:t('2026-11-01T13:37:10Z'),paused:true},
 {id:'j3',emp:own,job:'12021',start:t('2026-11-01T13:37:32Z')},
 {id:'other',emp:'OTHER_EMP',job:'PRIVATE_321',start:t('2026-11-01T04:00:00Z'),end:t('2026-11-01T13:00:00Z'),finished:true}
];
const me={id:own,role:'Employee',name:'Synthetic employee'};
let html='',shared=null;
const win={AndroidBridge:{shareImageBase64:(name,url)=>{shared={name,url};}}};
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canvasCtx={fillRect(){},fillText(){},font:'',fillStyle:''};
const sandbox={window:win,me,state:{sessions,assign:[],workshopHolidays:[],jobs:[
 {no:'12086',make:'MAZDA',model:'CX9',year:'2023'},
 {no:'12021',make:'Chevrolet',model:'Tahoe',year:'2014'},
 {no:'PRIVATE_321',make:'PRIVATE',model:'NEVER_SHOW'}
]},H:'ID001',esc,Date,Intl,openModal:body=>{html=body;},
 document:{createElement:tag=>{assert.equal(tag,'canvas');return {getContext:()=>canvasCtx,toDataURL:()=> 'data:image/png;base64,SYNTH',width:0,height:0};}},
 alert:message=>{throw Error(message)}
};
vm.runInNewContext(script,sandbox,{filename:'employee-daily-report-source.js'});
win.v253OpenEmployeeDailyReport('2026-11-01','');
assert.match(html,/7 time events/,'matching Supervisor day events');
assert.match(html,/IDLE TIME: 00:15/,'08:00-08:15 idle');
assert.match(html,/08:15:00 AM/,'Oman 12-hour time');
assert.match(html,/03:04:10 PM/,'afternoon resume after lunch');
assert.match(html,/MAZDA CX9 2023/);
assert.match(html,/Chevrolet Tahoe 2014/);
assert.match(html,/Share Card/);
assert.doesNotMatch(html,/PRIVATE_321|PRIVATE NEVER_SHOW/,'another employee cannot leak to the report');
assert.equal(win.v253EmployeeShareData.rows.filter(e=>e.action==='IDLE').length,1);
assert.equal(win.v253EmployeeShareData.rows.filter(e=>e.action==='RESUME').length,3);
win.v253OpenEmployeeDailyReport('2026-11-01','12086');
assert.match(html,/4 time events/);
assert.doesNotMatch(html,/>12021</);
await win.v253ShareEmployeeDailyReport();
assert.equal(shared.name,'Zukait_Employee_Daily_Report_2026-11-01.png');
assert.match(shared.url,/^data:image\/png/);
me.role='Supervisor';win.v253OpenEmployeeDailyReport('2026-11-01');assert.match(html,/4 time events/,'Supervisor cannot open Employee report');
console.log('PASS Employee Daily Report: 7 time events, idle/lunch, Oman clock, role/owner, Job Card filter and PNG share');
