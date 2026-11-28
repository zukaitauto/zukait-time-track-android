// Review-only Wikidata importer. Never runs in the workshop application.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {validate}=require('../app/src/main/assets/vehicle_index.js');
const MAX_ROWS=15000,MAX_BYTES=16*1024*1024;
export const query=
 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n'+
 'SELECT DISTINCT ?model ?modelLabel ?make ?makeLabel WHERE {\n'+
 ' ?model wdt:P31 wd:Q3231690; rdfs:label ?modelLabel. FILTER(LANG(?modelLabel)="en")\n'+
 ' { ?model wdt:P1716 ?make. } UNION { ?model wdt:P176 ?make. FILTER NOT EXISTS { ?model wdt:P1716 ?brand. } }\n'+
 ' ?make rdfs:label ?makeLabel. FILTER(LANG(?makeLabel)="en")\n'+
 '} ORDER BY ?model ?make ?modelLabel ?makeLabel LIMIT '+(MAX_ROWS+1);
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
 next.coverage='Unreviewed global Wikidata candidate; incomplete GCC and commercial coverage';
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
  grouped.get(model).set(JSON.stringify([make,label,makeName]),{model,make,label,makeName});
 }
 const makeClaims=new Map();
 for(const items of grouped.values())for(const r of items.values()){
  const name=norm(r.makeName);if(!makeClaims.has(name))makeClaims.set(name,new Set());makeClaims.get(name).add(r.make);
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
 return {catalogue:next,report:{retrievedAt,sourceRows:rows.length,previousMakes:base.makes.length,previousModels:base.models.length,makes:next.makes.length,models:next.models.length,addedMakes:next.makes.length-base.makes.length,addedModels:next.models.length-base.models.length,skipped,reviewRequired:true}};
}
async function download(){
 const url=new URL('https://query.wikidata.org/sparql');url.searchParams.set('format','json');url.searchParams.set('query',query);
 const res=await fetch(url,{headers:{accept:'application/sparql-results+json','user-agent':'ZukaitVehicleIndex/1.0 (https://github.com/zukaitauto/zukait-time-track-android)'},signal:AbortSignal.timeout(55000),redirect:'error'});
 if(!res.ok||!res.body)throw Error('Wikidata HTTP '+res.status);
 const chunks=[];let size=0;for await(const chunk of res.body){size+=chunk.length;if(size>MAX_BYTES)throw Error('source_too_large');chunks.push(chunk)}
 return Buffer.concat(chunks);
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
 report.source='Wikidata SPARQL structured CC0; raw snapshot pinned by SHA256, entity revision IDs not retrieved';
 await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,'raw.json'),bytes,{flag:'wx'});
 await fs.writeFile(path.join(out,'candidate.json'),JSON.stringify(catalogue,null,2)+'\n',{flag:'wx'});
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 await fs.writeFile(path.join(out,'query.sparql'),query+'\n',{flag:'wx'});
 console.log(JSON.stringify({...report,skipped:report.skipped.length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
