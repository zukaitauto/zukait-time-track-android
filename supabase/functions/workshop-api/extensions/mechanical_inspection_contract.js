// Draft-only Mechanical inspection contract. Not wired to the production API.
// Keep this separate from the existing MC_CREATE payload until persistence is migrated.
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const string=(x,max)=>typeof x==='string'&&x.length<=max;
const fields=(x,allowed)=>plain(x)&&Object.keys(x).every(k=>allowed.includes(k));
export const INSPECTION_FUNCTIONS=Object.freeze(['lights','wipers','powerWindows','centralLocking','mirrors','horn','dashboardWarning','airConditioning']);
export const INSPECTION_MARKS=Object.freeze(['X','S','M']);
export function validateMechanicalInspection(value){
 if(!fields(value,['jobType','vehicle','damageMarks','functions','workDescription']))return {ok:false,code:'invalid_inspection'};
 if(!['CASH','CREDIT'].includes(value.jobType))return {ok:false,code:'invalid_mechanical_job_type'};
 const v=value.vehicle;
 if(!fields(v,['registration','make','model','year','vin','odometerKm','customer','contact']))return {ok:false,code:'invalid_vehicle'};
 for(const k of ['registration','make','model','year','customer','contact'])if(!string(v[k],120)||!v[k].trim())return {ok:false,code:'invalid_vehicle'};
 if(v.vin!==undefined&&(typeof v.vin!=='string'||(v.vin.trim()!==''&&!/^[A-HJ-NPR-Z0-9]{17}$/.test(v.vin.trim().toUpperCase()))))return {ok:false,code:'invalid_vin'};
 if(v.odometerKm!==undefined&&(!Number.isFinite(v.odometerKm)||v.odometerKm<0||v.odometerKm>999999999))return {ok:false,code:'invalid_odometer'};
 if(!string(value.workDescription,2000)||value.workDescription.trim().length===0)return {ok:false,code:'invalid_work_description'};
 if(!Array.isArray(value.damageMarks)||value.damageMarks.length>100)return {ok:false,code:'invalid_damage_marks'};
 for(const mark of value.damageMarks)if(!fields(mark,['part','mark'])||!string(mark.part,80)||!mark.part.trim()||!INSPECTION_MARKS.includes(mark.mark))return {ok:false,code:'invalid_damage_marks'};
 if(!fields(value.functions,INSPECTION_FUNCTIONS))return {ok:false,code:'invalid_function_checks'};
 for(const k of INSPECTION_FUNCTIONS){const c=value.functions[k];if(!fields(c,['status','note'])||!['OK','ISSUE','NOT_CHECKED'].includes(c.status)||c.note!==undefined&&!string(c.note,300)||c.status==='ISSUE'&&(!string(c.note,300)||!c.note.trim()))return {ok:false,code:'invalid_function_checks'};}
 return {ok:true};
}
