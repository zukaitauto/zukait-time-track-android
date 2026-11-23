// Visual preview boundary only. Existing server authentication/authorization remains required.
(function(){'use strict';
 const data=window.ZUKAIT_VISUAL_PREVIEW_DATA;
 const invoiceRows=data.cash.rows.map(row=>({...row,invoice_number:row.job_card==='DEMO-001'?'INV-DEMO-001':''}));
 const pendingCard={job_card:'DEMO-003',registration:'DEMO 003',vehicle:'Example vehicle',customer:'Example customer 3'};
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
  else if(body.action==='accountant_report'&&body.report==='cash_invoices'){
   const {query='',month='',from='',to=''}=body.filters||{};
   const search=query.trim().toLowerCase();
   const matching=invoiceRows.filter(row=>
    (!search||[row.job_card,row.registration,row.vehicle,row.customer].some(value=>String(value||'').toLowerCase().includes(search)))&&
    (!month||from||to||row.invoice_date.startsWith(month))&&
    (!from||row.invoice_date>=from)&&(!to||row.invoice_date<=to));
   const offset=Number(body.offset)||0,limit=Number(body.limit)||25;
   result={...data.cash,rows:matching.slice(offset,offset+limit),total_count:matching.length,
    next_offset:offset+limit<matching.length?offset+limit:null,invoice_count:matching.length,
    invoice_total_omr:matching.reduce((sum,row)=>sum+Math.round(row.invoice_amount_omr*1000),0)/1000,
    period_month:from||to?'':month};
  }
  else if(body.action==='accountant_report'&&body.report==='cash')result=data.ledger;
  else throw Error(message);
  return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(result))};
 };
 let openingCashOut=false;
 function openInvoiceEntry(trigger){
  let dialog=document.getElementById('preview-invoice-entry');
  if(!dialog){
   dialog=document.createElement('dialog');
   dialog.id='preview-invoice-entry';
   dialog.setAttribute('aria-labelledby','preview-invoice-title');
   dialog.style.cssText='width:min(540px,calc(100% - 24px));max-width:100%;padding:20px;border:1px solid #b6c6da;border-radius:16px;color:#17263b;background:#fff;box-sizing:border-box';
   dialog.innerHTML=`<h2 id="preview-invoice-title">Cash Entry</h2>
    <p>Sample data · changes reset on refresh</p>
    <style>#preview-invoice-entry label{display:block;margin:10px 0 4px;font-weight:700}#preview-invoice-entry input,#preview-invoice-entry select{width:100%;box-sizing:border-box;min-height:42px}#preview-invoice-entry .entry-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:0 12px}</style>
    <div class="entry-fields">
     <div><label for="preview-invoice-date">Invoice date</label><input id="preview-invoice-date" type="date" required></div>
     <div><label for="preview-jc-search">Find Job Card</label><input id="preview-jc-search" type="search" placeholder="JC, registration or customer"></div>
    </div>
    <label for="preview-jc">Cash Job Card</label><select id="preview-jc" required></select>
    <p id="preview-invoice-customer"></p>
    <div class="entry-fields">
     <div><label for="preview-invoice-number">Invoice number</label><input id="preview-invoice-number" maxlength="80" required></div>
     <div><label for="preview-invoice-amount">Amount (OMR)</label><input id="preview-invoice-amount" type="number" min="0.001" max="1000000" step="0.001" required></div>
    </div>
    <p id="preview-invoice-status" role="status" style="background:#eaf2fc;color:#17395b;padding:10px;border-radius:8px"></p>
    <p><button type="button" id="preview-invoice-save">Save sample invoice</button> <button type="button" id="preview-open-cash-out">Cash Out</button> <button type="button" id="preview-invoice-close">Close</button></p>`;
   document.body.append(dialog);
   const field=id=>document.getElementById('preview-'+id);
   const select=field('jc'),search=field('jc-search'),date=field('invoice-date');
   const number=field('invoice-number'),amount=field('invoice-amount'),status=field('invoice-status');
   const omanToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Muscat',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   function renderSelection(){
    const row=invoiceRows.find(item=>item.job_card===select.value);
    const card=row||(select.value===pendingCard.job_card?pendingCard:null);
    date.value=row?.invoice_date||omanToday();
    number.value=row?.invoice_number||'';
    amount.value=row?row.invoice_amount_omr.toFixed(3):'';
    amount.readOnly=Boolean(row);
    field('invoice-customer').textContent=card?[card.customer,card.vehicle,card.registration].join(' · '):'';
    status.textContent=row?'Existing Job Card amount loaded. You can correct the date and enter the invoice number.':
      card?'No invoice amount recorded. Enter the amount for this Cash Job Card.':'Select a Cash Job Card to load its details.';
   }
   function renderChoices(){
    const query=search.value.trim().toLowerCase(),selected=select.value;
    const cards=invoiceRows.some(row=>row.job_card===pendingCard.job_card)?invoiceRows:[...invoiceRows,pendingCard];
    const matches=cards.filter(row=>[row.job_card,row.registration,row.customer].some(value=>value.toLowerCase().includes(query)));
    select.replaceChildren(new Option(matches.length?'Select Cash Job Card':'No matching Job Cards',''),...matches.map(row=>new Option(row.job_card+' · '+row.vehicle,row.job_card)));
    if(matches.some(row=>row.job_card===selected))select.value=selected;
    renderSelection();
   }
   search.addEventListener('input',renderChoices);
   select.addEventListener('change',renderSelection);
   field('invoice-save').onclick=()=>{
    const row=invoiceRows.find(item=>item.job_card===select.value);
    const card=row||(select.value===pendingCard.job_card?pendingCard:null);
    if(!card){status.textContent='Select a Cash Job Card.';return}
    const invoiceNumber=number.value.trim();
    if(!invoiceNumber){status.textContent='Enter an invoice number.';number.focus();return}
    if(!date.reportValidity()||!amount.reportValidity())return;
    if(invoiceRows.some(item=>item!==row&&item.invoice_number.toLowerCase()===invoiceNumber.toLowerCase())){
     status.textContent='This invoice number is already used by another Job Card.';return;
    }
    const entry={invoice_number:invoiceNumber,invoice_date:date.value,date:date.value,invoice_amount_omr:row?.invoice_amount_omr??amount.valueAsNumber};
    if(row)Object.assign(row,entry);
    else invoiceRows.push({...card,...entry,source:'Final Cash invoice'});
    renderSelection();
    status.textContent='Sample invoice saved. The register counts this Job Card once.';
    document.getElementById('refresh').click();
   };
   field('invoice-close').onclick=()=>dialog.close();
   field('open-cash-out').onclick=()=>{
    dialog.close();
    openingCashOut=true;
    try{trigger.click()}finally{openingCashOut=false}
    document.getElementById('entry-title').textContent='Cash Out';
    const kind=document.getElementById('kind');
    if(kind){kind.value='CASH_OUT';kind.dispatchEvent(new Event('change',{bubbles:true}));kind.disabled=true}
   };
   dialog.addEventListener('close',()=>{search.value='';select.value='';renderChoices()});
   renderChoices();
  }
  dialog.showModal();
 }
 document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();const out=document.getElementById('preview-status');if(out)out.textContent=message;},true);
 document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.id==='cash-entry'&&!openingCashOut){
   event.preventDefault();event.stopImmediatePropagation();openInvoiceEntry(button);return;
  }
  const blocked=['logout','account-menu-logout','account-password','account-save-password','account-exit','manager-back','retry-pending','discard-pending'];
  const module=button.closest('#navigation')&&button.dataset.report;
  const summary=button.closest('#summary');
  if(blocked.includes(button.id)||(module&&module!=='cash')||(summary&&button.dataset.report!=='cash')||button.hasAttribute('data-adjust')||button.hasAttribute('data-reverse')){event.preventDefault();event.stopImmediatePropagation();document.getElementById('preview-status').textContent=message;}
 },true);
})();
