// Opt-in integration with existing account menus; no observer/polling/auth API.
export function installMechanicalNavigation({host,document:doc,getUser,enabled,open}){
 const originals=new Map(),marker='data-mechanical-navigation';
 // Only the Mechanical Supervisor account can access Mechanical from a Supervisor menu.
 // General Bodyshop/Final-QC supervisors must not be shown this launcher.
 const permitted=user=>user?.role==='Manager'||user?.role==='Mechanical Supervisor'||(user?.role==='Supervisor'&&String(user?.id||'').toUpperCase()==='SUP003');
 function enhance(){
  const modal=doc.getElementById('modal'),user=getUser();if(!modal)return;
  if(enabled()!==true||!permitted(user)){modal.querySelectorAll('['+marker+']').forEach(e=>e.remove());return}
  const menu=user.role==='Manager'?modal.querySelector('.v135-manager-menu,.v88-role-account'):modal.querySelector('.v88-role-account,.v88-header-menu-grid');
  if(!menu||menu.querySelector('['+marker+']'))return;
  const button=doc.createElement('button');button.type='button';button.setAttribute(marker,user.role);button.className=user.role==='Manager'?'v135-action mechanical':'v88-mechanical';
  button.style.minHeight='44px';button.style.minWidth='0';button.style.overflowWrap='anywhere';
  // The supervisor menu can inherit dark text on a dark button from its host theme.
  // Make this navigation tile readable regardless of the surrounding menu styles.
  if(user.role!=='Manager'){
   button.style.setProperty('background','#1d4ed8','important');
   button.style.setProperty('color','#ffffff','important');
   button.style.setProperty('border','1px solid #1e40af','important');
  }
  const icon=doc.createElement('i'),label=doc.createElement('span'),title=doc.createElement('b');icon.textContent='🔧';title.textContent='Mechanical Department';
  if(user.role!=='Manager'){label.style.setProperty('color','#ffffff','important');title.style.setProperty('color','#ffffff','important')}
  label.append(title);button.append(icon,label);
  button.addEventListener('click',async()=>{
   const current=getUser();if(enabled()!==true||!permitted(current)||current.id!==user.id||current.role!==user.role)return;
   button.disabled=true;
   try{await open()}catch{let notice=menu.querySelector('[data-mechanical-menu-notice]');if(!notice){notice=doc.createElement('p');notice.setAttribute('data-mechanical-menu-notice','');notice.setAttribute('role','status');menu.append(notice)}notice.textContent='Unable to open Mechanical Department. Sync and try again.'}
   finally{button.disabled=false}
  });menu.append(button);
 }
 for(const name of ['v111OpenManagerMenu','v135OpenManagerMenu','v110OpenManagerMenu','v65OpenAccount','openSupervisorHeaderMenu']){
  const previous=host[name];if(typeof previous!=='function'||previous.mechanicalNavigationWrapper)continue;
  const wrapper=function(){const result=previous.apply(this,arguments);enhance();return result};
  wrapper.mechanicalNavigationWrapper=true;originals.set(name,{previous,wrapper});host[name]=wrapper;
 }
 return {enhance,uninstall(){for(const [name,{previous,wrapper}] of originals)if(host[name]===wrapper)host[name]=previous;doc.querySelectorAll('['+marker+']').forEach(e=>e.remove())}};
}
