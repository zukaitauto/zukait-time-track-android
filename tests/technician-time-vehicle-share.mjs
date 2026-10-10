import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source=fs.readFileSync('app/src/main/assets/technician_workload.js','utf8');
const now=Date.parse('2026-10-10T09:00:00Z');
class Clock extends Date {
  constructor(...args){super(...(args.length?args:[now]));}
  static now(){return now;}
}
const elements=new Map(),drawn=[],shared=[];
const element=()=>({innerHTML:'',classList:{add(){}},onclick:null,onchange:null,focus(){},contains(){return true;}});
elements.set('modal',element());
const canvasContext={
  font:'',fillStyle:'',textAlign:'',textBaseline:'',
  beginPath(){},roundRect(){},fill(){},fillRect(){},
  measureText(text){return {width:String(text).length*10};},
  fillText(text){drawn.push(String(text));}
};
const canvas={width:0,height:0,getContext(){return canvasContext;},toDataURL(){return 'data:image/png;base64,aW1hZ2U=';}};
const makeSession=(id,job,start,end)=>({id,job,emp:'E1',start:Date.parse(start),end:Date.parse(end),paused:true});
const jobs=[
  {no:'12062',vehicle:'Toyota',make:'Toyota',model:'Camry',year:'2015'},
  {no:'12063',vehicle:'Ford',make:'Ford',model:'Mustang',year:'2022'},
  {no:'12064',vehicle:'Nissan',make:'Nissan',model:'Patrol',year:'2014'}
];
const state={jobs,assign:[],workshopHolidays:[],sessions:[
  makeSession('S1','12062','2026-10-10T04:00:00Z','2026-10-10T04:30:00Z'),
  makeSession('S2','12063','2026-10-10T05:00:00Z','2026-10-10T05:30:00Z'),
  makeSession('S3','12064','2026-10-10T07:00:00Z','2026-10-10T07:30:00Z'),
  makeSession('S4','ID001','2026-10-10T07:45:00Z','2026-10-10T08:00:00Z')
]};
const users=[{id:'E1',name:'Akhil',role:'Employee',department:'Denter'}];
let modalCalls=0;
const ctx={Date:Clock,users,state,me:{role:'Supervisor'},
  document:{
    hidden:false,head:{appendChild(){}},
    createElement(tag){return tag==='canvas'?canvas:element();},
    getElementById(id){return elements.get(id)||null;}
  },
  navigator:{share(){throw Error('native bridge should be used');},canShare(){return false;}},
  AndroidBridge:{shareImageBase64(filename,data){shared.push({filename,data});}},
  fmt:minutes=>String(minutes),
  empStatus(){return 'Paused';},
  totalForAssignment(){return 0;},
  setInterval(){return 1;},clearInterval(){},
  showSupervisorModal(title,html){
    modalCalls++;
    for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
    elements.get('twTimeDetails').innerHTML=html;
  }
};
ctx.window=ctx;
ctx.zukaitJobCardMaster={identity:no=>jobs.find(j=>j.no===String(no))||null};
vm.runInNewContext(source,ctx);

const unchanged=JSON.stringify(state);
ctx.openTechnicianTimeDetails('E1');
const html=elements.get('twTimeDetails').innerHTML;
assert.match(html,/<th>Vehicle<\/th>/);
assert.match(html,/Toyota Camry 2015/);
assert.match(html,/Ford Mustang 2022/);
assert.match(html,/Nissan Patrol 2014/);
assert.match(html,/Ideal Time/);
assert.match(html,/twTimeShare/);
assert.doesNotMatch(html,/Car Make/);

await elements.get('twTimeShare').onclick();
assert.equal(shared.length,1,'Supervisor share must call native AndroidBridge exactly once');
assert.match(shared[0].filename,/Zukait_Time_Details_Akhil_2026-10-10\.png/);
assert.match(shared[0].data,/^data:image\/png;base64,/);
assert.ok(drawn.includes('Vehicle'),'shared card needs Vehicle heading');
assert.ok(drawn.includes('Toyota Camry 2015'),'shared card must include complete vehicle');
assert.ok(drawn.includes('Ford Mustang 2022'),'shared card must include complete vehicle');
assert.ok(drawn.includes('Nissan Patrol 2014'),'shared card must include complete vehicle');
assert.ok(drawn.includes('Ideal Time'),'ID001 must be named');
assert.equal(JSON.stringify(state),unchanged,'rendering/sharing must not mutate time data');
ctx.me.role='Employee';ctx.openTechnicianTimeDetails('E1');
assert.equal(modalCalls,1,'Employee must not gain Supervisor reporting permissions');
console.log('Supervisor Time Details vehicle labels and native image sharing passed.');
