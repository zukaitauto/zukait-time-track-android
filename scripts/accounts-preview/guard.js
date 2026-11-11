// Visual preview boundary only. Existing server authentication/authorization remains required.
(function(){'use strict';
 const data=window.ZUKAIT_VISUAL_PREVIEW_DATA;
 const memory=new Map([['zukait_secure_session_v42',JSON.stringify({user:data.user,token:'VISUAL-PREVIEW-NOT-A-REAL-SESSION'})]]);
 Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}});
 window.ZUKAIT_ACCOUNTANT_CONFIG={url:'https://visual-preview.invalid',key:'NOT-A-REAL-KEY',billsEnabled:false};
 const message='Visual preview only: example data. Saving and other modules are disabled. Use the workshop app for normal work.';
 window.fetch=async function(input,options={}){
  let body;try{body=JSON.parse(options.body||'{}')}catch{throw Error(message)}
  let result;
  if(body.action==='session')result={ok:true,user:data.user};
  else if(body.action==='accountant_dashboard')result=data.dashboard;
  else if(body.action==='accountant_jc_detail')result=data.detail;
  else if(body.action==='accountant_report'&&body.report==='cash_invoices')result=data.cash;
  else if(body.action==='accountant_report'&&body.report==='cash')result=data.ledger;
  else throw Error(message);
  return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(result))};
 };
 document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();const out=document.getElementById('preview-status');if(out)out.textContent=message;},true);
 document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  const blocked=['logout','account-menu-logout','account-password','account-save-password','account-exit','manager-back','retry-pending','discard-pending'];
  const module=button.closest('#navigation')&&button.dataset.report;
  const summary=button.closest('#summary');
  if(blocked.includes(button.id)||(module&&module!=='cash')||summary||button.hasAttribute('data-adjust')||button.hasAttribute('data-reverse')){event.preventDefault();event.stopImmediatePropagation();document.getElementById('preview-status').textContent=message;}
 },true);
})();
