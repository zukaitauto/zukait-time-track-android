import assert from'node:assert/strict';
function make(n,tie=37){return Array.from({length:n},(_,i)=>({id:'ID'+String(i).padStart(6,'0'),ts:Math.floor(i/tie)})).sort((a,b)=>b.ts-a.ts||b.id.localeCompare(a.id))}
function page(rows,cursor=null,limit=500){const eligible=cursor?rows.filter(r=>r.ts<cursor.ts||(r.ts===cursor.ts&&r.id<cursor.id)):rows;const out=eligible.slice(0,Math.min(500,limit));const last=out.at(-1);return{out,next:out.length===Math.min(500,limit)&&last?{ts:last.ts,id:last.id}:null}}
for(const n of[2000,10000]){
 const rows=make(n);let cursor=null,seen=new Set(),pages=0;
 do{const r=page(rows,cursor,500);for(const x of r.out){assert.ok(!seen.has(x.id),'duplicate across pages');seen.add(x.id)}cursor=r.next;pages++;assert.ok(pages<=Math.ceil(n/500)+1,'pagination did not terminate')}while(cursor&&seen.size<n);
 assert.equal(seen.size,n,'composite cursor skipped tied timestamp rows');
 assert.equal(pages,Math.ceil(n/500));
}
console.log('V2 composite pagination 2k/10k tie-scale gate: ok');
