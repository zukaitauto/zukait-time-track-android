(function(){'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let section='jobs',filters={},page=0,result,serial=0;
 function role(){return window.me?.role||'';}
 function style(){if(document.getElementById('ins-style'))return;const s=document.createElement('style');s.id='ins-style';s.textContent=`
 .ins-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.ins-summary button{background:#e2f5f1!important;color:#124e59!important;text-align:left;padding:16px;border:1px solid #aed6d0!important}.ins-summary b{display:block;font-size:25px}.ins-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.ins-table{width:100%;border-collapse:collapse;background:#fff}.ins-table th,.ins-table td{text-align:left;padding:12px;border-bottom:1px solid #d4e3ea;overflow-wrap:anywhere}.ins-table th{background:#153e53;color:#fff}.ins-table button{font-weight:800}.ins-history{white-space:pre-wrap}.ins-toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:15px 0}
 @media(max-width:800px){.ins-summary,.ins-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.ins-table,.ins-table tbody,.ins-table tr,.ins-table td{display:block}.ins-table thead{display:none}.ins-table tr{margin:12px 0;padding:12px;border:1px solid #c3dbe5;border-radius:14px}.ins-table td{border:0;padding:7px 0}.ins-table td:before{content:attr(data-label);font-weight:800;display:block;color:#496675;font-size:13px}}
 `;document.head.appendChild(s);}
 const money=v=>v==null?'Pending':Number(v).toFixed(3);
 function cells(r){return [r.date,r.job_card,r.vehicle,r.claim,r.insurance_company,r.delivered_date,money(r.lpo_amount),r.lpo_received_date];}
 const headers=['Date','Job Card Number','Vehicle Make / Model','Claim Number','Insurance Company','Delivery Date','LPO Amount (OMR)','LPO Received Date'];
 function render(){
  style();const summary=result.summary;
  const summaries=[['collected','Monthly Insurance LPO Collected Amount','OMR '+money(summary.collected_amount)],['delivered','Monthly Delivered Insurance Vehicles',summary.delivered_count],['approval','Approval Pending',summary.approval_pending],['wip','Work in Progress',summary.wip_count]];
  window.zukaitReception.dashboardShell('Insurance Management',
   '<div class="ins-summary">'+summaries.map(([action,label,value])=>'<button data-ins="summary" data-section="'+action+'">'+esc(label)+'<b>'+esc(value)+'</b></button>').join('')+'</div>'+
   '<div class="ins-toolbar"><button data-ins="section" data-section="jobs">Insurance Job Cards</button><button data-ins="section" data-section="pending">LPO Pending</button><button data-ins="print">Print</button><button data-ins="refresh">Refresh</button></div>'+
   '<div class="ins-filters"><label>Insurance Company<select data-ins-filter="company"><option value="">All</option>'+result.companies.map(c=>'<option'+(filters.company===c?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></label><label>Month<input type="month" data-ins-filter="month" value="'+esc(filters.month)+'"></label><label>From<input type="date" data-ins-filter="from" value="'+esc(filters.from)+'"></label><label>To<input type="date" data-ins-filter="to" value="'+esc(filters.to)+'"></label></div>'+
   '<label>Search<input data-ins-filter="search" value="'+esc(filters.search||'')+'" placeholder="Job Card / Vehicle / Claim"></label>'+
   (section==='delivered'?'<div class="rc-box"><h4>Delivered Vehicles by Insurance Company</h4>'+result.company_breakdown.map(x=>'<p>'+esc(x.company)+' · '+x.count+'</p>').join('')+'</div>':'')+
   '<p>'+esc(section==='pending'?'LPO Pending':section==='jobs'?'Insurance Job Cards':section==='collected'?'LPO Collections':section==='wip'?'Insurance Work in Progress':'Delivered Insurance Vehicles')+' · '+result.total+' records</p>'+
   '<table class="ins-table"><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'<th>Actions</th></tr></thead><tbody>'+result.rows.map(r=>'<tr>'+cells(r).map((v,i)=>'<td data-label="'+headers[i]+'">'+(i===1?'<button data-ins="job" data-job="'+esc(r.job_card)+'">'+esc(v)+'</button>':esc(v||'—'))+'</td>').join('')+'<td data-label="Actions"><button data-ins="lpo" data-job="'+esc(r.job_card)+'">'+(r.lpo_amount==null?'Enter LPO':'LPO Details / Correction')+'</button></td></tr>').join('')+'</tbody></table>'+
   '<div class="ins-toolbar"><button data-ins="previous"'+(page===0?' disabled':'')+'>Previous</button><span>Page '+(page+1)+'</span><button data-ins="next"'+((page+1)*50>=result.total?' disabled':'')+'>Next</button></div>');
  const root=document.getElementById('rc-root');root.addEventListener('click',onClick);root.addEventListener('change',e=>{const key=e.target.dataset.insFilter;if(!key)return;filters[key]=e.target.value;page=0;void load();});
 }
 async function load(){if(role()!=='Manager')return;const id=++serial;
  try{const data=await window.zukaitReception.action({action:'insurance_dashboard',section,...filters,page});if(id!==serial)return;result=data;render();}
  catch(e){const host=document.getElementById('rc-error');if(host)host.textContent=e.message||String(e);}
 }
 async function open(){if(role()!=='Manager')return;filters={company:'',month:new Date(Date.now()+14400000).toISOString().slice(0,7),from:'',to:'',search:''};page=0;section='jobs';
  window.zukaitReception.dashboardShell('Insurance Management','<p>Loading authoritative records…</p>');await load();}
 function pendingKey(){return 'zukait_insurance_lpo_pending:'+window.zukaitReception.endpoint+':'+window.me.id;}
 function lpo(no){const row=result.rows.find(r=>r.job_card===no);if(!row)return;
  let pending=null;try{pending=JSON.parse(localStorage.getItem(pendingKey())||'null');}catch(e){alert('Saved LPO request could not be read. Ask the Manager to reconcile this device before making changes.');return;}
  window.zukaitReception.dashboardShell('LPO · Job Card '+no,'<p>Insurance LPO amount and received date are separate from the final invoice. Corrections require a remark and retain history.</p>'+
   (pending?'<p>A saved LPO entry for '+esc(pending.job_card)+' needs confirmation.</p><button data-ins="retry">Confirm Saved LPO Entry</button>':'')+
   '<form id="ins-lpo"><label>LPO Amount (OMR)<input name="amount" type="number" min="0" max="1000000" step="0.001" required value="'+esc(row.lpo_amount??'')+'"></label><label>LPO Received Date<input name="date" type="date" required value="'+esc(row.lpo_received_date||new Date(Date.now()+14400000).toISOString().slice(0,10))+'"></label><label>Remark / Correction Reason<textarea name="reason" maxlength="2000"'+(row.lpo_amount!=null?' required':'')+'></textarea></label><button type="submit"'+(pending?' disabled':'')+'>Save LPO</button></form><button data-ins="back">Back to Insurance</button><details><summary>LPO History</summary>'+row.lpo_history.map(h=>'<p>'+esc(h.source)+' · '+esc(h.name||h.by)+' · '+esc(h.toDate)+' · OMR '+money(h.toAmount)+'<br>'+esc(h.reason)+'</p>').join('')+'</details>');
  const root=document.getElementById('rc-root');root.addEventListener('click',onClick);
  document.getElementById('ins-lpo').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const body={action:'insurance_lpo',job_card:no,amount:String(f.get('amount')),received_date:String(f.get('date')),reason:String(f.get('reason')).trim(),expected_revision:row.lpo_revision,request_id:crypto.randomUUID()};
   try{if(localStorage.getItem(pendingKey()))throw Error('Confirm the saved LPO entry first.');const encoded=JSON.stringify(body);localStorage.setItem(pendingKey(),encoded);if(localStorage.getItem(pendingKey())!==encoded)throw Error('Could not retain the LPO retry.');await save(body);}catch(x){document.getElementById('rc-error').textContent=x.message;} };
 }
 async function save(body){const key=pendingKey();try{const receipt=await window.zukaitReception.action(body),job=receipt.job,lpo=job?.insuranceLpo;
   if(String(job?.no).toUpperCase()!==body.job_card.toUpperCase()||lpo?.amount!==Number(body.amount)||lpo?.receivedDate!==body.received_date||!lpo?.history?.some(h=>h.request_id===body.request_id))throw Error('The LPO response did not confirm the saved entry. Retry its original details.');
   localStorage.removeItem(key);try{await window.zukaitCloud?.pull?.(true);}catch(_){}await load();}
  catch(e){if(['insurance_lpo_conflict','insurance_invalid_lpo','insurance_job_required','insurance_correction_reason_required'].includes(e.code))localStorage.removeItem(key);throw e;}}
 async function print(){
  // Load every filtered page so the printed report is complete, rather than only the visible 50 rows.
  const popup=window.open('','_blank');if(!popup)throw Error('Allow popups to print this report.');
  try{const rows=[];for(let p=0;p<=1000;p++){const data=await window.zukaitReception.action({action:'insurance_dashboard',section,...filters,page:p});rows.push(...data.rows);if(rows.length>=data.total)break;if(p===1000)throw Error('Report exceeds the safe print limit. Narrow the dates.');}
   popup.document.write('<!doctype html><html><head><title>Insurance '+esc(section)+'</title><style>body{font:12px Arial;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;text-align:left}@page{size:A4 landscape;margin:12mm}</style></head><body><h1>ZUKAIT · Insurance '+esc(section)+'</h1><p>'+esc(filters.month)+' · '+esc(filters.company||'All companies')+' · '+rows.length+' records</p><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cells(r).map(v=>'<td>'+esc(v||'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></body></html>');popup.document.close();popup.focus();popup.print();
  }catch(e){popup.close();throw e;}
 }
 async function onClick(e){const button=e.target.closest('[data-ins]');if(!button)return;e.preventDefault();try{
  const action=button.dataset.ins;if(action==='summary'||action==='section'){if(button.dataset.section==='approval')return window.zukaitReceptionDashboard.choose('waiting');section=button.dataset.section;page=0;return load();}
  if(action==='lpo')return lpo(button.dataset.job);
  if(action==='job')return window.zukaitJobEdit.view(button.dataset.job);
  if(action==='previous'&&page>0){page--;return load();}if(action==='next'&&(page+1)*50<result.total){page++;return load();}
  if(action==='refresh'||action==='back')return load();if(action==='print')return print();
  if(action==='retry'){const body=JSON.parse(localStorage.getItem(pendingKey())||'null');if(body)await save(body);}
 }catch(x){const host=document.getElementById('rc-error');if(host)host.textContent=x.message||String(x);}}
 window.zukaitInsuranceManagement={open};
})();
