(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=[['make','Make'],['model','Model'],['year','Year'],['reg','Registration Number'],['vin','VIN / Chassis Number'],['color','Vehicle Color'],['colorCode','Paint Color Code'],['customer','Customer Name'],['mobile','Customer Mobile'],['insuranceCompany','Insurance Company'],['claimNo','Claim Number'],['createdAt','Job Created Date','date'],['notes','Job Notes']];
let draft=null;
const manager=()=>typeof me!=='undefined'&&me?.role==='Manager';
const find=no=>(state.jobs||[]).find(j=>j&&j.no===no);
const day=v=>{if(!v)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return String(v);const d=new Date(v);return Number.isFinite(d.getTime())?new Date(d.getTime()+14400000).toISOString().slice(0,10):''};
const clone=v=>JSON.parse(JSON.stringify(v));
const read=k=>String(document.getElementById('mje-'+k)?.value??'').trim();
function values(j){const identity=window.zukaitJobCardMaster?.identity?.(j.no)||{};return {...j,...identity,make:j.make||j.brand||identity.make||'',finalInvoiceAmount:j.finalInvoiceAmount??j.invoiceAmount??'',createdAt:day(j.createdAt),deliveredAt:day(j.deliveredAt),invoiceDate:day(j.invoiceDate),notes:j.notes||''}}
function financialActions(j){const button=(title,action)=>'<button type="button" class="secondary" data-job="'+esc(j.no)+'" data-action="'+action+'" onclick="zukaitManagerEditAction(this.dataset.job,this.dataset.action)">'+title+'</button>';return '<h4>Amounts & Delivery</h4><p>Job amount: OMR '+Number(j.amount||0).toFixed(3)+' · Final invoice: '+(j.finalInvoiceAmount==null?'Not entered':'OMR '+Number(j.finalInvoiceAmount).toFixed(3))+'</p><p>Save your form changes before opening a correction.</p>'+(!j.delivered&&String(j.jobType).toUpperCase()==='CASH'?button('Edit Cash Amount','cash'):'')+(j.delivered?button('Edit Final Invoice & Date','invoice')+button('Edit Delivery Date','delivery'):'')}
window.zukaitManagerEditAction=function(no,action){if(!manager())return;const j=find(no);if(!j)return;draft=null;if(action==='cash')window.zukaitEditCashAmount?.(no);else if(action==='invoice')window.zukaitCorrectFinalInvoice?.(no);else if(action==='delivery')window.zukaitCorrectDeliveryDate?.(no)};
window.editJobManager=function(no){
 if(!manager())return;const j=find(no);if(!j)return;
 const v=values(j),assign=(state.assign||[]).filter(a=>a.job===no&&!a.cancelled);draft={no,before:JSON.stringify(j),assign:assign.map(a=>({id:a.id,suggested:a.suggested}))};
 const input=(key,label,type='text')=>'<label>'+esc(label)+'<input id="mje-'+key+'" type="'+type+'" '+(type==='number'?'min="0" step="0.001" ':'')+'value="'+esc(v[key])+'"></label>';
 const type=String(j.jobType||'Cash').toLowerCase();
 openModal('<section class="mje-form"><div class="section-title"><h3>Full Edit · '+esc(no)+'</h3><button class="secondary" onclick="closeModal()">Cancel</button></div><p>Job Card <b>'+esc(no)+'</b> · '+esc(j.vehicle)+' · '+esc(j.reg)+'</p><p class="muted">Job Card number is the permanent link to work, parts and purchases.</p><div class="grid">'+fields.filter(([k])=>k!=='deliveredAt'||j.delivered).map(f=>input(...f)).join('')+'<label>Job Type<select id="mje-jobType">'+['Cash','Credit','Insurance'].map(t=>'<option'+(t.toLowerCase()===type?' selected':'')+'>'+t+'</option>').join('')+'</select></label></div>'+financialActions(j)+'<h4>Technician Allocations</h4><div class="grid">'+assign.map((a,i)=>{const name=(typeof users!=='undefined'?users:[]).find(u=>u.id===a.emp)?.name||a.emp;return '<label>'+esc(name)+(a.rework?' · Repeat Work':'')+'<input id="mje-time-'+i+'" value="'+Math.floor((Number(a.suggested)||0)/60)+'.'+String(Math.round((Number(a.suggested)||0)%60)).padStart(2,'0')+'"><small>Hours.minutes, for example 1.30</small></label>'}).join('')+'</div><label>Reason for Change<textarea id="mje-reason" maxlength="2000" placeholder="Required for corrections"></textarea></label><p class="muted">Actual work history, QC results and delivery status are maintained by their own workflows.</p><button class="blue" onclick="zukaitSaveManagerFullEdit()">SAVE ALL CHANGES</button></section>');
};
window.zukaitSaveManagerFullEdit=async function(){
 if(!manager()||!draft)return;const j=find(draft.no);if(!j)return;
 if(JSON.stringify(j)!==draft.before)return alert('This Job Card changed while you were editing. Reopen Full Edit to use the latest details.');
 const old=clone(j),v=values(j),patch={},reason=read('reason');
 for(const [key,,type] of fields){if(key==='deliveredAt'&&!j.delivered)continue;const raw=read(key);if(type==='number'){if(raw===''&&key==='finalInvoiceAmount'){if(j.finalInvoiceAmount!=null||j.invoiceAmount!=null)return alert('An existing final invoice amount cannot be cleared.');continue}const num=Number(raw);if(!Number.isFinite(num)||num<0||num>1000000)return alert('Enter a valid '+key+' between 0 and 1,000,000 OMR.');patch[key]=Math.round(num*1000)/1000;}else if(type==='date'){if(raw&&!/^\d{4}-\d{2}-\d{2}$/.test(raw))return alert('Enter a valid date.');if(raw&&day(Date.parse(raw+'T12:00:00+04:00'))!==raw)return alert('Enter a valid calendar date.');if((key==='createdAt'||key==='deliveredAt')&&!raw)return alert('Created and delivery dates are required.');if(raw!==v[key])patch[key]=(key==='createdAt'||key==='deliveredAt')?Date.parse(raw+'T09:00:00+04:00'):raw;}else patch[key]=raw;}
 if(!patch.make||!patch.model||!patch.reg)return alert('Make, Model and Registration Number are required.');
 if(patch.year&&!/^\d{4}$/.test(patch.year))return alert('Enter a four-digit vehicle year.');
 patch.jobType=read('jobType');if(!['Cash','Credit','Insurance'].includes(patch.jobType))return alert('Choose a valid Job Type.');if(patch.jobType==='Insurance'&&!patch.insuranceCompany)return alert('Insurance Company is required.');
 
 if(!reason)return alert('Enter the reason for this correction.');
 const updates=[];for(let i=0;i<draft.assign.length;i++){const prior=draft.assign[i],a=(state.assign||[]).find(a=>a.id===prior.id&&a.job===j.no&&!a.cancelled);if(!a||a.suggested!==prior.suggested)return alert('Technician allocations changed. Reopen Full Edit.');const raw=read('time-'+i);if(!/^\d+\.[0-5]\d$/.test(raw))return alert('Enter technician time as hours.minutes, for example 1.30.');const [h,m]=raw.split('.').map(Number),minutes=h*60+m;if(!Number.isSafeInteger(minutes)||minutes<=0)return alert('Technician allocated time must be greater than zero.');updates.push({a,old:a.suggested,minutes});}
 patch.reg=patch.reg.toUpperCase();patch.vehicle=(patch.make+' '+patch.model).trim();patch.brand=patch.make;patch.insurance=patch.insuranceCompany;patch.customerName=patch.customer;patch.customerMobile=patch.mobile;patch.vinNumber=patch.vin;patch.chassis=patch.vin;patch.claimNumber=patch.claimNo;
 if(patch.finalInvoiceAmount!=null)patch.invoiceAmount=patch.finalInvoiceAmount;
 if(patch.deliveredAt)patch.deliveryDate=day(patch.deliveredAt);
 const at=Date.now(),audit={job:j.no,operation:'MANAGER_FULL_JOB_EDIT',before:old,after:{...old,...patch},reason,by:me.id,byName:me.name||me.id,at};
 const collections=['jobEdits','suggestedEdits','financialAudit','jobTypeAudit'],snapshots=Object.fromEntries(collections.map(k=>[k,state[k]?clone(state[k]):null]));
 Object.assign(j,patch);for(const {a,minutes,old:prior} of updates){a.suggested=minutes;if(minutes!==prior)(state.suggestedEdits??=[]).push({job:j.no,assignmentId:a.id,emp:a.emp,oldMinutes:prior,newMinutes:minutes,reason,by:me.id,at});}
 (state.jobEdits??=[]).push(audit);
 for(const k of ['amount','finalInvoiceAmount','invoiceDate'])if(patch[k]!==undefined&&old[k]!==patch[k]){const entry={job:j.no,operation:'MANAGER_'+k.toUpperCase()+'_CORRECTION',from:old[k],to:patch[k],reason,by:me.id,name:me.name||me.id,at};(state.financialAudit??=[]).push(entry);(j.financialAudit??=[]).push(entry);}
 if(old.jobType!==j.jobType||old.insuranceCompany!==j.insuranceCompany)(state.jobTypeAudit??=[]).push({job:j.no,operation:'JOB_TYPE_CORRECTION',from:old.jobType,to:j.jobType,fromInsurance:old.insuranceCompany,toInsurance:j.insuranceCompany,reason,by:me.id,at});
 try{await save();}catch(e){Object.keys(j).forEach(k=>delete j[k]);Object.assign(j,old);updates.forEach(({a,old})=>a.suggested=old);for(const k of collections){if(snapshots[k]===null)delete state[k];else state[k]=snapshots[k]}return alert('Changes could not be saved. Please retry.');}
 draft=null;closeModal();if(typeof render==='function')render();if(typeof openJobCardManager==='function')openJobCardManager('all');
};
const row=window.jobManagerRow;if(typeof row==='function')window.jobManagerRow=function(){return row.apply(this,arguments).replace(/>Edit<\/button>/g,'>Full Edit</button>')};
})();
