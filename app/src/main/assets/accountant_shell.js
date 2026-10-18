(function(){'use strict';
const $=id=>document.getElementById(id),api=()=>window.zukaitAccountant,bridge=()=>window.AndroidBridge;
let updateTimer=null,passwordBusy=false;
function network(){const online=navigator.onLine!==false;$('account-network').textContent=online?'● Online':'● Offline';$('account-network').classList.toggle('offline',!online);}
function close(){clearTimeout(updateTimer);$('account-check-update').disabled=false;$('account-password-form').reset();if(typeof $('account-menu').close==='function')$('account-menu').close();else $('account-menu').removeAttribute('open');$('account-menu-button').focus();}
function session(){const user=api()?.getUser();$('account-menu-button').disabled=!user;if(!user&&$('account-menu').hasAttribute('open'))close();}
$('account-menu-button').onclick=()=>{const user=api()?.getUser();if(!user)return;$('account-menu-identity').textContent=(user.name||user.id)+' · '+user.role;$('account-update-panel').hidden=true;$('account-password-form').hidden=true;$('account-password-status').textContent='';$('account-exit').hidden=typeof bridge()?.exitApp!=='function';if(typeof $('account-menu').showModal==='function')$('account-menu').showModal();else $('account-menu').setAttribute('open','');};
$('account-menu-close').onclick=close;
$('account-menu').addEventListener('close',()=>{$('account-password-form').reset();clearTimeout(updateTimer);});
$('account-menu').addEventListener('cancel',()=>{$('account-password-form').reset();clearTimeout(updateTimer);});
$('account-refresh').onclick=()=>{close();api()?.load();};
$('account-menu-logout').onclick=()=>{close();$('logout').click();};
$('account-exit').onclick=()=>{if(api()?.getUser()&&typeof bridge()?.exitApp==='function')bridge().exitApp();};
$('account-update').onclick=()=>{if(!api()?.getUser())return;const b=bridge(),native=typeof b?.checkForUpdates==='function';let version='Web';try{version=b?.getAppVersion?.()||'Web';}catch{}
$('account-version').textContent='Zukait Time Track · '+version;$('account-update-status').textContent=native?'Check for the latest signed app update.':'The web app updates online. Reload to use the current version.';$('account-update-panel').hidden=false;$('account-password-form').hidden=true;$('account-check-update').hidden=!native;$('account-install-update').hidden=true;$('account-web-reload').hidden=native;};
$('account-check-update').onclick=()=>{if(!api()?.getUser())return;clearTimeout(updateTimer);$('account-check-update').disabled=true;$('account-install-update').hidden=true;$('account-update-status').textContent='Checking for updates…';updateTimer=setTimeout(()=>{$('account-check-update').disabled=false;$('account-update-status').textContent='Update check timed out. Check your connection and try again.';},20000);try{bridge().checkForUpdates();}catch{clearTimeout(updateTimer);$('account-check-update').disabled=false;$('account-update-status').textContent='Unable to check for updates. Please try again.';}};
window.v72UpdateCheckResult=function(code,name,error){clearTimeout(updateTimer);$('account-check-update').disabled=false;$('account-install-update').hidden=true;if(!api()?.getUser())return;let current=0;try{current=Number(bridge()?.getAppVersionCode?.());}catch{}
if(error||!Number.isSafeInteger(Number(code))||Number(code)<=0||!Number.isSafeInteger(current)||current<=0){$('account-update-status').textContent='Update check failed. Check your connection and try again.';return;}
if(Number(code)<=current){$('account-update-status').textContent='Your app is up to date.';return;}$('account-update-status').textContent='New version '+String(name||code)+' is available.';$('account-install-update').hidden=typeof bridge()?.openUpdatePage!=='function';};
$('account-install-update').onclick=()=>{if(api()?.getUser())try{bridge()?.openUpdatePage?.();}catch{$('account-update-status').textContent='Unable to open the update. Please try again.';}};
$('account-web-reload').onclick=()=>{if(api()?.getUser())location.reload();};
$('account-password').onclick=()=>{$('account-password-form').reset();$('account-password-status').textContent='';$('account-password-form').hidden=false;$('account-update-panel').hidden=true;$('account-current-password').focus();};
$('account-password-form').onsubmit=async e=>{e.preventDefault();if(passwordBusy||!api()?.getUser())return;const current=$('account-current-password').value,next=$('account-new-password').value;if(next.length<8||next!==$('account-confirm-password').value){$('account-password-status').textContent='Enter matching new passwords with at least 8 characters.';return;}
passwordBusy=true;$('account-save-password').disabled=true;try{await api().changePassword(current,next);$('account-password-status').textContent='Password changed successfully.';}catch(e){$('account-password-status').textContent=e.message||'Password change failed.';}finally{$('account-password-form').reset();passwordBusy=false;$('account-save-password').disabled=false;}};
window.addEventListener('online',network);window.addEventListener('offline',network);window.addEventListener('zukait-accountant-session',session);network();session();
})();
