// Independent Mechanical intake. No Job Card is created by this screen.
const parts=['Front Bumper','Bonnet / Hood','LH Front Fender','RH Front Fender','LH Front Door','RH Front Door','LH Rear Door','RH Rear Door','Roof','LH Rear Fender','RH Rear Fender','Tailgate','Rear Bumper','Windshield','Rear Glass','Headlights','Rear Lights'];
const checks=[['lights','Lights'],['wipers','Wipers'],['powerWindows','Power Windows'],['centralLocking','Central Locking'],['mirrors','Mirrors'],['horn','Horn'],['dashboardWarning','Dashboard Warning'],['airConditioning','Air Conditioning']];
export async function mountMechanicalPrejob(root,options={}){
 const doc=root.ownerDocument,win=doc.defaultView,identity=JSON.stringify(options.getSession?.());
 let disposed=false,busy=false,items=[],message='',query='',statusFilter='ALL';
 const current=()=>!disposed&&JSON.stringify(options.getSession?.())===identity&&options.isEnabled?.()!==false;
 const n=(tag,text,attrs={})=>{const e=doc.createElement(tag);if(text!=null)e.textContent=text;for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
 const action=(name,fn)=>{const b=n('button',name,{type:'button'});b.disabled=busy;b.onclick=fn;return b;};
 const field=(f,title,name,required=true)=>{const label=n('label',title),input=n('input',null,{name,type:'text'});input.required=required;label.append(input);f.append(label);return input;};
 async function call(command){if(!current()||!win.navigator.onLine)throw Error('Reconnect before changing a checklist.');const r=await options.api({action:'mechanical_section',command});if(!r?.ok)throw Error(r?.code||'Server did not confirm the change.');return r;}
 async function refresh(preserveMessage=false){if(!current()||busy)return;busy=true;try{items=(await call({operation:'LIST',query})).checklists||[];if(!preserveMessage)message='';}catch(e){message=e.message;}finally{busy=false;if(current())render();}}

 function printSavedChecklist(item,places){
  const w=win.open('','_blank');
  if(!w)return false;
  const d=w.document,v=item.vehicle||{},data=item.inspection||{};
  const node=(tag,text,cls)=>{const e=d.createElement(tag);if(text!=null)e.textContent=String(text);if(cls)e.className=cls;return e;};
  const block=(title,rows)=>{const section=node('section');section.append(node('h2',title));const grid=node('div',null,'print-fields');for(const [k,value] of rows){const p=node('p');p.append(node('b',k+': '),node('strong',value||'—'));grid.append(p);}section.append(grid);d.body.append(section);};
  d.title='Checklist '+String(item.checklist_number||'');
  const style=node('style');
  style.textContent=[
   '@page{size:A4;margin:9mm}body{font:11px/1.4 Arial,Helvetica,sans-serif;color:#183b46;margin:0}',
   '*{box-sizing:border-box}header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #19827d;padding:0 0 8px}',
   'header h1{font-size:17px;margin:0}header strong{font-size:18px}h2{font-size:12px;margin:10px 0 5px;padding:5px;background:#e8f5f2;color:#145b59}',
   '.print-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 12px}.print-fields p{margin:0;padding:2px 0;border-bottom:1px solid #e1e9ea}',
   '.print-fields b,.print-fields strong{font-size:11px}.print-columns{display:grid;grid-template-columns:1.2fr 1fr;gap:12px}',
   '.diagram{position:relative;width:100%;aspect-ratio:1536/1152;border:1px solid #ccdfe0}.diagram img{width:100%;height:100%;object-fit:contain}',
   '.mark{position:absolute;transform:translate(-50%,-50%);width:19px;height:19px;border-radius:50%;color:#fff;display:grid;place-items:center;font-weight:800;background:#ce3744;border:1px solid white}',
   '.mark[data-mark=S]{background:#2068b7}.mark[data-mark=M]{background:#b36b12}',
   'table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:3px 4px;text-align:left;border:1px solid #dae4e5}th{background:#eff5f6}',
   '.notes{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dbe5e6;padding:7px;min-height:35px;font-weight:bold}',
   'footer{display:flex;gap:10%;margin-top:25px}footer b{width:45%;border-top:1px solid #4d6970;padding-top:6px}',
   '@media screen{body{padding:14px;max-width:800px;margin:auto}}'
  ].join('\n');
  d.head.append(style);
  const header=node('header'),company=node('div');company.append(node('h1','ZUKAIT INTERNATIONAL LLC'),node('small','Mechanical Department'));
  const title=node('div');title.append(node('strong','Checklist'),node('p',String(item.created_at||'').slice(0,10)));
  header.append(company,title);d.body.append(header);
  block('Checklist and Vehicle',[
   ['Checklist No.',item.checklist_number],['Job Type',item.job_type],
   ['Registration',item.registration],['Status',item.approval_status],
   ['Make',v.make],['Model',v.model],['Year',v.year],
   ['Odometer',v.odometer?String(v.odometer)+' '+String(v.odometer_unit||'KM'):''],
   ['VIN',v.vin],['Customer',v.customer],['Contact',v.contact],
   ['Linked Job Card',item.linked_job_card]
  ]);
  const section=node('section');section.append(node('h2','Vehicle Damage and Function Check'));
  const columns=node('div',null,'print-columns'),left=node('div'),right=node('div'),stage=node('div',null,'diagram');
  const img=node('img');img.alt='Vehicle inspection';stage.append(img);
  for(const mark of data.damageMarks||[]){
   const i=parts.indexOf(mark.part),xy=places[i];
   if(!xy||!['X','S','M'].includes(mark.mark))continue;
   const badge=node('span',mark.mark,'mark');badge.dataset.mark=mark.mark;
   badge.style.left=xy[0]+'%';badge.style.top=xy[1]+'%';badge.title=String(mark.part);stage.append(badge);
  }
  left.append(stage,node('small','X = Dent / Damage · S = Scratch · M = Missing'));
  const table=node('table'),headRow=node('tr');
  for(const name of ['Function','Result','Notes'])headRow.append(node('th',name));table.append(headRow);
  for(const [key,label] of checks){const c=data.functions?.[key]||{},tr=node('tr');
   for(const val of [label,c.status||'N/A',c.note||''])tr.append(node('td',val));table.append(tr);
  }
  right.append(table);columns.append(left,right);section.append(columns);d.body.append(section);
  block('Accessories and Fuel',[['Accessories',(data.tools||[]).join(', ')],['Fuel',data.fuel]]);
  const notes=node('section');notes.append(node('h2','Work Description / Notes'),node('div',item.work_description||'','notes'));d.body.append(notes);
  if(item.approval_note||item.approved_at)block('Approval',[['Approval notes',item.approval_note],['Approved date',item.approved_at?String(item.approved_at).slice(0,10):'']]);
  const sign=node('footer');sign.append(node('b','Customer Signature'),node('b','Received By'));d.body.append(sign);
  let triggered=false;const doPrint=()=>{if(triggered||w.closed)return;triggered=true;w.focus();w.print();};
  img.onload=doPrint;img.onerror=doPrint;
  img.src=new win.URL('v2/features/insurance/vehicle-inspection-approved.png',win.location.href).href;
  win.setTimeout(doPrint,1000);
  return true;
 }

 function render(){
  if(!current())return;root.replaceChildren();root.className=options.section==='checklists'?'mc-prejob mc-prejob-list':'mc-prejob';
  const style=n('style');style.textContent='.mc-prejob{font:16px/1.5 system-ui;padding:18px;max-width:1050px;margin:auto;background:#f6f9fd;color:#23364a}.mc-prejob form,.mc-prejob article{padding:18px;border:1px solid #c9d9e8;border-radius:14px;background:white;margin:12px 0}.mc-prejob label{display:grid;gap:5px;margin:11px 0}.mc-prejob input,.mc-prejob select,.mc-prejob textarea{width:100%;box-sizing:border-box;padding:10px;font:inherit;border:1px solid #b8c9d9;border-radius:8px}.mc-prejob button{padding:10px 14px;margin:5px;border-radius:9px;border:1px solid #b8c9d9;background:white;color:#23364a;font:inherit}.mc-prejob textarea{min-height:140px}.mc-prejob .mc-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px}';style.textContent+="\n.mc-prejob{font:15px/1.5 system-ui,-apple-system,sans-serif!important;box-sizing:border-box;max-width:none!important;margin:0!important;padding:0 0 calc(96px + env(safe-area-inset-bottom))!important;background:#f3f8fa!important;color:#183c48!important;min-height:100dvh;width:100%;overflow-wrap:anywhere}\n.mc-prejob *{box-sizing:border-box}\n#modal:has(.mc-prejob),.modal:has(.mc-prejob){position:fixed!important;inset:0!important;z-index:9999!important;width:100vw!important;max-width:none!important;height:100dvh!important;margin:0!important;padding:0!important;overflow:auto!important;background:#f3f8fa!important}\n#modal:has(.mc-prejob) .modal-box,.modal:has(.mc-prejob) .modal-box{width:100%!important;max-width:none!important;min-height:100dvh!important;margin:0!important;padding:0!important;border-radius:0!important;box-shadow:none!important;background:#f3f8fa!important;overflow:visible!important}\n.mc-prejob>header{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:12px!important;flex-wrap:wrap!important;margin:0 0 16px!important;padding:18px clamp(16px,3.2vw,32px)!important;background:linear-gradient(110deg,#e4f5ef,#e7f5fb)!important;border:0!important;border-bottom:3px solid #238f86!important;color:#154a50!important}\n.mc-prejob>header h2{color:#154a50!important;font-size:clamp(20px,3vw,27px)!important;line-height:1.23!important;margin:0!important}\n.mc-prejob>header p{color:#456b74!important;font-size:13px!important;margin:4px 0 0!important}\n.mc-prejob>header button{background:#fff!important;color:#135b5d!important;border:1px solid #86c8bd!important;font-weight:800!important;min-height:44px!important;white-space:normal!important}\n.mc-prejob>[role=status]{margin:0 clamp(14px,3vw,32px) 8px!important;padding:4px!important;color:#145852!important;font-size:14px!important;min-height:22px}\n.mc-prejob form.mc-intake-form{width:calc(100% - clamp(28px,6vw,64px));max-width:1220px;margin:0 auto 26px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}\n.mc-prejob .mc-form-brand{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;background:#fff;border:1px solid #d0e2e7;border-radius:14px;padding:16px 19px;margin-bottom:14px}\n.mc-prejob .mc-form-brand strong{display:block;color:#15475c;font-size:clamp(18px,2.5vw,23px);font-weight:850}\n.mc-prejob .mc-form-brand small{display:block;color:#607b87;font-size:12px}\n.mc-prejob .mc-form-brand h3{color:#155967!important;font-size:18px!important;margin:0!important}\n.mc-prejob .mc-form-brand b{font-size:14px;color:#29586b}\n.mc-prejob .mc-form-hint{font-size:13px;color:#4d6877;margin:6px 3px 14px}\n.mc-prejob .mc-card{background:#fff;border:1px solid #d1e1e8;border-radius:14px;padding:18px;margin:0 0 14px;min-width:0}\n.mc-prejob .mc-card h3{font-size:19px!important;color:#155567!important;font-weight:850!important;margin:0 0 15px!important}\n.mc-prejob .mc-card p{color:#56707e;font-size:13px;margin:0 0 12px}\n.mc-prejob .mc-type-row{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}\n.mc-prejob label{font-size:14px;font-weight:750;color:#263f4b;margin:0!important;display:grid;gap:5px;min-width:0}\n.mc-prejob input,.mc-prejob select,.mc-prejob textarea{width:100%;max-width:100%;font:inherit!important;color:#193f4e!important;background:#fff!important;border:1px solid #adbecb!important;border-radius:9px!important;padding:11px 12px!important;min-height:47px!important;opacity:1!important}\n.mc-prejob input::placeholder,.mc-prejob textarea::placeholder{color:#61798a!important;opacity:1}\n.mc-prejob input:focus-visible,.mc-prejob select:focus-visible,.mc-prejob textarea:focus-visible,.mc-prejob button:focus-visible{outline:3px solid #42a7aa!important;outline-offset:2px}\n.mc-prejob .mc-vehicle-fields,.mc-prejob .mc-customer-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px}\n.mc-prejob .mc-odometer{display:grid;grid-template-columns:minmax(92px,.38fr) minmax(0,1fr);gap:8px}\n.mc-prejob .mc-inspection-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,1fr);gap:14px;align-items:start}\n.mc-prejob .mc-damage-card{grid-row:span 2}\n.mc-prejob .mc-damage-controls{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}\n.mc-prejob button{font:inherit!important;color:#154b54!important;border-radius:9px!important;min-height:44px!important;padding:9px 12px!important;font-weight:750!important;background:#fff!important;border:1px solid #afd1d2!important;cursor:pointer}\n.mc-prejob .mc-damage-controls button{font-size:13px!important;background:#f3f9fb!important;border:1px solid #bad3df!important}\n.mc-prejob .mc-damage-controls [aria-pressed=true]{background:#d4edf1!important;border-color:#358e9b!important;box-shadow:inset 0 0 0 1px #358e9b!important}\n.mc-prejob .mc-car-stage{position:relative;aspect-ratio:1536/1152;width:100%;max-width:820px;margin:0 auto 10px;border:1px solid #d2e4eb;background:#eaf4f8;border-radius:13px;overflow:hidden}\n.mc-prejob .mc-car-stage img{display:block;width:100%;height:100%;object-fit:contain}\n.mc-prejob .mc-car-stage .mc-zone{position:absolute!important;transform:translate(-50%,-50%);border:2px solid white!important;border-radius:50%!important;width:clamp(25px,3.3vw,35px)!important;height:clamp(25px,3.3vw,35px)!important;min-height:0!important;padding:0!important;display:grid;place-items:center;background:#187b91!important;color:#fff!important;font-size:16px!important;line-height:1!important;box-shadow:0 2px 5px #1f556866!important}\n.mc-prejob .mc-car-stage .mc-zone[data-mark=X]{background:#cc353d!important}\n.mc-prejob .mc-car-stage .mc-zone[data-mark=S]{background:#2065b1!important}\n.mc-prejob .mc-car-stage .mc-zone[data-mark=M]{background:#c77914!important}\n.mc-prejob .mc-key{display:flex;gap:8px;flex-wrap:wrap;color:#4c6979;font-size:12px;font-weight:700}\n.mc-prejob .mc-function-head,.mc-prejob .mc-function-row{display:grid;grid-template-columns:minmax(0,2fr) repeat(3,minmax(45px,.65fr));gap:4px;align-items:center}\n.mc-prejob .mc-function-head{border-bottom:2px solid #cfe3e8;padding:8px 0;text-align:center;font-size:12px;color:#335b6d}\n.mc-prejob .mc-function-row{border-bottom:1px solid #e3edf1;padding:9px 0}\n.mc-prejob .mc-function-row strong{font-size:13px;color:#254959}\n.mc-prejob .mc-function-row label{display:flex;align-items:center;justify-content:center;min-height:36px!important;margin:0!important}\n.mc-prejob .mc-function-row input[type=radio]{appearance:auto!important;width:22px!important;height:22px!important;min-height:22px!important;padding:0!important;margin:0!important;accent-color:#0c7d78!important}\n.mc-prejob .mc-check-note{margin:4px 0 13px;display:none}\n.mc-prejob .mc-check-note[data-visible=true]{display:grid}\n.mc-prejob .mc-accessories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}\n.mc-prejob .mc-accessories label{display:flex;align-items:center;gap:9px;background:#f6fafc;border:1px solid #d5e4e9;padding:11px 9px;border-radius:11px;font-size:12px!important;min-height:55px!important}\n.mc-prejob .mc-accessories input[type=checkbox]{width:22px!important;height:22px!important;min-height:22px!important;flex:none;accent-color:#0b847c!important;margin:0!important}\n.mc-prejob textarea[name=work_description]{min-height:174px!important;resize:vertical;line-height:1.5}\n.mc-prejob .mc-customer-ack{background:#f2faf8;border-color:#bfe0d9}\n.mc-prejob .mc-submit{width:100%;min-height:53px!important;border-radius:11px!important;color:#fff!important;background:linear-gradient(105deg,#0b7280,#14876d)!important;border:1px solid #097175!important;font-size:16px!important;font-weight:850!important}\n.mc-prejob .mc-submit:disabled{opacity:.6!important;cursor:wait}\n.mc-prejob .mc-saved-list{width:calc(100% - clamp(28px,6vw,64px));max-width:1220px;margin:18px auto!important;padding:12px!important;background:#fff;border:1px solid #d3e4e8;border-radius:14px}\n.mc-prejob .mc-saved-list summary{font-weight:850;color:#155567;cursor:pointer;padding:6px}\n.mc-prejob .mc-saved-list article{background:#f9fcfd;border:1px solid #d9e7ec;border-radius:12px;padding:12px;margin:8px 0}\n.mc-prejob .mc-saved-list textarea{min-height:90px!important}\n.mc-prejob .mc-saved-list button{margin:5px!important}\n.mc-prejob [hidden]{display:none!important}\n@media(max-width:920px){.mc-prejob .mc-inspection-grid{grid-template-columns:1fr}.mc-prejob .mc-damage-card{grid-row:auto}}\n@media(max-width:600px){.mc-prejob>header{padding:14px 16px!important}.mc-prejob .mc-form-brand{padding:14px}.mc-prejob .mc-card{padding:14px}.mc-prejob .mc-vehicle-fields,.mc-prejob .mc-customer-fields{grid-template-columns:1fr}.mc-prejob .mc-car-stage .mc-zone{width:26px!important;height:26px!important;font-size:14px!important}.mc-prejob .mc-function-row strong{font-size:12px}.mc-prejob .mc-function-head,.mc-prejob .mc-function-row{grid-template-columns:minmax(0,1.5fr) repeat(3,minmax(42px,.6fr))}}\n";style.textContent+='\n.mc-list-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}.mc-list-toolbar input{flex:1;min-width:180px}.mc-list-toolbar select{width:auto;flex:0 1 210px}.mc-list-record{border-left:4px solid #14867b!important}.mc-list-record>strong{font-size:16px;color:#124b54}.mc-list-record>p{font-weight:700}.mc-record-detail{padding:9px;margin-top:10px;background:#f3faf9;border:1px solid #d1e8e3;border-radius:9px}.mc-record-detail summary{font-size:13px!important}.mc-record-detail p{overflow-wrap:anywhere;margin:5px 0}.mc-list-record>button{background:#e6f5f0!important;color:#135b56!important;border-color:#9bcebc!important}';root.append(style);

  style.textContent+=`
  .mc-prejob-list>header{background:linear-gradient(105deg,#122c43,#15567f)!important;border-bottom:0!important}
  .mc-prejob-list>header h2,.mc-prejob-list>header p{color:white!important}
  .mc-prejob-list .mc-saved-list{max-width:none;border-color:#cbddef}
  .mc-prejob-list .mc-list-toolbar{background:#eef5fc;border:1px solid #cbddef;border-radius:12px;padding:10px}
  .mc-prejob-list .mc-list-record{background:white;border:1px solid #cbddef;border-left-color:#d78128!important;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px 12px;align-items:start}
  .mc-prejob-list .mc-list-number{background:#e2f1fb;border-radius:7px;padding:2px 7px;color:#15567f;font-weight:800}
  .mc-prejob-list .mc-list-copy strong,.mc-prejob-list .mc-list-copy small{display:block}
  .mc-prejob-list .mc-list-copy small{margin:3px 0 6px;color:#46617a}
  .mc-prejob-list .mc-list-status{display:inline-block;background:#e9eff7;border-radius:8px;padding:2px 8px;font-size:12px;font-weight:750}
  .mc-prejob-list .mc-list-record>button{background:#155f91!important;color:white!important;margin:0!important}
  .mc-prejob-list .mc-list-record>button~button,.mc-prejob-list .mc-list-record>textarea,.mc-prejob-list .mc-record-detail{grid-column:2/-1}
  @media(max-width:600px){.mc-prejob-list .mc-list-record{grid-template-columns:auto minmax(0,1fr)}.mc-prejob-list .mc-list-record>button{grid-column:2/-1;justify-self:start}}
  `;
  const head=n('header');
  const title=n('div');
  title.append(n('h2',options.section==='checklists'?'Mechanical — Check Lists':'Mechanical — Create Checklist'),n('p','Cash / Credit · Reception-style vehicle intake · Independent of Job Card creation'));
  const leave=action('← Mechanical dashboard',()=>{
   if(!f?.dataset.saved&&f?.dataset.dirty==='true'&&!win.confirm('This checklist has unsaved changes. Leave without saving?'))return;
   disposed=true;options.onClose?.();
  });
  head.append(title,leave);root.append(head);

  root.append(n('p',message,{role:'status','aria-live':'polite'}));

  const f=n('form',null,{class:'mc-intake-form'});
  const brand=n('div',null,{class:'mc-form-brand'});
  const brandName=n('div');brandName.append(n('strong','ZUKAIT INTERNATIONAL LLC'),n('small','Vehicle Reception · Mechanical Department · Oman'));
  const brandLabel=n('div');brandLabel.append(n('h3','استمارة استلام المركبة'),n('b','Vehicle Reception Checklist'));
  brand.append(brandName,brandLabel);f.append(brand);
  f.append(n('p','Same vehicle inspection layout as Reception, restricted to Cash or Credit. Approval is recorded before opening a Job Card.',{class:'mc-form-hint'}));
  const card=(title,klass)=>{const el=n('section',null,{class:'mc-card '+klass});el.append(n('h3',title));return el;};
  const typeCard=card('Checklist Type / نوع العمل','mc-type-card');
  const type=n('label','Job Type / نوع العمل');
  const select=n('select',null,{name:'job_type','aria-label':'Mechanical checklist job type'});
  for(const v of ['CASH','CREDIT'])select.append(n('option',v==='CASH'?'Cash':'Credit',{value:v}));
  type.append(select);typeCard.append(type);f.append(typeCard);
  const vehicleCard=card('Vehicle Information / معلومات المركبة','mc-vehicle-card');
  const vehicleFields=n('div',null,{class:'mc-vehicle-fields'});
  for(const [title,name,required] of [
    ['Registration No. / رقم المركبة','registration',true],['Make / الشركة المصنعة','make',true],
    ['Model / الموديل','model',true],['Year / سنة الصنع','year',true]
  ])field(vehicleFields,title,name,required);
  const odo=n('label','Odometer / قراءة العداد'),odometerBox=n('div',null,{class:'mc-odometer'});
  const unit=n('select',null,{name:'odometer_unit','aria-label':'Odometer unit'});
  unit.append(n('option','KM',{value:'KM'}),n('option','Mile',{value:'Miles'}));
  const odometer=n('input',null,{name:'odometer',type:'text',inputmode:'numeric',placeholder:'Reading'});
  odometerBox.append(unit,odometer);odo.append(odometerBox);vehicleFields.append(odo);
  field(vehicleFields,'VIN / رقم الهيكل','vin',false);
  vehicleCard.append(vehicleFields);f.append(vehicleCard);
  const customerCard=card('Customer Information / معلومات العميل','mc-customer-card');
  const customerFields=n('div',null,{class:'mc-customer-fields'});
  field(customerFields,'Customer Name / اسم العميل','customer',true);
  field(customerFields,'Contact Number / رقم الهاتف','contact',true);
  customerCard.append(customerFields);f.append(customerCard);
  const inspectionGrid=n('div',null,{class:'mc-inspection-grid'});
  const damageCard=card('فحص أضرار المركبة / Vehicle Damages','mc-damage-card');
  damageCard.append(n('p','Select X, S or M, then tap the corresponding vehicle part. Tap again to remove the mark.'));
  let markMode='X';
  const damageActions=n('div',null,{class:'mc-damage-controls',role:'group','aria-label':'Damage marking type'});
  for(const [value,label] of [['X','🔴 X · Dent'],['S','🔵 S · Scratch'],['M','🟠 M · Missing']]){
   const button=action(label,()=>{
    markMode=value;
    damageActions.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===value)));
   });
   button.dataset.mode=value;button.setAttribute('aria-pressed',String(value==='X'));
   damageActions.append(button);
  }
  const clearMarks=action('Clear marks',()=>{
   if(Object.keys(damageMarks).length&&!win.confirm('Clear all vehicle damage marks?'))return;
   for(const key of Object.keys(damageMarks))delete damageMarks[key];
   damageStage.querySelectorAll('[data-zone]').forEach(b=>{b.dataset.mark='';b.textContent='+';});
  });damageActions.append(clearMarks);damageCard.append(damageActions);
  const damageMarks={},damageStage=n('div',null,{class:'mc-car-stage'});
  damageStage.append(n('img',null,{src:'v2/features/insurance/vehicle-inspection-approved.png',alt:'Reception vehicle inspection: LH above, rear left, front right, RH below'}));
  const places=[
   [85,48],[72,43],[77,16],[78,76],[59,19],[59,73],[40,19],[40,73],
   [44,43],[23,17],[22,76],[18,44],[11.5,47],[58,43],[30,47],[86,38],[13,56]
  ];
  parts.forEach((part,i)=>{
   const zone=action('+',()=>{
    const next=damageMarks[part]===markMode?'':markMode;
    if(next)damageMarks[part]=next;else delete damageMarks[part];
    zone.dataset.mark=next;zone.textContent=next||'+';
   });
   zone.setAttribute('data-zone',part);zone.dataset.mark='';zone.style.left=places[i][0]+'%';zone.style.top=places[i][1]+'%';
   zone.className='mc-zone';zone.title=part;
   zone.setAttribute('aria-label',part+' damage mark');
   damageStage.append(zone);
  });
  damageCard.append(damageStage,n('div','X = Dent / Damage · S = Scratch · M = Missing',{class:'mc-key'}));
  inspectionGrid.append(damageCard);
  const accessoryCard=card('الملحقات والمعدات / Accessories & Equipment','mc-accessory-card');
  accessoryCard.append(n('p','Record items present at inspection; unchecked items are not recorded.'));
  const accessories=n('div',null,{class:'mc-accessories'});
  for(const [name,value] of [
    ['Spare Tyre','spare_tyre'],['Jack','jack'],['Wheel Spanner','wheel_spanner'],
    ['Tool Kit','tool_kit'],['Spare Key','spare_key'],['Warning Triangle','warning_triangle'],
    ['First Aid Kit','first_aid_kit'],['Floor Mats','floor_mats'],['Radio / Audio','radio_tape'],
    ['Wheel Covers','wheel_covers']
  ]){const l=n('label');l.append(n('input',null,{type:'checkbox',name:'accessory',value}),n('span',name));accessories.append(l);}
  accessoryCard.append(accessories);
  const fuelLabel=n('label','Fuel Level / مستوى الوقود'),fuel=n('select',null,{name:'fuel'});
  for(const [value,label] of [['','Not recorded'],['Empty','E — Empty'],['Quarter','1/4'],['Half','1/2'],['Three quarters','3/4'],['Full','F — Full']])fuel.append(n('option',label,{value}));
  fuelLabel.append(fuel);accessoryCard.append(fuelLabel);
  inspectionGrid.append(accessoryCard);
  const functionCard=card('Function Check / فحص الوظائف','mc-function-card');
  const functionHead=n('div',null,{class:'mc-function-head'});
  for(const label of ['Item','OK','Issue','N/A'])functionHead.append(n('strong',label));
  functionCard.append(functionHead);
  for(const [key,title] of checks){
   const row=n('div',null,{class:'mc-function-row'});row.append(n('strong',title));
   for(const [value,label] of [['OK','OK'],['ISSUE','Issue'],['NOT_CHECKED','N/A']]){
    const l=n('label'),radio=n('input',null,{type:'radio',name:'check_'+key,value,'aria-label':title+' '+label});
    if(value==='NOT_CHECKED')radio.checked=true;
    l.append(radio);row.append(l);
   }
   const note=n('label',title+' — issue notes',{class:'mc-check-note','data-visible':'false'});
   const noteField=n('textarea',null,{name:'note_'+key,rows:'2',maxlength:'300',placeholder:'Describe the issue'});
   note.append(noteField);
   row.addEventListener('change',()=>{
    const selected=row.querySelector('input[type=radio]:checked')?.value;
    note.dataset.visible=String(selected==='ISSUE');
    noteField.required=selected==='ISSUE';
   });
   functionCard.append(row,note);
  }
  inspectionGrid.append(functionCard);f.append(inspectionGrid);
  const notes=card('Work Descriptions / Notes','mc-notes-card');
  const noteLabel=n('label','Work Description / Notes'),textarea=n('textarea',null,{name:'work_description',rows:'6',maxlength:'2000',placeholder:'Describe repairs, customer requests and inspection observations'});
  textarea.required=true;noteLabel.append(textarea);notes.append(noteLabel);f.append(notes);
  const acknowledgement=card('إقرار العميل / Customer Acknowledgement','mc-customer-ack');
  acknowledgement.append(n('p','The customer signs the printed checklist after inspection. No signature photo is stored.'));
  f.append(acknowledgement);
  const save=n('button','Save Checklist — No Job Card Created',{type:'submit',class:'mc-submit'});save.disabled=busy;
  f.append(save);
  f.addEventListener('input',()=>{f.dataset.dirty='true';});
  f.addEventListener('change',()=>{f.dataset.dirty='true';});
  f.onsubmit=async event=>{
   event.preventDefault();if(busy||!current())return;
   const v=new win.FormData(f),inspection={functions:{},damageMarks:Object.entries(damageMarks).map(([part,mark])=>({part,mark})),tools:v.getAll('accessory'),fuel:String(v.get('fuel')||'')};
   for(const [key,title] of checks){
    const status=String(v.get('check_'+key)||'NOT_CHECKED'),note=String(v.get('note_'+key)||'').trim();
    if(status==='ISSUE'&&!note){
     message='Enter notes for '+title+' because it is marked Issue.';
     root.querySelector('[role=status]').textContent=message;
     f.querySelector('[name="note_'+key+'"]')?.focus();return;
    }
    inspection.functions[key]={status,...(note?{note}:{})};
   }
   const vehicle=Object.fromEntries(['registration','make','model','year','odometer','vin','customer','contact'].map(k=>[k,String(v.get(k)||'').trim()]));
   vehicle.odometer_unit=String(v.get('odometer_unit')||'KM');
   const kind=String(v.get('job_type')||'').toUpperCase();
   if(!['CASH','CREDIT'].includes(kind)){message='Mechanical checklists are Cash or Credit only.';root.querySelector('[role=status]').textContent=message;return;}
   const command={operation:'CREATE',id:options.uuid?.()||win.crypto.randomUUID(),job_type:kind,registration:vehicle.registration,vehicle,inspection,work_description:String(v.get('work_description')||'').trim()};
   busy=true;save.disabled=true;
   try{
    const r=await call(command);
    message='Checklist '+r.checklist.checklist_number+' saved as Pending. No Job Card created.';
    items.unshift(r.checklist);f.reset();f.dataset.dirty='false';
    for(const key of Object.keys(damageMarks))delete damageMarks[key];
    damageStage.querySelectorAll('[data-zone]').forEach(b=>{b.dataset.mark='';b.textContent='+';});
    functionCard.querySelectorAll('.mc-check-note').forEach(l=>{l.dataset.visible='false';l.querySelector('textarea').required=false;});
   }catch(err){message='Not confirmed: '+err.message+' Keep your entered details and retry.';}
   finally{busy=false;save.disabled=false;const p=root.querySelector('[role=status]');if(p)p.textContent=message;}
  };
  if(options.section!=='checklists')root.append(f);

  const lookup=n('details',null,{class:'mc-saved-list','data-mechanical-prejob-list':'true'});
  lookup.open=options.section==='checklists';
  lookup.append(n('summary',options.section==='checklists'?'Mechanical Check Lists · Search / Approval / Print':'Saved Mechanical Checklists · Search / Approval / Print'));
  const toolbar=n('div',null,{class:'mc-list-toolbar'});
  const search=n('input',null,{type:'search',placeholder:'Search registration or checklist number','aria-label':'Search Mechanical checklists'});
  search.value=query;
  const searchNow=()=>{if(options.section!=='checklists'&&f.dataset.dirty==='true'&&!win.confirm('Discard unsaved checklist details to search?'))return;query=search.value.trim();refresh();};
  search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchNow();}});
  toolbar.append(search,action('Search',searchNow));
  const filter=n('select',null,{'aria-label':'Mechanical checklist status filter'});
  for(const [value,label] of [['ALL','All checklists'],['PENDING','Approval pending'],['APPROVED','Approved'],['DECLINED','Declined'],['UNLINKED','Job Card not open'],['LINKED','Job Card opened']])filter.append(n('option',label,{value}));
  filter.value=statusFilter;filter.onchange=()=>{statusFilter=filter.value;render();};
  toolbar.append(filter);
  if(options.section==='checklists'&&typeof options.onCreateChecklist==='function')toolbar.append(action('Create Checklist',options.onCreateChecklist));
  if(options.section==='checklists'&&typeof options.onOpenLegacyList==='function')toolbar.append(action('Existing Job-linked Checklists',options.onOpenLegacyList));
  lookup.append(toolbar);
  const filtered=items.filter(item=>statusFilter==='ALL'||(
   statusFilter==='UNLINKED'?!item.linked_job_card&&item.approval_status!=='DECLINED':
   statusFilter==='LINKED'?!!item.linked_job_card:item.approval_status===statusFilter));
  lookup.append(n('p',filtered.length+' checklist(s) shown · '+items.length+' loaded'));
  if(!filtered.length)lookup.append(n('p','No checklists match the selected filter.'));
  for(const [index,item] of filtered.entries()){
   const panel=n('article',null,{class:'mc-list-record'});
   if(options.section==='checklists'){
    const v=item.vehicle||{},vehicle=[v.make,v.model].filter(Boolean).join(' ');
    const copy=n('div',null,{class:'mc-list-copy'});
    const date=String(item.created_at||'').slice(0,10).replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1');
    const type={CASH:'Cash',CREDIT:'Credit'}[item.job_type];
    copy.append(n('strong',[item.checklist_number,win.formatVehicleName?.(vehicle)||vehicle,v.year].filter(Boolean).join(' · ')),
     n('small',[item.registration,type,date,item.linked_job_card?'JC '+item.linked_job_card:''].filter(Boolean).join(' · ')),
     n('span',({PENDING:'Approval Waiting',APPROVED:'Approved',DECLINED:'Declined'})[item.approval_status]||'Pending',{class:'mc-list-status'}));
    panel.append(n('span',String(index+1),{class:'mc-list-number'}),copy);
   }else{
    panel.append(n('strong',String(item.checklist_number||'')+' · '+String(item.registration||'')),
     n('p',String(item.job_type||'')+' · '+String(item.approval_status||'PENDING')+(item.linked_job_card?' · JC '+item.linked_job_card:'')));
   }
   panel.append(action('Print Checklist',()=>{
    if(!printSavedChecklist(item,places)){message='Allow pop-ups to print the checklist.';root.querySelector('[role=status]').textContent=message;}
   }));
   const detail=n('details',null,{class:'mc-record-detail'});detail.append(n('summary','View complete checklist'));
   const v=item.vehicle||{},ins=item.inspection||{};
   for(const [label,val] of [
    ['Vehicle',[v.make,v.model,v.year].filter(Boolean).join(' ')],['Registration',item.registration],
    ['Odometer',v.odometer?String(v.odometer)+' '+String(v.odometer_unit||'KM'):''],
    ['VIN',v.vin],['Customer',v.customer],['Contact',v.contact],
    ['Accessories',(ins.tools||[]).join(', ')],['Fuel',ins.fuel],
    ['Work notes',item.work_description],['Approval notes',item.approval_note]
   ])detail.append(n('p',label+': '+(val||'—')));
   const marks=n('div',null,{class:'mc-saved-damage'});
   for(const mark of ins.damageMarks||[])marks.append(n('span',String(mark.part)+' ('+String(mark.mark)+') '));
   detail.append(n('h4','Vehicle damage marks'),marks,n('h4','Function check'));
   for(const [key,label] of checks){const val=ins.functions?.[key]||{};detail.append(n('p',label+': '+String(val.status||'N/A')+(val.note?' — '+val.note:'')));}
   panel.append(detail);
   if(item.approval_status==='PENDING'&&!item.linked_job_card){
    const note=n('textarea',null,{placeholder:'Customer approval reference, date or reason','aria-label':'Checklist approval notes'});
    panel.append(note);
    for(const [caption,approved] of [['Customer approved',true],['Customer declined',false]]){
     panel.append(action(caption,async()=>{
      if(busy)return;
      const noteText=note.value.trim();
      if(noteText.length<3){message='Enter approval notes (at least 3 characters).';root.querySelector('[role=status]').textContent=message;note.focus();return;}
      busy=true;
      try{await call({operation:'APPROVE',id:item.id,expected_revision:item.revision,approved,note:noteText});busy=false;message=approved?'Checklist approved.':'Checklist declined.';await refresh(true);}
      catch(e){busy=false;message='Approval was not confirmed: '+e.message;const p=root.querySelector('[role=status]');if(p)p.textContent=message;}
     }));
    }
   }
   if(item.approval_status==='APPROVED'&&!item.linked_job_card&&typeof options.onCreateJob==='function')
    panel.append(action('Create Job Card from approved checklist',()=>options.onCreateJob(item)));
   lookup.append(panel);
  }
  root.append(lookup);
 }
 render();refresh();return {destroy(){disposed=true;root.replaceChildren();}};
}
