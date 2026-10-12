(function(){'use strict';
 const base=new URL('vendor/vin-ocr/',document.currentScript.src).href;
 let busy=false,loader;
 const valid=v=>/^[A-HJ-NPR-Z0-9]{17}$/.test(String(v));
 function candidate(raw){
  const lines=String(raw||'').toUpperCase().split(/\r?\n/);
  for(const line of lines){const value=line.replace(/^\s*(VIN|CHASSIS)(\s*(NO|NUMBER))?\s*[:#-]?\s*/,'').replace(/\s/g,'');
   const match=value.match(/[A-Z0-9]{17}/);if(match)return match[0];}
  return String(raw||'').trim().toUpperCase();
 }
 function confirmText(input,raw){
  if(!input.isConnected)return;
  const value=window.prompt('Verify the VIN against the vehicle label. Correct any characters before saving. I, O and Q are not valid VIN letters.',candidate(raw));
  if(value===null)return;
  input.value=value.trim().toUpperCase();input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
  if(!valid(input.value))alert('VIN must contain 17 letters/numbers, excluding I, O and Q. Correct it manually before saving.');
 }
 async function engine(){
  if(window.Tesseract)return window.Tesseract;
  if(!loader)loader=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=base+'tesseract.min.js';s.onload=()=>resolve(window.Tesseract);s.onerror=()=>{loader=null;reject(Error('Text recognition could not load. Enter the VIN manually.'));};document.head.appendChild(s);});
  return loader;
 }
 async function recognize(file){
  const t=await engine();const worker=await t.createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,workerBlobURL:false,cacheMethod:'none'});
  try{await worker.setParameters({tessedit_pageseg_mode:'6'});return (await worker.recognize(file)).data.text;}finally{await worker.terminate();}
 }
 async function open(input){
  if(!input||busy)return;busy=true;
  if(window.AndroidBridge?.captureVinPhoto&&window.zukaitVinScan){
   const original=window.zukaitVinScan.nativeResult;
   window.zukaitVinScan.nativeResult=(raw,error)=>{window.zukaitVinScan.nativeResult=original;busy=false;
    if(error){if(error!=='cancelled')alert('Camera text recognition was not successful. Check camera permission or enter the VIN manually.');return;}
    confirmText(input,raw);};
   try{window.AndroidBridge.captureVinPhoto();return;}catch(e){window.zukaitVinScan.nativeResult=original;busy=false;alert('Camera is unavailable. Enter the VIN manually.');return;}
  }
  busy=false;
  const capture=document.createElement('input');capture.type='file';capture.accept='image/*';capture.setAttribute('capture','environment');
  capture.onchange=async()=>{if(!capture.files?.[0])return;busy=true;input.setAttribute('aria-busy','true');
   try{confirmText(input,await recognize(capture.files[0]));}catch(e){alert(e.message||'Could not recognize the VIN. Enter it manually.');}
   finally{busy=false;input.removeAttribute('aria-busy');}};
  capture.click();
 }
 window.zukaitReceptionVin={open,valid,candidate,confirmText};
})();
