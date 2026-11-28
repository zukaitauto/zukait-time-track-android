// Review-only Wikidata importer. Never runs in the workshop application.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {validate}=require('../app/src/main/assets/vehicle_index.js');
const MAX_ROWS=15000,MAX_BYTES=16*1024*1024;
// Verified entity IDs, deliberately narrow initial retry scope. Additional batches
// can be appended after checking source IDs and reviewing the first retrieval.
export const batches=Object.freeze([
 Object.freeze(['Q53268','Q20165','Q9584']),
 Object.freeze(['Q124966860','Q35886','Q26777551','Q35907','Q234803']),
 Object.freeze(['Q35919','Q35996','Q36033','Q181642','Q172741']),
 Object.freeze(['Q55931','Q35349','Q35935']),
 Object.freeze(['Q26678','Q796364','Q36008','Q124983953','Q23317']),
 Object.freeze(['Q40993','Q246','Q20827633','Q44294']),
 Object.freeze(['Q27423','Q55118127','Q1117001','Q28223947','Q29366'])
]);
export function batchQuery(ids){
 if(!Array.isArray(ids)||!ids.length||ids.length>12||ids.some(id=>!/^Q[1-9]\d*$/.test(id)))throw Error('invalid_batch');
 return 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n'+
 'SELECT DISTINCT ?model ?modelLabel ?make ?makeLabel WHERE {\n'+
 ' VALUES ?make { '+ids.map(id=>'wd:'+id).join(' ')+' }\n'+
 ' { ?model wdt:P1716 ?make. } UNION { ?model wdt:P176 ?make. FILTER NOT EXISTS { ?model wdt:P1716 ?brand. } }\n'+
 ' ?model wdt:P31 wd:Q3231690; rdfs:label ?modelLabel. FILTER(LANG(?modelLabel)="en")\n'+
 ' ?make rdfs:label ?makeLabel. FILTER(LANG(?makeLabel)="en")\n'+
 '} LIMIT '+(MAX_ROWS+1);
}
export const query=batches.map(batchQuery).join('\n\n# NEXT REQUEST\n\n');
// Source-checked company/brand equivalences. Never use a parent group to
// infer the brand of a model; a matching canonical brand prefix is still required.
const canonicalMakes=Object.freeze({
 Q124966860:'Lamborghini',Q35886:'Lamborghini',Q26777551:'Land Rover',Q35907:'Land Rover',Q234803:'Rolls-Royce',
 Q35919:'Lexus',Q36033:'Mitsubishi',Q181642:'Suzuki',Q55931:'Hyundai',Q35935:'Lotus',
 Q26678:'BMW',Q796364:'BMW',Q124983953:'Audi',Q23317:'Audi',Q20827633:'Ford',Q44294:'Ford',
 Q27423:'BYD',Q55118127:'Geely',Q1117001:'Great Wall',Q29366:'Changan'
});
const norm=x=>String(x??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const qid=v=>/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(v||'')?.[1]||'';
const value=(r,k)=>r?.[k]?.value;
const link=id=>'https://www.wikidata.org/wiki/'+id;
const good=s=>typeof s==='string'&&s.trim()===s&&s.length>0&&s.length<=160&&!/[\u0000-\u001f\u007f]/.test(s);
const compare=(a,b)=>a<b?-1:a>b?1:0;
export function build(seed,raw,retrievedAt){
 const base=validate(seed),rows=raw?.results?.bindings;
 if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_ROWS)throw Error('empty_or_truncated_result');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(retrievedAt))throw Error('invalid_retrieval_date');
 const next=structuredClone(base),sourceId='wikidata-bulk-'+retrievedAt;
 if(next.sources.some(s=>s.id===sourceId))throw Error('use_reviewed_seed_or_new_date');
 next.version++;
 next.coverage='Unreviewed targeted Wikidata candidate; incomplete worldwide, GCC and commercial coverage';
 next.sources.push({id:sourceId,license:'CC0-1.0',url:'https://www.wikidata.org/wiki/Wikidata:Licensing',retrievedAt});
 const makes=new Map(next.makes.map(m=>[norm(m.name),m])),modelIds=new Map(next.models.map(m=>[m.id,m]));
 const makeIds=new Set(next.makes.map(m=>m.id)),modelNames=new Set(next.models.map(m=>m.makeId+'\n'+norm(m.name)));
 const makeAliases=new Set(next.aliases.filter(a=>a.kind==='make').map(a=>norm(a.value)));
 const modelAliases=new Set(next.aliases.filter(a=>a.kind==='model').map(a=>modelIds.get(a.targetId).makeId+'\n'+norm(a.value)));
 const grouped=new Map(),skipped=[];
 function skip(model,reason){skipped.push({model,reason})}
 for(const r of rows){
  const model=qid(value(r,'model')),make=qid(value(r,'make')),label=value(r,'modelLabel'),makeName=value(r,'makeLabel');
  if(!model||!make||!good(label)||!good(makeName)){skip(model||'unknown','invalid_binding');continue}
  if(!grouped.has(model))grouped.set(model,new Map());
  const canonical=canonicalMakes[make]||makeName;
  const claimKey=JSON.stringify([canonicalMakes[make]?norm(canonical):make,label,norm(canonical)]);
  const prior=grouped.get(model).get(claimKey);
  // Deterministic choice of the source link when equivalent brand/company claims coexist.
  if(!prior||compare(make,prior.make)<0)grouped.get(model).set(claimKey,{model,make,label,makeName:canonical});
 }
 const makeClaims=new Map();
 for(const items of grouped.values())for(const r of items.values()){
  const name=norm(r.makeName);if(!makeClaims.has(name))makeClaims.set(name,new Set());makeClaims.get(name).add(canonicalMakes[r.make]?norm(r.makeName):r.make);
 }
 for(const [id,claims] of [...grouped].sort((a,b)=>compare(a[0],b[0]))){
  if(claims.size!==1){skip(id,'ambiguous_make_or_label');continue}
  const r=[...claims.values()][0],mid='wikidata:'+id,mkey=norm(r.makeName);
  if(modelIds.has(mid)){skip(id,'existing_model_id');continue}
  // Only exact prefix removal is allowed. Manufacturer/brand mismatches and
  // labels needing interpretation are held for a human review, not guessed.
  if(!norm(r.label).startsWith(mkey+' ')||!r.label.toLowerCase().startsWith(r.makeName.toLowerCase()+' ')){
   skip(id,'make_label_mismatch');continue
  }
  const modelName=r.label.slice(r.makeName.length).trim();
  if(!good(modelName)||makeClaims.get(mkey).size!==1||makeAliases.has(mkey)){skip(id,'ambiguous_make_or_name');continue}
  const existing=makes.get(mkey),makeId=existing?.id||'wikidata-make:'+r.make;
  const key=makeId+'\n'+norm(modelName);
  if(modelNames.has(key)||modelAliases.has(key)){skip(id,'name_collision');continue}
  if(!existing&&makeIds.has(makeId)){skip(id,'make_id_collision');continue}
  if(!existing){
   const m={id:makeId,name:r.makeName,sourceId,sourceRecord:link(r.make)};
   next.makes.push(m);makes.set(mkey,m);makeIds.add(makeId);
  }
  const m={id:mid,makeId,name:modelName,sourceId,sourceRecord:link(id)};
  next.models.push(m);modelIds.set(mid,m);modelNames.add(key);
 }
 next.makes.sort((a,b)=>compare(a.id,b.id));next.models.sort((a,b)=>compare(a.id,b.id));
 validate(next);
 const counts=new Map();for(const m of next.models)counts.set(m.makeId,(counts.get(m.makeId)||0)+1);
 const coverageByMake=next.makes.map(m=>({make:m.name,models:counts.get(m.id)||0})).sort((a,b)=>compare(a.make,b.make));
 const receivedMakeIds=[...new Set(rows.map(r=>qid(value(r,'make'))).filter(Boolean))].sort(compare);
 const missingTargetIds=batches.flat().filter(id=>!receivedMakeIds.includes(id));
 const skippedByReason={};for(const x of skipped)skippedByReason[x.reason]=(skippedByReason[x.reason]||0)+1;
 return {catalogue:next,report:{retrievedAt,sourceRows:rows.length,previousMakes:base.makes.length,previousModels:base.models.length,makes:next.makes.length,models:next.models.length,addedMakes:next.makes.length-base.makes.length,addedModels:next.models.length-base.models.length,coverageByMake,receivedMakeIds,missingTargetIds,skippedByReason,skipped,reviewRequired:true}};
}
async function download(){
 const responses=[],bindings=[];let totalBytes=0;
 for(const ids of batches){
  const url=new URL('https://query.wikidata.org/sparql');
  url.searchParams.set('format','json');url.searchParams.set('query',batchQuery(ids));
  const res=await fetch(url,{headers:{accept:'application/sparql-results+json','user-agent':'ZukaitVehicleIndex/1.0 (https://github.com/zukaitauto/zukait-time-track-android)'},signal:AbortSignal.timeout(55000),redirect:'error'});
  if(!res.ok||!res.body)throw Error('Wikidata HTTP '+res.status+' for '+ids.join(','));
  const chunks=[];for await(const chunk of res.body){totalBytes+=chunk.length;if(totalBytes>MAX_BYTES/2)throw Error('source_too_large');chunks.push(chunk)}
  const bytes=Buffer.concat(chunks),raw=JSON.parse(bytes),rows=raw?.results?.bindings;
  if(!Array.isArray(rows)||!rows.length||rows.length>MAX_ROWS||bindings.length+rows.length>MAX_ROWS)throw Error('empty_or_truncated_batch '+ids.join(','));
  if(rows.some(r=>!ids.includes(qid(value(r,'make')))))throw Error('unexpected_make_in_batch '+ids.join(','));
  bindings.push(...rows);
  responses.push({ids,sha256:createHash('sha256').update(bytes).digest('hex'),body:bytes.toString('base64')});
 }
 return Buffer.from(JSON.stringify({batches:responses,results:{bindings}}));
}
async function main(){
 const args=process.argv.slice(2),out=args[0];
 if(!out||args.length>2)throw Error('Usage: node scripts/import-vehicle-index.mjs OUTPUT_DIRECTORY [PINNED_RAW_JSON]');
 const seed=JSON.parse(await fs.readFile('app/src/main/assets/vehicle_index_pilot.json','utf8'));
 if(args[1]&&(await fs.stat(args[1])).size>MAX_BYTES)throw Error('source_too_large');
 const bytes=args[1]?await fs.readFile(args[1]):await download();
 const day=process.env.VEHICLE_INDEX_RETRIEVED_AT||new Date().toISOString().slice(0,10);
 if(args[1]&&!process.env.VEHICLE_INDEX_RETRIEVED_AT)throw Error('Set VEHICLE_INDEX_RETRIEVED_AT when replaying a pinned raw snapshot');
 const {catalogue,report}=build(seed,JSON.parse(bytes),day);
 report.sha256=createHash('sha256').update(bytes).digest('hex');
 report.querySha256=createHash('sha256').update(query).digest('hex');
 report.source='Wikidata SPARQL structured CC0; targeted batch response bytes and hashes retained, entity revisions not retrieved';
 await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,'raw.json'),bytes,{flag:'wx'});
 await fs.writeFile(path.join(out,'candidate.json'),JSON.stringify(catalogue,null,2)+'\n',{flag:'wx'});
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 await fs.writeFile(path.join(out,'query.sparql'),query+'\n',{flag:'wx'});
 console.log(JSON.stringify({...report,skipped:report.skipped.length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
