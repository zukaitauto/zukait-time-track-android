import assert from 'node:assert/strict';
import {validateMechanicalInspection,INSPECTION_FUNCTIONS} from '../supabase/functions/workshop-api/extensions/mechanical_inspection_contract.js';
const good=()=>({jobType:'CASH',vehicle:{registration:'1234 AB',make:'Toyota',model:'Camry',year:'2022',customer:'Test customer',contact:'90000000',odometerKm:12345},damageMarks:[{part:'Rear bumper',mark:'X'}],functions:Object.fromEntries(INSPECTION_FUNCTIONS.map(k=>[k,{status:'NOT_CHECKED'}])),workDescription:'Inspect rear bumper'});
assert.deepEqual(validateMechanicalInspection(good()),{ok:true});
for(const type of ['INSURANCE','',null]){const x=good();x.jobType=type;assert.equal(validateMechanicalInspection(x).ok,false)}
for(const mark of ['Z','',null]){const x=good();x.damageMarks[0].mark=mark;assert.equal(validateMechanicalInspection(x).ok,false)}
{const x=good();x.functions.horn={status:'ISSUE'};assert.equal(validateMechanicalInspection(x).code,'invalid_function_checks')}
{const x=good();x.functions.horn={status:'ISSUE',note:'Horn not working'};assert.equal(validateMechanicalInspection(x).ok,true)}
{const x=good();x.vehicle.odometerKm=-1;assert.equal(validateMechanicalInspection(x).code,'invalid_odometer')}
{const x=good();x.workDescription=' ';assert.equal(validateMechanicalInspection(x).code,'invalid_work_description')}
{const x=good();x.extra='unknown';assert.equal(validateMechanicalInspection(x).code,'invalid_inspection')}

// Additional contract regression coverage before persistence/API activation.
{const x=good();x.jobType='CREDIT';x.vehicle.vin='JTNB11HK0K3000001';assert.deepEqual(validateMechanicalInspection(x),{ok:true})}
for(const mark of ['X','S','M']){const x=good();x.damageMarks[0].mark=mark;assert.equal(validateMechanicalInspection(x).ok,true)}
for(const key of INSPECTION_FUNCTIONS){const x=good();delete x.functions[key];assert.equal(validateMechanicalInspection(x).code,'invalid_function_checks')}
{const x=good();x.functions.horn={status:'ISSUE',note:'   '};assert.equal(validateMechanicalInspection(x).code,'invalid_function_checks')}
{const x=good();x.vehicle.odometerKm=1000000000;assert.equal(validateMechanicalInspection(x).code,'invalid_odometer')}
{const x=good();x.vehicle.extra='not allowed';assert.equal(validateMechanicalInspection(x).code,'invalid_vehicle')}

for(const vin of ['123','JTNB11HK0K300000I','JTNB11HK0K300000O','JTNB11HK0K300000Q']){const x=good();x.vehicle.vin=vin;assert.equal(validateMechanicalInspection(x).code,'invalid_vin')}
{const x=good();x.vehicle.vin='jtnb11hk0k3000001';assert.equal(validateMechanicalInspection(x).ok,true)}
for(const year of ['abcd','22','0000','1885','9999']){const x=good();x.vehicle.year=year;assert.equal(validateMechanicalInspection(x).code,'invalid_vehicle_year')}
console.log('PASS inactive Mechanical inspection contract: valid details, Cash/Credit only, damage marks, functional issues, KM and unknown-field rejection');
