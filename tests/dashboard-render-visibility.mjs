import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const start=html.indexOf('function render(){');
const end=html.indexOf('function renderEmployee(){',start);
assert.ok(start>=0&&end>start);

const makeElement=()=>{
  const classes=new Set(['hidden']);
  const changes=[];
  const element={
    classList:{
      contains:name=>classes.has(name),
      add:name=>{changes.push(['add',name]);classes.add(name)},
      remove:name=>{changes.push(['remove',name]);classes.delete(name)},
      toggle:(name,force)=>{changes.push(['toggle',name,force]);if(force)classes.add(name);else classes.delete(name)}
    },style:{},dataset:{},textContent:'',changes,
    get innerHTML(){return this._html||''},
    set innerHTML(value){this._html=value;changes.push(['innerHTML'])}
  };
  return element;
};
const elements=Object.fromEntries(['employeeView','supervisorView','managerView','legacyAppHeader','welcome','globalBrandHeader','supervisorHeaderMenu','headerOnlineStatus','headerOnlineText','net'].map(id=>[id,makeElement()]));
const context={
  document:{body:makeElement(),getElementById:id=>elements[id]},
  navigator:{onLine:true},me:{name:'Tester',role:'Employee'},
  employeeClockTimer:null,liveSupervisorTimer:null,clearInterval:()=>{},
  renderEmployee:()=>{},renderSupervisor:()=>{},renderManager:()=>{},
  window:{},setTimeout:()=>{}
};
vm.runInNewContext(html.slice(start,end),context);

for(const [role,visible] of [['Employee','employeeView'],['Supervisor','supervisorView'],['Manager','managerView'],['Purchaser','managerView']]){
  context.me.role=role;
  context.render();
  for(const id of ['employeeView','supervisorView','managerView']){
    assert.equal(elements[id].classList.contains('hidden'),id!==visible,role+' must show only its role view');
  }
  const mutations=elements[visible].changes.length;
  context.render();
  assert.equal(elements[visible].changes.length,mutations,role+' refresh must never hide its active dashboard');
}
console.log('Dashboard render visibility: all roles stay visible during refresh');
