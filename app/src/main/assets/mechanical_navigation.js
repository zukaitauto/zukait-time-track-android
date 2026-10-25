// Opt-in integration with existing account menus; no observer/polling/auth API.
export function installMechanicalNavigation({host,document:doc,getUser,enabled,open}){
 const originals=new Map(),marker='data-mechanical-navigation';
 function enhance(){
  const modal=doc.getElementById('modal'),user=getUser();if(!modal)return;
  if(enabled()!==true||!['Manager','Supervisor','Mechanical Supervisor'].includes(user?.role)){modal.querySelectorAll('['+marker+']').forEach(e=>e.remove());return}
  const menu=user.role==='Manager'?modal.querySelector('.v135-manager-menu,.v88-role-account'):modal.querySelector('.v88-role-account,.v88-header-menu-grid');
  if(!menu||menu.querySelector('['+marker+']'))return;
  const button=doc.createElement('button');button.type='button';button.setAttribute(marker,user.role);button.className=user.role==='Manager'?'v135-action mechanical':'v88-mechanical';
  button.style.minHeight='44px';button.style.minWidth='0';button.style.overflowWrap='anywhere';
  const icon=doc.createElement('i'),label=doc.createElement('span'),title=doc.createElement('b');icon.textContent='🔧';title.textContent='Mechanical Department';label.append(title);button.append(icon,label);
  button.addEventListener('click',async()=>{
   const current=getUser();if(enabled()!==true||!['Manager','Supervisor','Mechanical Supervisor'].includes(current?.role)||current.id!==user.id||current.role!==user.role)return;
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
