(function(){'use strict';
 let rc='';
 const key=()=>{if(!window.me?.id)throw Error('Sign in first.');return 'zukait_reception_estimate_pending:'+window.zukaitReception.endpoint+':'+window.me.id;};
 async function call(command){return window.zukaitReception.action({action:'reception_estimate',command});}
 async function saved(command){const storage=key();let previous=localStorage.getItem(storage);
  if(previous){const old=JSON.parse(previous);if(JSON.stringify({...command,request_id:old.request_id})!==previous)throw Error('Confirm the saved Estimate action before changing its details.');command=old;}
  else{previous=JSON.stringify(command);localStorage.setItem(storage,previous);if(localStorage.getItem(storage)!==previous)throw Error('Could not retain the Estimate retry.');}
  try{const result=await call(command);
   if(command.operation==='ALLOCATE'&&!result.estimate?.estimate_no)throw Error('The response did not confirm the saved Estimate number. Retry the original action.');
   if(command.operation==='SAVE'&&(result.estimate?.id!==command.estimate.id||result.estimate?.estimateNo!==command.estimate.estimateNo||result.estimate?.receptionNo!==command.rc_no||result.estimate?.revision!==Number(command.expected_revision)+1))throw Error('The response did not confirm the saved Estimate. Retry the original action.');
   if(localStorage.getItem(storage)===previous)localStorage.removeItem(storage);return result;}
  catch(e){if(['reception_stale_revision','reception_case_closed','reception_invalid_estimate'].includes(e.code))localStorage.removeItem(storage);throw e;}
 }
 async function prepare(no){rc=no;
  if(!window.state)window.state={jobs:[],estimates:[],estimateAudit:[]};
  const pending=localStorage.getItem(key());if(pending){if(!window.confirm('A saved Estimate action needs confirmation. Retry its original details now?'))throw Error('Confirm the saved Estimate action before creating or editing another estimate.');const command=JSON.parse(pending);const result=await saved(command);if(result.estimate?.id)window.state.estimates.push(result.estimate);}
  const result=await call({operation:'GET',rc_no:no});
  const ids=new Set(result.estimates.map(e=>e.id));window.state.estimates=window.state.estimates.filter(e=>!ids.has(e.id)).concat(result.estimates);
  window.zukaitCloud={allocateEstimateNo:async client=>{const result=await saved({operation:'ALLOCATE',rc_no:rc,client_key:client,request_id:crypto.randomUUID()});return result.estimate;}};
 }
 async function save(estimate,expected){const result=await saved({operation:'SAVE',rc_no:estimate.receptionNo,client_key:estimate.id,estimate,expected_revision:expected,request_id:crypto.randomUUID()});return result.estimate;}
 window.zukaitReceptionEstimate={prepare,save};
})();
