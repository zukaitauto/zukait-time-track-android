(function(){
  "use strict";
  // One Reception workspace for existing Manager/Supervisor sessions and
  // the dedicated Receptionist session. All lists come from the same server.
  const definitions=[
    ["new","Create Checklist","New vehicle intake","📝"],
    ["create-job","Create Job Card","Cash / Credit · approved Insurance","🚗"],
    ["checklists","Checklist List","Number · date · month · search","📋"],
    ["jobs","Job Card List","Number · date · month · search","🗂"],
    ["waiting","Approval Waiting Insurance","Checklist not yet approved","⏳"],
    ["vwc","Vehicle With Customer","Checklists and Job Cards separately","🏠"],
    ["approved","Approved Vehicles","Until Job Card is opened","✅"],
    ["ready","Ready to Deliver","Shared QC authority","🚙"],
    ["delivered","Delivered Vehicle List","Latest delivered first","📦"],
    ["followup","Delivery Follow-up","Promise date · no promise date","📅"]
  ];
  // Correct the ampersand/angle/quote escapes without passing input as HTML.
  const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const role=()=>window.me?.role||"";
  const writable=()=>["Manager","Supervisor"].includes(role());
  let screen="home",section="checklists",page=0,filters={search:"",month:"",from:"",to:"",missing_only:false,dated_only:false};
  let backendAvailable=false;
  let counts={},latest=[],total=0,loading=false,sequence=0,pendingTimer=null;
  function css(){
    if(document.getElementById("rdb-css"))return;
    const s=document.createElement("style");s.id="rdb-css";
    s.textContent=`
    #rc-root .rdb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0 20px}
    #rc-root .rdb-grid>*{min-width:0;max-width:100%}
    #rc-root .rdb-content{min-width:0;overflow-wrap:anywhere;word-break:normal}
    #rc-root .rdb-filter>label{min-width:0;max-width:100%}
    #rc-root .rdb-filter>label input{min-width:0;max-width:100%}
    #rc-root .rdb-card{display:flex;align-items:center;gap:12px;text-align:left;padding:16px;min-height:94px;width:100%;background:#fff;color:#15374d;border:1px solid #ccdfed;border-radius:15px;box-shadow:0 5px 15px #18324a12;cursor:pointer;touch-action:manipulation;transition:transform .12s ease,box-shadow .12s ease}
    #rc-root .rdb-card:active{transform:translateY(2px);box-shadow:0 2px 8px #18324a12}
    @media(hover:hover){#rc-root .rdb-card:hover{border-color:#5bacaa;box-shadow:0 7px 18px #18324a20}}
    #rc-root .rdb-section-nav{display:flex;align-items:center;gap:12px;margin:8px 0 15px}
    #rc-root .rdb-section-nav button{min-height:44px;background:#e4f6f3!important;color:#125d5c!important;border:1px solid #8bc8c1!important;border-radius:12px!important;font-weight:800!important}
    #rc-root .rdb-card:focus-visible{outline:3px solid #138c91;outline-offset:2px}
    #rc-root .rdb-card[data-active=true]{background:#e6f8f5;border:2px solid #5bacaa}
    #rc-root .rdb-emoji{font-size:27px}#rc-root .rdb-content{display:flex;flex:1;flex-direction:column;gap:4px}
    #rc-root .rdb-content b{font-size:17px}#rc-root .rdb-content small{font-size:12px;color:#547085}
    #rc-root .rdb-count{font-size:21px;color:#0f6671;font-weight:900}
    #rc-root .rdb-filter{display:grid;grid-template-columns:2fr repeat(3,minmax(0,1fr));gap:10px}
    #rc-root .rdb-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:start;gap:12px;border:1px solid #d1e0ec;border-radius:12px;background:white;margin:9px 0;padding:13px}
    #rc-root .rdb-no{font-weight:900;color:#1a637e}#rc-root .rdb-row-content{min-width:0;overflow-wrap:anywhere}
    #rc-root .rdb-row-content b{font-size:16px}#rc-root .rdb-row-content small{display:block;margin-top:5px;font-size:13px}
    #rc-root .rdb-promise{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:8px}
    #rc-root .rdb-promise input{max-width:188px;width:auto;margin:0}#rc-root .rdb-row-actions{display:flex;flex-direction:column;gap:6px}
    #rc-root .rdb-row-actions button{margin:0!important;font-size:13px!important;min-height:37px!important}
    #rc-root .rdb-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
    #rc-root .rdb-toolbar h4{margin:0}#rc-root .rdb-status{font-size:14px;color:#42667c}
    @media(max-width:800px){#rc-root .rdb-filter{grid-template-columns:1fr 1fr}}
    @media(max-width:550px){#rc-root .rdb-grid{gap:8px}#rc-root .rdb-card{padding:11px;min-height:112px;gap:5px;flex-direction:column;align-items:flex-start;justify-content:center;min-width:0}
      #rc-root .rdb-emoji{font-size:19px}#rc-root .rdb-content b{font-size:14px}
      #rc-root .rdb-content small{font-size:11px}#rc-root .rdb-count{font-size:17px}
      #rc-root .rdb-filter{grid-template-columns:1fr 1fr}
      #rc-root .rdb-row{grid-template-columns:25px 1fr}
      #rc-root .rdb-row-actions{grid-column:2;flex-direction:row;flex-wrap:wrap}}
    `;
    document.head.appendChild(s);
  }
  const countFor=key=>key==="new"||key==="create-job"?"":key==="vwc"?counts.vwc??"":counts[key]??"";
  function tiles(){
    return definitions.map(([key,title,sub,icon],index)=>
      '<button type="button" class="rdb-card" data-rdb="tile" data-section="'+key+'" data-active="false" aria-label="Open '+safe(title)+'">'+
      '<span class="rdb-emoji" aria-hidden="true">'+icon+'</span><span class="rdb-content"><b>'+(index+1)+'. '+safe(title)+
      '</b><small>'+safe(!backendAvailable&&!['new','checklists'].includes(key)?'Server update required':sub)+'</small></span><span class="rdb-count">'+safe(backendAvailable?countFor(key):'')+'</span></button>').join("");
  }
  const label=key=>definitions.find(x=>x[0]===key)?.[1]||"Reception";
  function filterHtml(){
    return '<div class="rdb-filter">'+
      '<label>Search<input data-rdb-filter="search" placeholder="RC / JC / registration / vehicle" value="'+safe(filters.search)+'"></label>'+
      '<label>Month<input type="month" data-rdb-filter="month" value="'+safe(filters.month)+'"></label>'+
      '<label>From<input type="date" data-rdb-filter="from" value="'+safe(filters.from)+'"></label>'+
      '<label>To<input type="date" data-rdb-filter="to" value="'+safe(filters.to)+'"></label></div>'+
      (section==="followup"?'<label>Promise Date Filter<select data-rdb-filter="promise-mode"><option value="all">All undelivered vehicles</option>'+
      '<option value="missing"'+(filters.missing_only?' selected':'')+'>No promise date ('+safe(counts.no_promise_date??0)+')</option>'+
      '<option value="dated"'+(filters.dated_only?' selected':'')+'>With promise date</option></select></label>':'');
  }
  function rowHtml(row,index){
    const isJob=!!row.job_card,live=!row.delivered&&isJob,canEdit=live&&writable();
    const title=isJob?"JC "+safe(row.job_card):"Checklist "+safe(row.rc_no);
    const date=section==="delivered"?"Delivered: "+(row.delivered_date||"Not recorded"):
      section==="followup"?"Promise: "+(row.promise_date||"No promise date"):
      "Received: "+(row.received_date||row.created_date||"Not recorded");
    const promise=canEdit?
      '<div class="rdb-promise"><label>Promise Date (optional)<input type="date" data-rdb-promise="'+safe(row.job_card)+
      '" value="'+safe(row.promise_date)+'"></label><button type="button" data-rdb="promise" data-job="'+safe(row.job_card)+
      '" data-original="'+safe(row.promise_date)+'">Save</button></div>':
      isJob?'<small>Promise: '+safe(row.promise_date||"No promise date")+'</small>':'';
    const open='<button type="button" data-rdb="open" data-rc="'+safe(row.rc_no)+'" data-job="'+safe(row.job_card)+'">'+
      (row.rc_no?'Open Checklist':'View Job Card')+'</button>';
    const deliver=section==="ready"?
      '<button type="button" data-rdb="delivery" data-job="'+safe(row.job_card)+'">'+
      (role()==="Manager"?"Open Ready List":"Vehicle Delivery")+'</button>':"";
    return '<div class="rdb-row"><span class="rdb-no">'+(index+1+page*50)+'.</span>'+
      '<div class="rdb-row-content"><b>'+title+' · '+safe(row.vehicle||"Vehicle not recorded")+
      '</b><small>'+safe(row.registration||"Registration not recorded")+' · '+safe(row.job_type||"")+
      (row.rc_no&&isJob?' · '+safe(row.rc_no):'')+'</small><small>'+safe(date)+
      ' · '+safe(row.location||row.status||"")+'</small>'+promise+'</div>'+
      '<div class="rdb-row-actions">'+open+deliver+'</div></div>';
  }
  function listHtml(){
    const vwc=section==="vwc";
    const requested=section==="vwc"?"vwc-checklists":section;
    return '<section class="rc-box"><div class="rdb-toolbar"><h4>'+safe(label(section))+'</h4>'+
      '<button type="button" data-rdb="refresh">↻ Refresh</button></div>'+
      (vwc?'<div class="rc-actions"><button type="button" data-rdb="vwc" data-section="vwc-checklists">'+
      'Checklists with Customer ('+safe(counts["vwc-checklists"]??0)+')</button>'+
      '<button type="button" data-rdb="vwc" data-section="vwc-jobs">Job Cards with Customer ('+
      safe(counts["vwc-jobs"]??0)+')</button></div>':'')+
      filterHtml()+'<div id="rdb-results" aria-live="polite"></div>'+
      '<div class="rdb-toolbar"><span id="rdb-page"></span><div>'+
      '<button type="button" data-rdb="previous">Previous</button> '+
      '<button type="button" data-rdb="next">Next</button></div></div></section>';
  }
  let vwcSection="vwc-checklists";
  function render(){
    css();
    const home=screen==="home";
    window.zukaitReception.dashboardShell(home?"Reception Dashboard":"Reception · "+label(section),
      home?'<p class="rdb-status">'+(backendAvailable?'Reception operations · Data confirmed by the server · Oman dates':'Checklist intake and list are available. The other dashboard functions need a server update.')+'</p>'+
        '<div class="rdb-grid">'+tiles()+'</div>'+
        (backendAvailable?'':'<section class="rc-box" id="rdb-unavailable" aria-live="polite"><h4>Your Reception dashboard</h4><p>Choose Create Checklist or Checklist List to use the current workshop service. Other sections are not yet available on this server; no counts or empty lists are assumed.</p></section>'):
        '<div class="rdb-section-nav"><button type="button" data-rdb="back-dashboard">← Reception Dashboard</button></div>'+listHtml());
    const root=document.getElementById("rc-root");if(!root)return;
    root.addEventListener("click",onClick);
    root.addEventListener("input",onFilter);
    root.addEventListener("change",onFilter);
    showRows();
  }
  function showRows(){
    const host=document.getElementById("rdb-results"),foot=document.getElementById("rdb-page");
    if(!host||!foot)return;
    host.innerHTML=loading?'<p>Loading from Reception server…</p>':
      latest.length?latest.map(rowHtml).join(""):'<p>No matching records found.</p>';
    foot.textContent=(total?("Showing "+(page*50+1)+"–"+Math.min((page+1)*50,total)+" of "+total):"0 records");
    const next=document.querySelector('#rc-root [data-rdb="next"]');
    const prev=document.querySelector('#rc-root [data-rdb="previous"]');
    if(next)next.disabled=(page+1)*50>=total;
    if(prev)prev.disabled=page===0;
  }
  async function load(){
    if(!backendAvailable)return;
    const request=++sequence;
    loading=true;showRows();
    const requestedSection=screen==="home"?"checklists":section==="vwc"?vwcSection:section;
    try{
      const r=await window.zukaitReception.action({action:"reception_dashboard",section:requestedSection,
        ...filters,page});
      if(request!==sequence)return;
      counts=r.counts||{};latest=r.rows||[];total=Number(r.total||0);
      const grid=document.querySelector("#rc-root .rdb-grid");
      if(grid)grid.innerHTML=tiles();
      const foot=document.getElementById("rdb-page");
      if(foot&&section==="followup") {
        const mode=document.querySelector('#rc-root [data-rdb-filter="promise-mode"] option[value="missing"]');
        if(mode)mode.textContent="No promise date ("+(counts.no_promise_date||0)+")";
      }
    }catch(e){if(request===sequence){latest=[];total=0;const err=document.getElementById("rc-error");if(err)err.textContent=e.message||String(e);}}
    finally{if(request===sequence){loading=false;showRows();}}
  }
  async function open(options={}){backendAvailable=options.backendAvailable===true;++sequence;clearTimeout(pendingTimer);loading=false;screen="home";section="checklists";vwcSection="vwc-checklists";page=0;
    filters={search:"",month:"",from:"",to:"",missing_only:false,dated_only:false};
    latest=[];counts={};total=0;render();await load();}
  // Preserve the selected list and filters when returning from a checklist.
  async function resume(){render();await load();}
  async function showDashboard(){
    screen="home";section="checklists";page=0;
    filters={search:"",month:"",from:"",to:"",missing_only:false,dated_only:false};
    latest=[];total=0;render();await load();
  }
  async function choose(next){
    if(!backendAvailable){
      if(next==="new")return window.zukaitReception.newChecklist();
      if(next==="checklists")return window.zukaitReception.checklistList();
      const notice=document.getElementById("rdb-unavailable");
      if(notice)notice.innerHTML="<h4>"+safe(label(next))+"</h4><p>This function needs the Reception server update. No records were loaded or changed. Use the existing workshop workflow until activation is verified.</p>";
      return;
    }
    if(next==="new")return window.zukaitReception.newChecklist();
    if(next==="create-job")return window.zukaitReception.directJob();
    screen="list";section=next;page=0;filters={search:"",month:"",from:"",to:"",missing_only:false,dated_only:false};
    latest=[];total=0;render();await load();
  }
  function onFilter(event){
    const k=event.target?.dataset?.rdbFilter;if(!k)return;
    if(k==="promise-mode"){
      filters.missing_only=event.target.value==="missing";
      filters.dated_only=event.target.value==="dated";
    }else filters[k]=event.target.value;
    if(event.type==="input"&&k!=="search")return;
    clearTimeout(pendingTimer);page=0;
    if(k==="search")pendingTimer=setTimeout(()=>load(),280);
    else void load();
  }
  async function savePromise(jobCard,date,original){
    if(!backendAvailable)throw Error("Promise Date needs the Reception server update.");
    if(!writable())throw Error("Only Manager or Supervisor can enter Promise Date.");
    if(date&&!/^\d{4}-\d\d-\d\d$/.test(date))throw Error("Choose a valid Promise Date.");
    const key="zukait_reception_promise_pending:"+window.zukaitReception.endpoint+":"+role()+":"+jobCard;
    let pending;
    const saved=localStorage.getItem(key);
    if(saved){pending=JSON.parse(saved);
      if(pending.promise_date!==date||pending.expected_promise_date!==original)
        throw Error("A previous Promise Date change is unconfirmed. Retry that entry first.");
    }else{
      pending={action:"reception_promise_date",job_card:jobCard,promise_date:date,
        expected_promise_date:original,request_id:crypto.randomUUID()};
      localStorage.setItem(key,JSON.stringify(pending));
      if(localStorage.getItem(key)!==JSON.stringify(pending))throw Error("Cannot safely save pending Promise Date.");
    }
    try{
      const r=await window.zukaitReception.action(pending);
      if(!r.ok)throw Error(r.code||"Promise Date not saved");
      localStorage.removeItem(key);
      try{await window.zukaitCloud?.pull?.(true);}catch(_){}
      return r;
    }catch(e){if(["reception_promise_conflict","reception_job_not_open","reception_promise_invalid_date"].includes(e.message))
      localStorage.removeItem(key);
      throw e;}
  }
  async function onClick(event){
    const button=event.target.closest("[data-rdb]");if(!button)return;
    event.preventDefault();
    try{
      const what=button.dataset.rdb;
      if(what==="tile"){await choose(button.dataset.section);return;}
      if(what==="back-dashboard"){await showDashboard();return;}
      if(what==="vwc"){vwcSection=button.dataset.section;page=0;latest=[];total=0;return load();}
      if(what==="refresh"){page=0;return load();}
      if(what==="previous"&&page>0){page--;return load();}
      if(what==="next"&&(page+1)*50<total){page++;return load();}
      if(what==="promise"){
        const jc=button.dataset.job;const inp=[...document.querySelectorAll("#rc-root [data-rdb-promise]")].find(x=>x.dataset.rdbPromise===jc);
        if(!inp)return;
        button.disabled=true;
        try{await savePromise(jc,inp.value,button.dataset.original);await load();}
        finally{button.disabled=false;}
        return;
      }
      if(what==="open"){
        if(button.dataset.rc)return window.zukaitReception.openRecord(button.dataset.rc);
        const row=latest.find(x=>x.job_card===button.dataset.job);
        if(!row)return;
        const viewDelivered=row.delivered&&typeof window.zukaitOpenDeliveredRecord==="function";
        if(viewDelivered)return window.zukaitOpenDeliveredRecord(row.job_card);
        window.zukaitReception.dashboardShell("Job Card "+row.job_card,
          '<div class="rc-box"><h4>'+safe(row.job_card)+" · "+safe(row.vehicle)+
          '</h4><p>'+safe(row.registration)+'</p><p>Status: '+safe(row.status)+
          '</p><p>Promise: '+safe(row.promise_date||"No promise date")+
          '</p><button data-rdb="back">Back to Reception Dashboard</button></div>');
        document.getElementById("rc-root")?.addEventListener("click",onClick);
        return;
      }
      if(what==="back"){render();await load();return;}
      if(what==="delivery"){
        if(role()==="Receptionist")return window.zukaitReceptionist?.deliveries?.();
        if(typeof window.v143OpenReadyForDelivery==="function")return window.v143OpenReadyForDelivery();
        return window.v74Ready?.();
      }
    }catch(e){const el=document.getElementById("rc-error");if(el)el.textContent=e.message||String(e);}
  }
  window.zukaitReceptionDashboard={open,resume,home:showDashboard,savePromise};
})();
