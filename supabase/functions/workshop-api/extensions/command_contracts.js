// Inactive Phase 1 contracts. No API route imports this module.
// Context/policy must come from the authenticated server, never request JSON.
export const EXTENSION_DEFAULTS=Object.freeze({mechanical:false,financeExpansion:false});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mechanicalOperations=new Set(['MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER','HOLD_SET','PROMISE_SET','MECHANICAL_QC']);
const financeOperations=new Set(['BILL_APPROVE','OPENING_APPROVE','CREDIT_APPROVE','PAYROLL_APPROVE']);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const identifier=x=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=128;
const denied=code=>({ok:false,code});
export function extensionCommandPreflight(command,context={},policy={}){
 if(!object(command)||!object(context)||!object(policy))return denied('invalid_contract');
 const domain=mechanicalOperations.has(command.operation)?'mechanical':financeOperations.has(command.operation)?'financeExpansion':null;
 if(!domain)return denied('unknown_extension_operation');
 if(policy.flags?.[domain]!==true)return denied('extension_disabled');
 const actor=context.actor;
 if(!object(actor)||!identifier(actor.id)||actor.active!==true)return denied('invalid_session');
 if(context.sessionCurrent!==true)return denied('session_changed');
 if(domain==='financeExpansion'&&context.online!==true)return denied('financial_write_requires_online');
 if(!uuid.test(command.requestId||'')||!identifier(command.entityId)||!identifier(command.deviceId)||!object(command.payload))return denied('invalid_command');
 if(!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0)return denied('invalid_revision');
 // Actor ownership comes only from the verified context; reject spoofed envelopes.
 if(command.actorId!==actor.id)return denied('actor_mismatch');
 if(domain==='mechanical'){
  if(!['Manager','Supervisor'].includes(actor.role))return denied('mechanical_forbidden');
  const capabilities=policy.mechanicalStaff?.[actor.id];
  if(!Array.isArray(capabilities)||!capabilities.includes(command.operation))return denied('mechanical_capability_required');
 }else{
  // Applies only to the new operations; ordinary financial rights are untouched.
  // Owner approved Accountant execution now, with configurable later policy.
  const roles=policy.financialApprovalRoles??['Accountant','Manager'];
  if(!Array.isArray(roles)||!roles.includes(actor.role)||!['Accountant','Manager'].includes(actor.role))return denied('financial_approval_forbidden');
 }
 return {ok:true,domain,actorId:actor.id,operation:command.operation,requestId:command.requestId,entityId:command.entityId,expectedRevision:command.expectedRevision};
}
// Amounts enter future domain transitions as exact integer OMR mills.
// This does not replace existing invoice/receipt/ledger projections.
export function validOMRMills(value){return Number.isSafeInteger(value)&&value>=0;}
export function checklistNumberFromAllocatedSequence(sequence,policy={}){
 if(!Number.isSafeInteger(sequence)||sequence<1)throw new Error('invalid_mc_sequence');
 // Pure display formatting only: allocation/retries remain a future atomic RPC.
 if(sequence===1)return 'MC001';
 if(!Number.isSafeInteger(policy.minimumDigits)||policy.minimumDigits<1||policy.minimumDigits>16)throw new Error('mc_number_policy_required');
 return 'MC'+String(sequence).padStart(policy.minimumDigits,'0');
}
