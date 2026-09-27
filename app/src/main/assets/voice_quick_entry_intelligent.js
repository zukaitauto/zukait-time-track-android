(function(){'use strict';
const clean=s=>String(s||'').trim().replace(/\s+/g,' ');
const norm=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g,'');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const words={zero:'0',oh:'0',o:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9'};
const brands=['Land Rover','Range Rover','Mercedes Benz','Volkswagen','Mitsubishi','Chevrolet','Hyundai','Genesis','Infiniti','Toyota','Lexus','Nissan','Honda','Jetour','Changan','Geely','Subaru','Jaguar','Porsche','Lincoln','Chrysler','Scania','Shacman','Suzuki','Volvo','Isuzu','Audi','BMW','GMC','Jeep','Dodge','Kia','BYD','MG','MAN'];
function digits(s){return clean(s).split(/\s+/).map(w=>words[w.toLowerCase()]??w).join('')}
function sections(raw){
 const label=/\b(job\s*card(?:\s*(?:number|no))?|jc|vehicle\s*make|car\s*make|make(?:\s*and\s*model)?|vehicle|car|model\s*year|year|registration(?:\s*(?:number|no))?|reg(?:istration)?\s*(?:number|no)|reg|plate(?:\s*number)?|technician|tech|employee|allocated\s*time|allotted\s*time|working\s*time|time)\b\s*(?:is\b|:|#)?\s*/gi;
 const matches=Array.from(raw.matchAll(label)),result={head:raw.slice(0,matches[0]?.index??raw.length).trim()};
 for(let i=0;i<matches.length;i++){const labelName=norm(matches[i][1]),value=clean(raw.slice(matches[i].index+matches[i][0].length,matches[i+1]?.index??raw.length));let key='';
 if(labelName==='jc'||labelName.startsWith('jobcard'))key='jc';
 else if(['modelyear','year'].includes(labelName))key='year';
 else if(labelName.startsWith('registration')||labelName.startsWith('reg')||labelName.startsWith('plate'))key='reg';
 else if(['technician','tech','employee'].includes(labelName))key='tech';
 else if(labelName.includes('time'))key='time';
 else key='vehicle';
 if(key&&value&&!result[key])result[key]=value}
 return result
}
function code(s){const raw=clean(s).replace(/^(?:number|no)\s+/i,'');const m=raw.match(/^((?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|\d+)\s*){1,20})/i);if(m)return digits(m[1]).replace(/[^0-9]/g,'').slice(0,20);return (raw.match(/^[a-z0-9-]{1,20}/i)||[])[0]?.toUpperCase()||''}
function registration(s){return digits(s).replace(/[^a-z0-9]/gi,'').toUpperCase().slice(0,24)}
function validVehicle(s){const value=clean(s).replace(/\b(19\d{2}|20\d{2})\b/g,'').replace(/^(?:make|model)\s+/i,'').trim();if(!value||/\b(job\s*card|registration|reg(?:istration)?\s*number|jc)\b/i.test(value)||!/[a-z]{2}/i.test(value))return '';return value}
function inferredVehicle(s){const value=clean(s);return brands.some(b=>new RegExp('^'+b.replace(/\s+/g,'\\s+')+'\\b','i').test(value))?validVehicle(value):''}
function technician(raw){const q=norm(raw);if(!q)return null;const people=Array.from(window.users||[]).filter(u=>u&&u.role==='Employee');let found=people.filter(u=>q===norm(u.id)||q===norm(u.name));if(found.length===1)return found[0];found=people.filter(u=>clean(u.name).split(/\s+/).some(t=>t.length>2&&q===norm(t)));return found.length===1?found[0]:null}
function time(raw){const s=clean(raw).toLowerCase();let m=s.match(/\b(\d{1,2})(?:\s*(?:h|hr|hrs|hours?))\s*(?:and\s*)?(\d{1,2})?\s*(?:m|min|mins|minutes?)?\b/);
 if(m){const n=Number(m[1])*60+Number(m[2]||0);if(n>0&&n<=1440&&Number(m[2]||0)<60)return n}
 m=s.match(/\b(\d{1,2})\s*[:.]\s*(\d{1,2})\b/);if(m&&Number(m[2])<60){const n=Number(m[1])*60+Number(m[2]);if(n>0&&n<=1440)return n}
 m=s.match(/\b(\d{1,3})\s*(?:m|min|mins|minutes?)\b/);if(m&&Number(m[1])>0&&Number(m[1])<=1440)return Number(m[1]);
 if(/^\d{1,2}$/.test(s)&&Number(s)>0&&Number(s)<=24)return Number(s)*60;
 return null
}
function parse(raw){
 const s=clean(raw),parts=sections(s),out={};
 const job=code(parts.jc||'');if(job)out.jc=job;
 const year=(parts.year||s).match(/\b(19\d{2}|20\d{2})\b/);if(year)out.year=year[1];
 const reg=registration(parts.reg||'');if(reg)out.reg=reg;
 const vehicle=validVehicle(parts.vehicle||'')||inferredVehicle(parts.head)||inferredVehicle(clean((parts.jc||'').replace(/^[a-z0-9-]+\s*/i,'')));
 if(vehicle)out.vehicle=vehicle;
 const tech=technician(parts.tech||'');if(tech)out.tech=tech;
 const minutes=time(parts.time||'');if(minutes)out.minutes=minutes;
 return out
}
let pending=null;
function preview(){
 const b=document.getElementById('v143VoiceStatus');if(!b||!pending)return;
 const x=pending.parsed,rows=[['Job Card',x.jc],['Vehicle Make',x.vehicle],['Model Year',x.year],['Registration',x.reg],['Technician',x.tech?.name||''],['Allocated Time',x.minutes?Math.floor(x.minutes/60)+':'+String(x.minutes%60).padStart(2,'0'):'']];
 b.innerHTML='<div><b>Heard:</b> '+esc(pending.raw)+'</div><div class="v143-voice-preview">'+rows.map(([name,value])=>'<span><b>'+esc(name)+':</b> '+esc(value||'Not identified')+'</span>').join('')+'</div><div class="v143-voice-review-actions"><button type="button" onclick="v143AcceptVoiceEntry()" aria-label="Accept voice details">✓ Accept</button><button type="button" onclick="v143RejectVoiceEntry()" aria-label="Decline voice details">× Decline</button></div><small>Accept fills identified fields only. Check them before creating or assigning a Job Card.</small>';
 b.classList.remove('hidden')
}
function setField(id,value){const e=document.getElementById(id);if(!e||value==null||value==='')return;if(id==='se'&&!Array.from(e.options||[]).some(o=>o.value===value))return;e.value=String(value);e.dispatchEvent(new Event('change',{bubbles:true}))}
window.v143ApplyVoiceEntry=function(text){const raw=clean(text),b=document.getElementById('v143VoiceStatus');pending=null;if(!raw){if(b){b.textContent='No speech detected. Please try again.';b.classList.remove('hidden')}return}pending={raw,parsed:parse(raw)};preview();return pending};
window.v143AcceptVoiceEntry=function(){if(!pending)return;const x=pending.parsed;setField('newNo',x.jc);setField('newVehicle',x.vehicle);setField('newYear',x.year);setField('newReg',x.reg);setField('se',x.tech?.id);if(x.minutes)setField('st',Math.floor(x.minutes/60)+':'+String(x.minutes%60).padStart(2,'0'));pending=null;const b=document.getElementById('v143VoiceStatus');if(b){b.textContent='Voice details accepted. Review fields before creating or assigning a Job Card.';b.classList.remove('hidden')}};
window.v143RejectVoiceEntry=function(){pending=null;const b=document.getElementById('v143VoiceStatus');if(b){b.textContent='Voice details declined. Quick Entry is unchanged.';b.classList.remove('hidden')}};
window.v143RenderVoiceReview=preview;
const start=window.v143StartVoiceEntry;if(typeof start==='function')window.v143StartVoiceEntry=function(){pending=null;return start.apply(this,arguments)};
window.zukaitVoiceQuickEntryParse=parse;
window.v157IntelligentVoiceQuickEntry=true;
})();