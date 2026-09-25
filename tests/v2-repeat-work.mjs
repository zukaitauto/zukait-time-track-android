import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync('app/src/main/assets/v2/features/repeat/rules.js','utf8');
const ctx={window:{},Date};vm.createContext(ctx);vm.runInContext(src,ctx);
const r=ctx.window.zukaitV2.repeat;
const originals=[{id:'a1',job:'JC1',emp:'E1',completed:true,rework:false}];
const input={job:'JC1',employeeId:'E2',mistakeEmployeeId:'E1',suggestedMinutes:60,reason:'Paint defect'};
let x=r.buildAssignment(input,{assignments:originals,actorId:'SUP1',at:100,id:'r1',auditId:'log1'});
if(!x.ok) throw new Error('valid repeat rejected');
if(!x.assignment.rework||x.assignment.emp!=='E2'||x.assignment.mistakeEmp!=='E1'||x.assignment.repeatSameEmployee) throw new Error('assignment parity failed');
if(x.audit.assignmentId!=='r1'||x.audit.by!=='SUP1'||x.audit.reason!=='Paint defect') throw new Error('audit parity failed');
if(r.validate({...input,reason:''},{assignments:originals}).code!=='REASON_REQUIRED') throw new Error('reason gate failed');
if(r.validate(input,{assignments:[{...originals[0],completed:false}]}).code!=='ORIGINAL_NOT_FINISHED') throw new Error('finish gate failed');
if(r.validate(input,{assignments:[...originals,{job:'JC1',rework:true,completed:false}]}).code!=='REPEAT_ALREADY_OPEN') throw new Error('duplicate gate failed');
x=r.buildAssignment({...input,employeeId:'E1'},{assignments:originals,actorId:'SUP1',at:101});
if(!x.assignment.repeatSameEmployee) throw new Error('same employee flag failed');
const deduction=r.incentiveDeductionMinutes([
 {rework:true,mistakeEmp:'E1',suggested:60},
 {rework:true,mistakeEmp:'E1',actualMinutes:45,suggested:60},
 {rework:true,mistakeEmp:'E2',suggested:90},
 {rework:false,mistakeEmp:'E1',suggested:100},
 {rework:true,mistakeEmp:'E1',suggested:30,cancelled:true}
],'E1');
if(deduction!==105) throw new Error('mistake employee deduction failed: '+deduction);
console.log('V2 repeat work parity tests passed');
