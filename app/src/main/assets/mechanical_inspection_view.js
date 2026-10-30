// V377 Mechanical Checklist details. Dedicated screen; no cached customer data.
// Server remains authoritative for role, checklist membership and every revision.
const checks=[
 ['lights','Lights'],['wipers','Wipers'],['powerWindows','Power Windows'],
 ['centralLocking','Central Locking'],['mirrors','Mirrors'],['horn','Horn'],
 ['dashboardWarning','Dashboard Warning'],['airConditioning','Air Conditioning']
];
const parts=['Front Bumper','Bonnet / Hood','Front LH Fender','Front RH Fender',
 'LH Front Door','RH Front Door','LH Rear Door','RH Rear Door','Roof',
 'Rear LH Fender','Rear RH Fender','Tailgate','Rear Bumper'];
const empty=()=>({jobType:'CASH',vehicle:{registration:'',make:'',model:'',year:'',
 vin:'',odometerKm:undefined,customer:'',contact:''},damageMarks:[],
 functions:Object.fromEntries(checks.map(([k])=>[k,{status:'NOT_CHECKED'}])),
 workDescription:''});
export async function mountMechanicalInspection(root,options={}){
 const doc=root.ownerDocument,win=doc.defaultView,identity=JSON.stringify(options.getSession?.());
 let disposed=false,loading=false,saving=false,loaded=false,revision=0,record=null,
  draft=empty(),message='',pending=null;
 const live=()=>!disposed&&options.isEnabled?.()!==false&&
  JSON.stringify(options.getSession?.())===identity;
 const online=()=>options.online?.()??win.navigator.onLine;
 const elem=(tag,text,attrs={})=>{
  const el=doc.createElement(tag);
  if(text!==null&&text!==undefined)el.textContent=text;
  for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
  return el;
 };
 const btn=(caption,fn)=>{const b=elem('button',caption,{type:'button'});b.onclick=fn;return b;};
 const cleanVehicle=()=>{
  const v={...draft.vehicle};
  if(!String(v.vin||'').trim())delete v.vin;else v.vin=String(v.vin).trim().toUpperCase();
  if(v.odometerKm===undefined||v.odometerKm===''||v.odometerKm===null)delete v.odometerKm;
  else v.odometerKm=Number(v.odometerKm);
  return v;
 };
 async function load(){
  if(!live()||saving||pending)return;
  loaded=false;
  if(!online()){message='Reconnect to load the Mechanical Checklist.';render();return;}
  loading=true;message='';render();
  try{
   const result=await options.api({action:'mechanical_inspection',
    command:{operation:'READ_INSPECTION',checklistId:options.checklistId}});
   if(!live())return;
   loaded=true;
   record=result.inspection??null;
   revision=record?.revision??0;
   draft=record?.inspection?structuredClone(record.inspection):empty();
   if(!draft.functions)draft.functions=empty().functions;
   if(!Array.isArray(draft.damageMarks))draft.damageMarks=[];
  }catch(error){if(live())message=String(error.message||'Unable to read checklist.');}
  finally{loading=false;if(live())render();}
 }
 async function save(){
  if(!live()||loading||saving||!online()){message='Reconnect before saving. No change was sent.';render();return;}
  if(!loaded){message='Load the checklist from the server before saving.';render();return;}
  const payload={...draft,vehicle:cleanVehicle()};
  if(!checks.every(([k])=>payload.functions?.[k]?.status&&
    (payload.functions[k].status!=='ISSUE'||String(payload.functions[k].note||'').trim()))){
   message='Enter a note for each function marked ISSUE.';render();return;
  }
  if(!pending)pending={
   requestId:win.crypto.randomUUID(),expectedRevision:revision,
   inspection:structuredClone(payload)
  };
  saving=true;message='';render();
  try{
   const result=await options.api({action:'mechanical_inspection',
    command:{operation:'SAVE_INSPECTION',checklistId:options.checklistId,
     requestId:pending.requestId,expectedRevision:pending.expectedRevision,
     inspection:pending.inspection}});
   if(!live())return;
   if(!Number.isSafeInteger(result.result?.revision)||result.result.revision!==pending.expectedRevision+1)
    throw Error('Server did not confirm the saved revision.');
   revision=result.result.revision;
   record={checklistId:options.checklistId,revision,inspection:pending.inspection};
   pending=null;
   message='Saved and confirmed by the server (revision '+revision+').';
  }catch(error){
   if(live()){
    const code=String(error?.code||error?.message||'Save not confirmed.');
    const rejected=['inspection_revision_conflict','inspection_request_conflict',
     'invalid_inspection','invalid_mechanical_job_type','invalid_vehicle',
     'invalid_vehicle_year','invalid_vin','invalid_odometer',
     'invalid_work_description','invalid_damage_marks','invalid_function_checks',
     'mechanical_forbidden','inspection_checklist_not_found',
     'extension_disabled','session_changed','invalid_session'].includes(code);
    if(rejected)pending=null;
    message=code+(rejected
     ?' The server rejected this request. Reload to review the current checklist.'
     :' Save status is uncertain. Retry with the same request ID or reopen to verify.');
   }
  }finally{saving=false;if(live())render();}
 }
 function input(label,value,onInput,attrs={}){
  const wrap=elem('label',null,{class:'mi-field'});
  wrap.append(elem('span',label));
  const control=elem(attrs.multiline?'textarea':'input',null);
  if(!attrs.multiline)control.type=attrs.type||'text';
  control.value=value??'';
  if(attrs.maxLength)control.maxLength=attrs.maxLength;
  if(attrs.required)control.required=true;
  if(attrs.rows)control.rows=attrs.rows;
  if(attrs.min!==undefined)control.min=attrs.min;
  if(attrs.max!==undefined)control.max=attrs.max;
  control.oninput=()=>onInput(control.value);
  wrap.append(control);return wrap;
 }
 function selector(label,values,value,onChange){
  const wrap=elem('label',null,{class:'mi-field'});wrap.append(elem('span',label));
  const sel=elem('select');
  for(const [id,title] of values){const opt=elem('option',title);opt.value=id;sel.append(opt);}
  sel.value=value;sel.onchange=()=>onChange(sel.value);wrap.append(sel);return wrap;
 }
 function render(){
  if(disposed)return;
  root.replaceChildren();
  root.className='mechanical-inspection-view';
  const style=elem('style',`
   .mechanical-inspection-view{font:15px/1.5 system-ui,sans-serif;color:#243850;background:#f4f8fe;padding:18px;max-width:1100px;margin:auto}
   .mechanical-inspection-view *{box-sizing:border-box}
   .mechanical-inspection-view header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;background:#fff;border:1px solid #d8e4f0;border-radius:15px;padding:16px;margin-bottom:15px}
   .mechanical-inspection-view h2{font-size:22px;margin:0}.mechanical-inspection-view h3{font-size:17px;margin:0 0 12px}
   .mechanical-inspection-view section{background:#fff;border:1px solid #d9e5f1;border-radius:15px;padding:17px;margin:12px 0}
   .mechanical-inspection-view .mi-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
   .mechanical-inspection-view .mi-field{display:flex;flex-direction:column;gap:5px;color:#344b64;font-weight:600}
   .mechanical-inspection-view input,.mechanical-inspection-view select,.mechanical-inspection-view textarea{width:100%;min-height:44px;padding:9px 11px;border:1px solid #a8bfd6;border-radius:9px;font:inherit;color:#21344c;background:#fff}
   .mechanical-inspection-view textarea{min-height:160px;resize:vertical}
   .mechanical-inspection-view button{border:1px solid #a8c5df;border-radius:9px;padding:10px 14px;min-height:44px;background:#e9f4ff;color:#1e4f7c;font:inherit;font-weight:700;cursor:pointer}
   .mechanical-inspection-view button:disabled{opacity:.5;cursor:not-allowed}
   .mechanical-inspection-view .mi-save{background:#205b87;color:#fff}
   .mechanical-inspection-view .mi-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
   .mechanical-inspection-view .mi-functions{display:grid;gap:10px}
   .mechanical-inspection-view .mi-function{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(120px,1fr) minmax(0,2fr);align-items:center;gap:12px}
   .mechanical-inspection-view .mi-vehicle-image{display:block;max-width:100%;width:100%;max-height:420px;object-fit:contain;background:white;border:1px solid #d8e4f0;border-radius:12px;margin:12px 0}
   .mechanical-inspection-view .mi-diagram{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;background:#edf5fc;padding:13px;border-radius:12px}
   .mechanical-inspection-view .mi-diagram button{background:#fff;min-height:56px}
   .mechanical-inspection-view .mi-diagram button[aria-pressed=true]{background:#cde8ff;border-color:#377ab0}
   .mechanical-inspection-view .mi-marks{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
   .mechanical-inspection-view .mi-marks button{min-height:36px}
   .mechanical-inspection-view .mi-note{margin:10px 0;color:#2b5b80}
   .mechanical-inspection-view .mi-error{font-weight:650;color:#8c3838}
   @media(max-width:700px){.mechanical-inspection-view .mi-fields{grid-template-columns:1fr}.mechanical-inspection-view .mi-function{grid-template-columns:1fr}.mechanical-inspection-view{padding:10px}}
   @media print{.mechanical-inspection-view{background:white;max-width:none}.mechanical-inspection-view section{break-inside:avoid}.mechanical-inspection-view .mi-actions{display:none}}
  `);
  root.append(style);
  const header=elem('header');
  const heading=elem('div');heading.append(elem('h2','Mechanical Vehicle Checklist'),
   elem('div','JC '+String(options.jobCard||'')+' · CASH / CREDIT'));
  header.append(heading,btn('← Back',()=>{if(pending){message='Resolve the unconfirmed save before leaving.';render();return;}destroy();options.onBack?.();}));
  root.append(header);
  const status=elem('p',message||(!online()?'Offline — saving disabled.':'Revision '+revision),{role:'status',class:message?'mi-error':'mi-note'});
  root.append(status);
  if(loading){root.append(elem('p','Loading checklist from server…'));return;}
  if(!loaded){root.append(btn('Retry loading',load));return;}
  const form=elem('form');
  form.onsubmit=e=>{e.preventDefault();if(form.reportValidity())save();};
  const identity=elem('section');identity.append(elem('h3','Vehicle and customer'));
  identity.append(selector('Job type',[['CASH','Cash'],['CREDIT','Credit']],draft.jobType,
   v=>{draft.jobType=v;}));
  const vehicle=elem('div',null,{class:'mi-fields'});
  for(const [key,label] of [['registration','Registration number'],['make','Make'],['model','Model'],['year','Year'],['vin','VIN (optional)'],['odometerKm','KM reading (optional)'],['customer','Customer / company'],['contact','Contact number']]){
   vehicle.append(input(label,draft.vehicle?.[key]??'',v=>{
    draft.vehicle[key]=v;
   },{required:!['vin','odometerKm'].includes(key),maxLength:key==='vin'?17:120,
    type:key==='odometerKm'?'number':'text',min:key==='odometerKm'?0:undefined,max:key==='odometerKm'?999999999:undefined}));
  }
  identity.append(vehicle);form.append(identity);
  const damage=elem('section');damage.append(elem('h3','Vehicle damage diagram'),elem('p','Use the approved vehicle view and select a panel below, then choose X (damage), S (scratch), or M (missing).'));
  damage.append(elem('img',null,{class:'mi-vehicle-image',
   src:new URL('./v2/features/insurance/vehicle-inspection-approved.png',import.meta.url).href,
   alt:'Approved vehicle inspection illustration — front, rear, sides and top'}));
  const type=selector('Mark type',[['X','X · Damage'],['S','S · Scratch'],['M','M · Missing']],'X',v=>{markType=v;});
  let markType='X';damage.append(type);
  const panels=elem('div',null,{class:'mi-diagram'});
  for(const part of parts){
   const present=draft.damageMarks.find(x=>x.part===part);
   const b=btn(part+(present?' · '+present.mark:''),()=>{
    if(pending)return;
    draft.damageMarks=draft.damageMarks.filter(x=>x.part!==part);
    draft.damageMarks.push({part,mark:markType});render();
   });b.setAttribute('aria-pressed',Boolean(present));panels.append(b);
  }
  damage.append(panels);
  const marks=elem('div',null,{class:'mi-marks'});
  for(const x of draft.damageMarks)marks.append(btn(x.part+' · '+x.mark+' ×',()=>{
   if(pending)return;draft.damageMarks=draft.damageMarks.filter(y=>y.part!==x.part);render();
  }));
  damage.append(marks);form.append(damage);
  const functionSection=elem('section');functionSection.append(elem('h3','Function checks'));
  const grid=elem('div',null,{class:'mi-functions'});
  for(const [key,title] of checks){
   const check=draft.functions[key]||{status:'NOT_CHECKED'};
   const row=elem('div',null,{class:'mi-function'});
   row.append(elem('strong',title),selector(title+' status',
    [['NOT_CHECKED','Not checked'],['OK','OK'],['ISSUE','Issue']],check.status,v=>{
     draft.functions[key]={...draft.functions[key],status:v};render();
    }),input('Issue note',check.note||'',v=>{
     draft.functions[key]={...draft.functions[key],note:v};
    },{maxLength:300}));
   grid.append(row);
  }
  functionSection.append(grid);form.append(functionSection);
  const work=elem('section');work.append(elem('h3','Work Description / Notes'),
   input('Detailed repair instructions',draft.workDescription,v=>{draft.workDescription=v;},
    {multiline:true,rows:6,maxLength:2000,required:true}));form.append(work);
  const actions=elem('div',null,{class:'mi-actions'});
  const saveButton=elem('button',pending?'Retry same save':'Save checklist',{type:'submit',class:'mi-save'});
  saveButton.disabled=saving||!online();actions.append(saveButton);
  const reload=btn('Reload from server',()=>{
   if(pending){message='Resolve the unconfirmed request before reloading.';render();return;}
   if(win.confirm('Discard unsaved edits and reload this checklist?'))load();
  });reload.disabled=saving;actions.append(reload);
  const print=btn('Print checklist',()=>{
   if(JSON.stringify({...draft,vehicle:cleanVehicle()})!==JSON.stringify(record?.inspection)){
    message='Save your changes before printing the confirmed checklist.';render();return;
   }
   win.print();
  });print.disabled=saving||!record||!!pending;actions.append(print);
  if(pending){
   actions.append(elem('span','Unconfirmed request — retry uses the SAME request ID.'));
   actions.append(btn('Back and verify later',()=>{
    if(win.confirm('This save has not been confirmed. Reopen the checklist and verify its server revision before editing again.')){
     destroy();options.onBack?.();
    }
   }));
  }
  form.append(actions);root.append(form);
  // Keep edits immutable during an uncertain or ongoing save.
  if(pending||saving){for(const control of form.querySelectorAll('input,select,textarea'))control.disabled=true;
   for(const b of panels.querySelectorAll('button'))b.disabled=true;}
 }
 function destroy(){disposed=true;root.replaceChildren();}
 render();await load();return {destroy,refresh:load};
}
