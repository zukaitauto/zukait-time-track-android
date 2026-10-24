import {mechanicalDocumentHtml} from './mechanical_document.js';
// Explicit foreground export. No polling, storage, signatures or business writes.
export function mountMechanicalDocumentExport(root,options={}){
 root.style.overflowWrap='anywhere';root.style.maxWidth='100%';
 const doc=root.ownerDocument,who=()=>options.getSession?.(),initial=who(),identity=s=>JSON.stringify([s?.id,s?.role,s?.key]),owner=identity(initial);
 let disposed=false,busy=false,prepared=null;
 const current=()=>!disposed&&root.isConnected&&identity(who())===owner&&options.enabled===true&&(options.isEnabled?.()??true)===true;
 const online=()=>options.online?.()!==false;
 const node=(tag,text)=>{const e=doc.createElement(tag);e.textContent=text;return e},status=node('p','');status.setAttribute('role','status');
 root.replaceChildren(node('h2','Unpriced Mechanical checklist'),node('p','Prepare a current A4 snapshot. Signatures are optional. This copy contains no prices.'),status);
 const actions=node('div','');root.append(actions);
 const message=e=>e?.message==='mechanical_document_changed'?'The checklist changed. Close this view, refresh the checklist and prepare it again.':'Unable to confirm this export. Reconnect or sign in again, then retry.';
 const input={checklistId:options.checklistId,expectedRevision:options.expectedRevision,expectedWorkshopRevision:options.expectedWorkshopRevision};
 function check(){if(!current())throw Error('session_changed');if(!online())throw Error('OFFLINE')}
 async function verify(){check();const r=await options.api({action:'mechanical_document_verify',...input});check();if(r?.ok!==true||r.checklistId!==input.checklistId||r.recordsRevision!==input.expectedRevision||r.workshopRevision!==input.expectedWorkshopRevision)throw Error('mechanical_document_changed')}
 function button(label,fn){const b=node('button',label);b.type='button';b.style.minHeight='44px';b.style.margin='6px';b.onclick=async()=>{if(busy)return;busy=true;for(const x of actions.querySelectorAll('button'))x.disabled=true;try{check();await fn()}catch(e){prepared=null;actions.replaceChildren();addPrepare();status.textContent=message(e)}finally{busy=false;for(const x of actions.querySelectorAll('button'))x.disabled=!current()}};actions.append(b)}
 function addPrepare(){button('Prepare PDF',async()=>{
  const r=await options.api({action:'mechanical_document',...input});check();if(!r?.ok)throw Error(r?.code||'NETWORK');if(r.checklistId!==input.checklistId)throw Error('mechanical_document_changed');
  if(r.document?.recordsRevision!==input.expectedRevision||r.document?.workshopRevision!==input.expectedWorkshopRevision)throw Error('mechanical_document_changed');
  const html=mechanicalDocumentHtml(r.document),name=(String(r.document.checklistNumber)+'_Unpriced.pdf').replace(/[^A-Za-z0-9._-]/g,'_');
  const file=options.native?null:await options.generate(html,name);check();await verify();prepared={html,name,file};
  actions.replaceChildren();status.textContent='Checklist ready: '+r.document.checklistNumber+' · JC '+r.document.jobCard;
  if(!options.native)button('Download PDF',async()=>{await verify();options.download(prepared.file)});
  if(options.native||options.canShare?.(file))button('Share PDF',async()=>{await verify();await options.share(prepared)});
 })}
 if(options.enabled===true&&['Manager','Supervisor'].includes(initial?.role)&&initial?.id&&initial?.key&&typeof options.api==='function')addPrepare();else status.textContent='Checklist export is unavailable.';
 return {destroy(){disposed=true;prepared=null;root.replaceChildren()}};
}
