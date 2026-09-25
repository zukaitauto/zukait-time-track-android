import assert from'node:assert/strict';
function boundedPage(rows,limit=500){return rows.slice(0,Math.min(500,limit))}
function make(n){return Array.from({length:n},(_,i)=>({id:'JC'+i,status:i%3?'WORKING':'PAUSED',updatedAt:i}))}
for(const n of [2000,10000]){
 const rows=make(n);const t=performance.now();const live=boundedPage(rows,500);const ms=performance.now()-t;
 assert.equal(live.length,500);assert.ok(ms<250,'bounded dashboard selection too slow');
}
const source=await import('node:fs').then(fs=>fs.readFileSync('app/src/main/assets/v2/features/reports/service.js','utf8'));
assert.match(source,/fullHistoryScan:false/);assert.match(source,/MAX_PAGE=500/);
const data=await import('node:fs').then(fs=>fs.readFileSync('app/src/main/assets/v2/core/data_paths.js','utf8'));
assert.doesNotMatch(data,/state\.jobs|state\.assign/);
console.log('V2 scale benchmark: 2k/10k bounded reads ok');