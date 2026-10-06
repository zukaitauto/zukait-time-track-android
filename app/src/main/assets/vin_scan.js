(function(){'use strict';
let targetId='';
const master=()=>window.zukaitJobCardMaster||{};
const normalize=v=>master().normalizeVin?.(v)??String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const valid=v=>master().validVin?.(v)??(!normalize(v)||/^[A-HJ-NPR-Z0-9]{17}$/.test(normalize(v)));
function input(){return targetId?document.getElementById(targetId):null}
function manual(message){const el=input();if(!el)return;el.focus();if(message)alert(message)}
function candidate(raw){
 const text=String(raw||'').toUpperCase(),clean=normalize(text);
 const fixForbidden=x=>String(x||'').replace(/[OQ]/g,'0').replace(/I/g,'1');
 const pool=[];
 const push=x=>{x=normalize(x);if(x.length===17&&!pool.includes(x))pool.push(x)};
 // Prefer exact line-level OCR/barcode values before scanning a flattened payload.
 text.split(/\r?\n/).forEach(line=>{
  const n=normalize(line);if(n.length===17)push(n);
  const m=line.match(/[A-Z0-9][A-Z0-9 .:_-]{15,40}[A-Z0-9]/g)||[];
  m.forEach(push);
 });
 if(clean.length===17)push(clean);
 const chunks=text.match(/[A-Z0-9]{17}/g)||[];chunks.forEach(push);
 for(let i=0;i<=clean.length-17;i++)push(clean.slice(i,i+17));
 for(const x of pool)if(valid(x))return x;
 // OCR commonly confuses prohibited VIN letters O/Q/I with 0/1. Those letters are never legal VIN characters,
 // so this correction is safe and materially improves photo-scan accuracy.
 for(const x of pool){const fixed=fixForbidden(x);if(fixed!==x&&valid(fixed))return fixed}
 return '';
}
function open(id){
 targetId=String(id||'');const el=input();if(!el)return;
 if(window.AndroidBridge&&typeof window.AndroidBridge.scanVinBarcode==='function'){
   try{window.AndroidBridge.scanVinBarcode();return}catch(_){}
 }
 manual('VIN barcode scanner is not available on this device. Use Capture VIN or enter the VIN manually.');
}
function capture(id){
 targetId=String(id||'');const el=input();if(!el)return;
 if(window.AndroidBridge&&typeof window.AndroidBridge.captureVinPhoto==='function'){
   try{window.AndroidBridge.captureVinPhoto();return}catch(_){}
 }
 manual('VIN photo capture is not available on this device. Enter the VIN manually.');
}
function nativeResult(raw,error){
 if(error){if(error!=='cancelled')manual('VIN scan was not successful. Please rescan or enter the VIN manually.');return}
 const vin=candidate(raw);
 if(!vin){manual('A valid 17-character VIN was not detected. Keep the VIN centered, fill most of the frame, avoid glare, and rescan or use Capture VIN.');return}
 const ok=window.confirm('VIN detected:\n\n'+vin+'\n\nVerify all 17 characters, then press OK. Cancel to rescan/edit.');
 if(!ok){const again=window.confirm('Would you like to scan again? Press Cancel to edit manually.');if(again)return open(targetId);return manual()}
 const el=input();if(!el)return;el.value=vin;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
}
window.zukaitVinScan=Object.freeze({open,capture,nativeResult,normalize,valid,candidate});
})();