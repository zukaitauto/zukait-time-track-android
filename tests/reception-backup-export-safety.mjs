import assert from 'node:assert/strict';
import fs from 'node:fs';
const file='scripts/backup-zukait-production-readonly.ps1';
const source=fs.readFileSync(file,'utf8');
const receipt=fs.readFileSync('docs/INSURANCE_V305_ACCEPTANCE_GATE.json','utf8');
const req=JSON.parse(fs.readFileSync('release-request.json','utf8'));
const gate=JSON.parse(receipt);
const expected=[
 /#Requires -Version 7/,
 /EncryptedOffsiteConfirmed/,
 /ZUKAIT_PROD_DB_URL/,
 /pjknotnjkufadqavcmii/,
 /omqgkqknbdcnotabffek/,
 /Postgres/i,
 /--role-only/,
 /schema\.sql/,
 /--data-only/,
 /--use-copy/,
 /workshop_state/,
 /workshop_v2_spare_part_state/,
 /Get-FileHash/,
 /EXPORT_VERIFIED_FILES_ONLY/,
 /databaseRestoreTest='NOT_RUN'/,
 /storageObjectBackup='NOT_INCLUDED'/,
 /edgeFunctionBackup='NOT_INCLUDED'/
];
for(const re of expected) assert.match(source,re,'Missing backup safety prerequisite '+re);
for(const forbidden of [/\bDROP\s+(?:DATABASE|TABLE)\b/i,/\bTRUNCATE\b/i,
 /\bDELETE\s+FROM\b/i,/\bALTER\s+TABLE\b/i,
 /\bpg_restore\s+--dbname\b/i,/\bsupabase\s+db\s+reset\b/i])
 assert.doesNotMatch(source,forbidden,'Backup helper must not include destructive database operations');
assert.equal(req.approvedForStaff,false,'Backup preparation never grants publication');
assert.equal(gate.checks.fresh_backup_restored.passed,false,
 'Static export script must not count as a verified backup and restore');
console.log('PASS: read-only Free-plan backup helper, production-project and encryption checks, three separate SQL dumps, integrity hashes, no implicit restore or publication.');
