'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const staged = fs.readFileSync('releases/v401-v124-compat/workshop-api/index.ts','utf8').replace(/\r\n/g,'\n');
const V401 = fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8').replace(/\r\n/g,'\n');
const slice = (s,a,b) => {
  const i=s.indexOf(a), j=s.indexOf(b,i+a.length);
  assert(i>=0&&j>=0,'Expected staged source anchors missing: '+a);
  return s.slice(i,j);
};
const im = slice(V401,'import { mechanicalInspectionBoundary }','import { subletTransition }');
const mg = slice(V401,"      if(action==='mechanical_inspection'){","      if(action==='mechanical_section'){");
const vg = slice(V401,'    if (action === "vehicle_master_verify") {','    if (action === "vehicle_lookup") {');
const rg = slice(V401,'  if (action === "vehicle_master_candidates") return Object.keys(body)','  if (action === "vehicle_master_direct_job_role")');
let restored = staged;
for(const block of [im,mg,vg,rg]) {
  assert(block.length>40,'Unexpectedly small patch block');
  const first=restored.indexOf(block);
  assert(first>=0&&restored.indexOf(block,first+block.length)<0,'Missing or repeated patch block');
  restored=restored.slice(0,first)+restored.slice(first+block.length);
}
const hash=crypto.createHash('sha256').update(restored).digest('hex');
assert.equal(hash,'45c804facc435fd6e07c1743bb80e5451657fa0a93130b34c49525b18f7c8292','Exact live Workshop API v124 base was not preserved');
for(const s of ['vehicle_master_candidates','vehicle_master_verify','zukait_vehicle_verify_match','zukait_vehicle_lookup_candidates','ZUKAIT_MECHANICAL_INSPECTION_ENABLED','coalesceContextReads:true']) assert(staged.includes(s), 'Missing required action/legacy optimization '+s);
assert.equal((staged.match(/if\(action==='mechanical_inspection'\)/g)||[]).length,1);
assert.equal((staged.match(/if \(action === "vehicle_master_verify"\) \{/g)||[]).length,1);
assert.equal((staged.match(/if \(action === "vehicle_master_candidates"\) \{/g)||[]).length,1);
console.log('PASS: exact v124 base SHA256, 4 scoped additive route blocks, no lost v124 optimizer');
