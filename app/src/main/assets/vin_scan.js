(function(){'use strict';
let targetId='',pendingVerify=null;
const master=()=>window.zukaitJobCardMaster||{};
const normalize=v=>master().normalizeVin?.(v)??String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const valid=v=>master().validVin?.(v)??(!normalize(v)||/^[A-HJ-NPR-Z0-9]{17}$/.test(normalize(v)));
function input(){return targetId?document.getElementById(targetId):null}
function manual(message){const el=input();if(!el)return;el.focus();if(message)alert(message)}
function vinCheckDigit(v){
 const x=normalize(v);if(x.length!==17)return null;
 const map={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9};
 const w=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];let sum=0;
 for(let i=0;i<17;i++){const ch=x[i],n=/\d/.test(ch)?Number(ch):map[ch];if(n==null)return false;sum+=n*w[i]}
 const r=sum%11,expected=r===10?'X':String(r);return x[8]===expected
}
function candidateDetail(raw){
 const text=String(raw||'').toUpperCase();
 const fixForbidden=x=>String(x||'').replace(/[OQ]/g,'0').replace(/I/g,'1');
 const pool=[],push=(x,source)=>{x=normalize(x);if(x.length===17&&!pool.some(p=>p.vin===x))pool.push({vin:x,source})};
 text.split(/\r?\n/).forEach((line,i)=>{
  const cleanedLine=line.replace(/^\s*(?:VIN(?:\s*OCR)?|CHASSIS(?:\s*(?:NO|NUMBER))?|VEHICLE\s*IDENTIFICATION\s*NUMBER)\s*[:#-]?\s*/i,'');
  const n=normalize(cleanedLine);if(n.length===17)push(n,'LINE');
  // Read complete VIN tokens; never slide across unrelated words or lines.
  for(const m of cleanedLine.matchAll(/(?:^|[^A-Z0-9])([A-Z0-9]{17})(?![A-Z0-9])/g))push(m[1],'CHUNK');
 });
 const scored=[],sourceBase=s=>s==='LINE'?120:s==='DIRECT'?115:s==='CHUNK'?110:50;
 for(const p of pool){
  const check=vinCheckDigit(p.vin);
  if(valid(p.vin))scored.push({...p,corrected:false,checkDigit:check,score:sourceBase(p.source)+(check===true?8:0)});
  const fixed=fixForbidden(p.vin),fixedCheck=vinCheckDigit(fixed);
  if(fixed!==p.vin&&valid(fixed))scored.push({vin:fixed,source:p.source,corrected:true,original:p.vin,checkDigit:fixedCheck,score:sourceBase(p.source)-25+(fixedCheck===true?8:0)});
 }
 scored.sort((a,b)=>b.score-a.score||Number(a.corrected)-Number(b.corrected));
 return scored[0]||null
}
function candidate(raw){return candidateDetail(raw)?.vin||''}
function duplicateJobs(vin){
 const x=normalize(vin),jobs=(typeof state!=='undefined'&&state&&Array.isArray(state.jobs))?state.jobs:[];
 return jobs.filter(j=>j&&!j.deleted&&normalize(j.vin||j.VIN||j.vinNumber||j.chassis||j.chassisNo||'')===x).map(j=>String(j.no||'')).filter(Boolean)
}
function open(id){
 pendingVerify=null;
 targetId=String(id||'');const el=input();if(!el)return;
 if(window.AndroidBridge&&typeof window.AndroidBridge.scanVinBarcode==='function'){
   try{window.AndroidBridge.scanVinBarcode();return}catch(_){}
 }
 manual('VIN barcode scanner is not available on this device. Use Capture VIN or enter the VIN manually.');
}
function capture(id,verification=false){
 if(!verification)pendingVerify=null;
 targetId=String(id||'');const el=input();if(!el)return;
 if(window.AndroidBridge&&typeof window.AndroidBridge.captureVinPhoto==='function'){
   try{
     if(!window.zukaitVinCaptureHintShown){
       window.zukaitVinCaptureHintShown=true;
       alert('VIN Capture Tips\n\n• Hold the phone level and steady\n• Put the full 17-character VIN near the center\n• Fill most of the frame with the VIN label\n• Tap the VIN to focus\n• Use flash if the label is dark\n• Avoid windshield or metal glare');
     }
     window.AndroidBridge.captureVinPhoto();return
   }catch(_){}
 }
 manual('VIN photo capture is not available on this device. Enter the VIN manually.');
}
function nativeResult(raw,error,source){
 if(error){pendingVerify=null;if(error!=='cancelled'){const unavailable=['scanner_unavailable','scan_failed'].includes(error);manual(unavailable?'VIN barcode scanning is unavailable. Check Google Play services and your connection, or use Capture VIN / manual entry.':'VIN photo capture was not successful. Check that a camera app is available, keep the VIN centered, and try again.')}return}
 const d=candidateDetail(raw),vin=d?.vin||'';if(!vin){pendingVerify=null;manual('A valid 17-character VIN was not detected. Keep the VIN centered, fill most of the frame, avoid glare, and rescan or use Capture VIN.');return}
 const photo=String(source||'').toUpperCase()==='PHOTO';
 // International VINs do not always use the North American check digit.
 // A mismatch is a review warning, not a reason to repeatedly reopen the camera.
 if(photo&&(d.corrected||pendingVerify?.targetId===targetId)){
   if(!pendingVerify||pendingVerify.targetId!==targetId){
     pendingVerify={vin,targetId,at:Date.now()};
     const reason=d.corrected?'OCR corrected '+d.original+' to '+vin:'VIN check digit did not match';
     alert(reason+'.\n\nFor maximum accuracy, capture the VIN a second time. It will be accepted only if the same VIN is detected again.');
     return capture(targetId,true);
   }
   if(pendingVerify.vin!==vin){pendingVerify=null;return manual('The two VIN captures do not match. Compare the vehicle label and enter the VIN manually, or start a new capture.');}
   pendingVerify=null
 }else pendingVerify=null;
 const dup=duplicateJobs(vin);
 let note='';
 if(d.corrected)note+='\n\nOCR correction: '+d.original+' → '+vin;
 if(d.checkDigit===true)note+='\nCheck digit: verified';
 else if(d.checkDigit===false)note+='\nCheck digit: not verified; compare carefully with the vehicle';
 if(dup.length)note+='\n\nExisting Job Card VIN match: '+dup.join(', ');
 const el=input(),existing=normalize(el?.value||'');if(existing&&existing!==vin)note+='\n\nCurrent field contains: '+existing+'\nThis scan will replace it.';
 const ok=window.confirm('VIN detected:\n\n'+vin+note+'\n\nVerify all 17 characters, then press OK. Cancel to rescan/edit.');
 if(!ok){const again=window.confirm('Would you like to scan again? Press Cancel to edit manually.');if(again)return photo?capture(targetId):open(targetId);return manual()}
 if(!el)return;el.value=vin;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
}
window.zukaitVinScan=Object.freeze({open,capture,nativeResult,normalize,valid,candidate,candidateDetail,vinCheckDigit,duplicateJobs});
})();
