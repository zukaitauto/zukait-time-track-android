// ZUKAIT Mechanical Consumables — Return UNUSED original issue quantities.
// Dedicated Mechanical Supervisor host; no Painting or workshop-state reads.
// One original issue line, quantity and reason. Server locks original cost.
export async function mountMechanicalConsumablesReturns(root,options={}){
 const doc=root.ownerDocument;
 const start=options.getSession?.();
 let closed=false,busy=false,lines=[],page=0,hasMore=false,pending=null;
 const state={};
 const storage=options.storage;
 const key='zukait_mechanical_return_pending_v1:'+String(start?.id||'');
 const sameUser=()=>!closed&&options.isEnabled?.()!==false&&
    options.getSession?.()?.id===start?.id&&
    options.getSession?.()?.role==='Mechanical Supervisor'&&
    options.getSession?.()?.key===start?.key;
 const ready=()=>sameUser()&&options.stockEnabled?.()===true&&
    typeof options.stockRequest==='function';
 const element=(tag,caption='',type='')=>{
   const n=doc.createElement(tag);n.textContent=caption;
   if(type)n.type=type;return n;
 };
 const button=(caption,action)=>{
   const n=element('button',caption,'button');
   n.addEventListener('click',action);return n;
 };
 const addLabel=(parent,name,input)=>{
   const l=element('label',name);l.style.display='block';
   l.style.margin='12px 0 4px';l.style.fontWeight='600';
   l.append(input);parent.append(l);
 };
 const show=(message)=>{state.message.textContent=message};
 const id=()=>{
   const raw=String(options.uuid?.()||globalThis.crypto?.randomUUID?.()||
      'return-'+Date.now()+'-'+Math.random().toString(36).slice(2));
   return raw.replace(/[^a-zA-Z0-9_.:-]/g,'');
 };
 function saved(){
   try{
     const v=JSON.parse(storage?.getItem(key)||'null');
     return v?.owner===start.id&&v?.requestId&&
       v?.data?.lineId&&v?.data?.reason&&v?.data?.quantity?v:null;
   }catch{return null}
 }
 function persist(data){
   if(!storage?.setItem)throw Error('Safe retry storage unavailable.');
   const next={owner:start.id,requestId:id(),data};
   storage.setItem(key,JSON.stringify(next));return next;
 }
 function renderLines(){
   state.line.replaceChildren();
   for(const x of lines){
     const remaining=Number(x.availableToReturn);
     const n=element('option',x.name+' · '+x.brand+' · '+remaining+' '+x.unit+' to return');
     n.value=String(x.lineId);state.line.append(n);
   }
   const hasItems=lines.length>0;
   state.empty.textContent=hasItems?'':'No unreturned Mechanical issues found for this Job Card.';
   state.more.hidden=!hasMore;
   refreshLimit();
   update();
 }
 function selected(){
   return lines.find(x=>String(x.lineId)===state.line.value)||null;
 }
 function refreshLimit(){
   const x=selected();
   state.remaining.textContent=x?'Remaining from this issue: '+Number(x.availableToReturn)+' '+x.unit:
     'Select an issued material above.';
   state.qty.step=x?.unit==='Piece'?'1':'0.0001';
 }
 function update(){
   const locked=busy||!!pending||!ready();
   state.jc.disabled=locked;
   state.find.disabled=locked;
   state.line.disabled=locked;
   state.qty.disabled=locked;
   state.reason.disabled=locked;
   state.submit.disabled=locked||lines.length===0;
   state.retry.hidden=!pending;
   state.retry.disabled=busy||!ready();
   state.more.disabled=locked;
   if(pending)state.pending.textContent='Unconfirmed return for '+pending.data.jobCard+
     ' (line '+pending.data.lineId+'). Retry the SAME return; do not enter a new one.';
   else state.pending.textContent='';
 }
 async function find(pageNo=0){
   if(!ready()||busy||pending)return;
   const jc=String(state.jc.value||'').trim().toUpperCase();
   if(!/^[A-Z0-9_. -]{1,36}$/.test(jc)){show('Enter a valid Mechanical Job Card number.');return}
   if(!Number.isInteger(pageNo)||pageNo<0||pageNo>49)return;
   busy=true;update();show('Finding issued materials…');
   try{
     const r=await options.stockRequest({operation:'MECHANICAL_RETURNABLE',jobCard:jc,page:pageNo});
     if(!sameUser())return;
     if(r?.ok!==true||!Array.isArray(r.returnable?.items))throw Error(r?.code||'Issued material list unavailable');
     lines=r.returnable.items;
     page=pageNo;hasMore=r.returnable.hasMore===true;
     renderLines();show(lines.length?'Choose the original issued line and unused quantity.':
       'Nothing available to return on this page.');
   }catch(e){if(sameUser())show(String(e?.message||e))}
   finally{busy=false;if(sameUser())update()}
 }
 async function sendPending(){
   if(!ready()||!pending||busy)return;
   busy=true;update();show('Checking return receipt…');
   try{
     const copy=pending;
     const r=await options.stockRequest({
       operation:'WRITE',command:'MECHANICAL_RETURN',requestId:copy.requestId,data:copy.data
     });
     if(!sameUser())return;
     if(r?.ok!==true||r.receipt?.final!==true||
        String(r.receipt.lineId)!==String(copy.data.lineId)||
        String(r.receipt.jobCard)!==String(copy.data.jobCard)||
        Number(r.receipt.quantity)!==Number(copy.data.quantity)){
       throw Error(r?.code||'Return receipt not confirmed');
     }
     storage?.removeItem(key);pending=null;
     show('RETURNED · '+copy.data.quantity+' · Cost credited '+Number(r.receipt.credit||0).toFixed(3)+' OMR');
     // No full-state refresh. The selected JC list can be refreshed manually.
     lines=[];page=0;hasMore=false;renderLines();
     state.empty.textContent='Tap Find issued materials to refresh remaining returnable quantities.';
   }catch(e){if(sameUser())show('Return not confirmed. Retry the SAME request. '+String(e?.message||e))}
   finally{busy=false;if(sameUser())update()}
 }
 async function submit(){
   if(!ready()||busy||pending)return;
   const selectedLine=selected();
   if(!selectedLine){show('Choose an original issued material first.');return}
   const jc=String(state.jc.value||'').trim().toUpperCase();
   if(String(selectedLine.jobCard)!==jc){show('Job Card mismatch. Find its issued lines again.');return}
   const raw=String(state.qty.value||'').trim(),quantity=Number(raw);
   if(!raw||!Number.isFinite(quantity)||quantity<=0||
      !Number.isInteger(quantity*10000)){
     show('Enter a valid return quantity.');return;
   }
   if(selectedLine.unit==='Piece'&&!Number.isInteger(quantity)){
     show('Return whole pieces only.');return;
   }
   if(quantity>Number(selectedLine.availableToReturn)){
     show('Return quantity exceeds the amount originally issued.');return;
   }
   const reason=String(state.reason.value||'').trim();
   if(reason.length<5||reason.length>180){show('Enter a short reason (5–180 characters).');return}
   if(options.online?.()===false){show('Offline. No return has been saved.');return}
   const data={lineId:selectedLine.lineId,jobCard:jc,quantity,reason};
   try{pending=persist(data)}
   catch(e){show(String(e?.message||e));return}
   await sendPending();
 }
 if(start?.role!=='Mechanical Supervisor'||!start?.id||!start?.key){
   root.replaceChildren(element('p','Mechanical Supervisor access required.'));
   return {destroy(){root.replaceChildren()}};
 }
 const shell=element('section');shell.style.maxWidth='760px';shell.style.margin='auto';
 shell.append(button('← Mechanical Consumables',()=>{if(!busy)options.onBack?.()}));
 shell.append(element('h2','Return Materials'));
 shell.append(element('p','Return only unused materials previously issued to a Mechanical Job Card. Cost is credited at the original issue price.'));
 if(!ready()){
   shell.append(element('p','Mechanical stock returns are not activated. No materials have changed.'));
   root.replaceChildren(shell);
   return {destroy(){closed=true;root.replaceChildren()}};
 }
 pending=saved();
 state.jc=element('input');state.jc.id='mc-return-jc';state.jc.placeholder='Mechanical JC number';
 state.find=button('Find issued materials',()=>find(0));
 state.line=element('select');state.line.id='mc-return-line';
 state.line.addEventListener('change',refreshLimit);
 state.qty=element('input');state.qty.type='number';state.qty.min='0.0001';state.qty.step='0.0001';state.qty.id='mc-return-qty';
 state.reason=element('input');state.reason.id='mc-return-reason';state.reason.placeholder='Why unused?';
 state.remaining=element('p','Select an issued material above.');
 state.empty=element('p');state.more=button('Next 20',()=>find(page+1));state.more.hidden=true;
 state.submit=button('RETURN MATERIAL',submit);state.retry=button('Retry unconfirmed return',sendPending);state.retry.hidden=true;
 state.pending=element('p');state.message=element('p');state.message.setAttribute('role','status');
 addLabel(shell,'Mechanical Job Card',state.jc);shell.append(state.find);
 addLabel(shell,'Original issued material / brand',state.line);shell.append(state.remaining,state.empty);
 addLabel(shell,'Unused quantity',state.qty);addLabel(shell,'Reason',state.reason);
 shell.append(state.submit,state.retry,state.more,state.pending,state.message);
 root.replaceChildren(shell);
 if(pending){
   state.jc.value=pending.data.jobCard;
   show('Return pending confirmation. Retry the same request, even after reopening this screen.');
 }
 update();
 return {destroy(){closed=true;root.replaceChildren()}};
}
