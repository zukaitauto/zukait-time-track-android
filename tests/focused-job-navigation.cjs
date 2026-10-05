const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('app/src/main/assets/workshop_overview.js','utf8');
let modal='',issuedJob='',paintRecord='';const clicks=[];
const state={jobs:[{no:'J1',vehicle:'Toyota <test>',reg:'123',jobType:'CASH',amount:45,finalInvoiceAmount:50,delivered:true,deliveredAt:Date.now()}],assign:[{id:'a1',job:'J1',emp:'e1',suggested:60,completed:true},{id:'a2',job:'J1',emp:'e2',suggested:30,rework:true,reason:'Repeat only'}],sessions:[],consumables:{issues:[],actuals:[]}};
const window={openModal:h=>{modal=h},closeModal(){},openConsumablesSavedList:(type,no)=>{issuedJob=no},openPaintSearch(){},paintRunSearch:id=>{paintRecord=id},v273RunningAttentionRows:()=>[{job:state.jobs[0],items:[{a:state.assign[1],reasons:['Over allocated']}]}]};
const document={addEventListener(type,fn){if(type==='click')clicks.push(fn)},createElement(){return{}},head:{appendChild(){}},body:{},getElementById(){return null},querySelector(){return null},querySelectorAll(){return[]}};
const ctx=vm.createContext({window,document,state,users:[{id:'e1',name:'Normal Worker'},{id:'e2',name:'Repeat Worker'}],me:{role:'Manager'},navigator:{onLine:true},MutationObserver:class{observe(){}},setTimeout:fn=>fn(),setInterval(){},Date,Intl,console,totalForAssignment:()=>15});
// Do not execute bootstrap callbacks in this DOM fixture.
ctx.setTimeout=()=>{};vm.runInContext(src,ctx);
function click(action,host=null){const b={dataset:{workshopAction:action,job:'J1',recordId:'po1'},closest:()=>host};for(const fn of clicks)fn({target:{closest:sel=>sel==='.wo-360-page'?null:sel==='[data-workshop-action]'||sel==='[data-workshop-action="'+action+'"]'?b:null},preventDefault(){},stopPropagation(){}})}
for(const name of ['zukaitOpenJob360','zukaitOpenJobReview360','openManagerJobDetails','openSupervisorJob','v68OpenJobDetail','v132OpenSupervisorJobFull']){window[name]('J1');assert.match(modal,/wo-focused-job/);assert.doesNotMatch(modal,/wo-360-page|Cost Summary|Profit \/ Loss|Full 360/)}
window.zukaitOpenCashDetails('J1');assert.match(modal,/Cash Details/);assert.match(modal,/OMR 45.000/);assert.doesNotMatch(modal,/Normal Worker|Repeat Worker|Production|Painting QC/);
window.zukaitOpenRepeatDetails('J1');assert.match(modal,/Repeat Worker/);assert.doesNotMatch(modal,/Normal Worker|Cash Amount/);
window.zukaitOpenCompletedDetails('J1');assert.match(modal,/Normal Worker/);assert.doesNotMatch(modal,/Repeat Worker/);
window.zukaitOpenRunningDetails('J1');assert.match(modal,/Repeat Worker/);assert.doesNotMatch(modal,/Normal Worker/);
window.zukaitOpenAttentionDetails('J1');assert.match(modal,/Over allocated/);assert.doesNotMatch(modal,/Cash Amount/);
click('detail-360');assert.match(modal,/wo-focused-job/);assert.doesNotMatch(modal,/wo-360-page/);
modal='unchanged';click('search-result-360');assert.equal(modal,'unchanged','full review requires actual search result container');
click('search-result-360',{dataset:{queue:'1'}});assert.equal(modal,'unchanged','unassigned queue cannot enter full review');
click('search-result-360',{dataset:{queue:'0'}});assert.match(modal,/wo-360-page/,'top search result opens full 360 review');
click('quick-suggested');assert.equal(issuedJob,'J1','suggested materials link stays on selected job');
assert.match(src,/>Search \+ 360 Degree<\/button>/);
assert.match(src,/type==='running'&&jobNo\?button\('Work Details','focused-running'/);
const qc=fs.readFileSync('app/src/main/assets/qc_delivery.js','utf8');const qcRoute=qc.slice(qc.indexOf('window.zukaitQCDetails='),qc.indexOf('\n',qc.indexOf('window.zukaitQCDetails=')));assert.match(qcRoute,/row\(j,mode\)/);assert.doesNotMatch(qcRoute,/openManagerJobDetails|openSupervisorJob/);
const cash=fs.readFileSync('app/src/main/assets/cash_monthly_pulse.js','utf8');assert.ok(!cash.includes('zukaitOpenJob360'));assert.match(cash,/zukaitOpenCashDetails/);
vm.runInContext('me={role:"Employee"}',ctx);modal='protected';window.zukaitOpenJob360('J1');click('search-result-360',{dataset:{queue:'0'}});assert.equal(modal,'protected');
console.log('Focused navigation passed: only top-search results open 360; legacy, cash, QC, work, repeat, completed, assignment and material routes stay focused.');
