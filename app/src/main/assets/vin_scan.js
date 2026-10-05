(function(){'use strict';
let targetId='';
const master=()=>window.zukaitJobCardMaster||{};
const normalize=v=>master().normalizeVin?.(v)??String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const valid=v=>master().validVin?.(v)??(!normalize(v)||/^[A-HJ-NPR-Z0-9]{17}$/.test(normalize(v)));
function input(){return targetId?document.getElementById(targetId):null}
function manual(message){const el=input();if(!el)return;el.focus();if(message)alert(message)}
function candidate(raw){
 const clean=normalize(raw), direct=clean.length===17?clean:'';
 if(direct&&valid(direct))return direct;
 const chunks=String(raw||'').toUpperCase().match(/[A-Z0-9]{17}/g)||[];
 return chunks.map(normalize).find(valid)||'';
}
function open(id){
 targetId=String(id||'');const el=input();if(!el)return;
 if(window.AndroidBridge&&typeof window.AndroidBridge.scanVinBarcode==='function'){
   try{window.AndroidBridge.scanVinBarcode();return}catch(_){}
 }
 manual('VIN scanner is not available on this device. Enter the VIN manually.');
}
function nativeResult(raw,error){
 if(error){if(error!=='cancelled')manual('VIN scan was not successful. Please rescan or enter the VIN manually.');return}
 const vin=candidate(raw);
 if(!vin){manual('A valid 17-character VIN was not detected. Please rescan or enter it manually.');return}
 const ok=window.confirm('VIN detected:\n\n'+vin+'\n\nPress OK to use this VIN, or Cancel to rescan/edit.');
 if(!ok){const again=window.confirm('Would you like to scan again? Press Cancel to edit manually.');if(again)return open(targetId);return manual()}
 const el=input();if(!el)return;el.value=vin;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
}
window.zukaitVinScan=Object.freeze({open,nativeResult,normalize,valid,candidate});
})();