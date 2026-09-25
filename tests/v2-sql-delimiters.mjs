import fs from 'node:fs';import assert from 'node:assert/strict';
for(const file of ['supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','supabase/ARCHITECTURE_V2_JOBCARD_PROJECTION.sql','supabase/ARCHITECTURE_V2_OPERATIONAL_PROJECTIONS.sql']){
 const sql=fs.readFileSync(file,'utf8');
 assert.doesNotMatch(sql,/\bas \$\s*\n/i,file+' contains an invalid single-dollar function delimiter');
 assert.doesNotMatch(sql,/\n\$;\s*\n/i,file+' contains an invalid single-dollar function terminator');
 assert.equal((sql.match(/\bbegin;/gi)||[]).length>0,true,file+' must contain transaction/function begin');
}
console.log('V2 SQL delimiter integrity: ok');
