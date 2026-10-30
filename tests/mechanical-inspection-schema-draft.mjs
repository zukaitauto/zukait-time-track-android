import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('experiments/v377-mechanical-inspection-details.sql','utf8');
assert.match(sql,/^-- V377 REVIEW-ONLY draft:/);
assert.equal((sql.match(/^commit;$/gm)||[]).length,1,'draft must have one commit');
assert.equal((sql.match(/^begin;$/gm)||[]).length,1,'draft must have one begin');
assert.match(sql,/fingerprint text not null check \(fingerprint ~ '\^\[0-9a-f\]\{64\}\$'\),/);
for(const name of ['inspection_details','inspection_receipts','inspection_audit']){
 assert.match(sql,new RegExp('create table zukait_mechanical\\.'+name+' \\('));
 assert.match(sql,new RegExp('alter table zukait_mechanical\\.'+name+' enable row level security;'));
}
assert.match(sql,/unique \(checklist_id,result_revision\)/);
assert.match(sql,/create trigger immutable_inspection_receipts/);
assert.match(sql,/create trigger immutable_inspection_audit/);
assert.doesNotMatch(sql,/-- by the server contract inside the future atomic write boundary\.\s*commit;\s*\),/);
console.log('PASS V377 draft inspection schema static guards (not a PostgreSQL execution test)');
