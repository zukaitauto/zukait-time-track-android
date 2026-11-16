// Synthetic PostgreSQL 17 LZ4 TOAST compression test; localhost ONLY.
// Never connects to a Supabase project or uses production credentials.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
const host=process.env.PGHOST||'127.0.0.1';
assert.ok(['127.0.0.1','localhost','::1'].includes(host),'Refuse non-local PostgreSQL host');
assert.equal(process.env.ZUKAIT_LZ4_QA_NATIVE,'1','Opt-in isolated QA only');
const cfg={host,port:Number(process.env.PGPORT||5432),database:'postgres',
  user:'postgres',password:process.env.PGPASSWORD,connectionTimeoutMillis:5000};
const client=new pg.Client(cfg);
await client.connect();
try{
  const version=await client.query('show server_version_num');
  assert.ok(Number(version.rows[0].server_version_num)>=170000 &&
    Number(version.rows[0].server_version_num)<180000,'PostgreSQL 17 required');
  const sql=fs.readFileSync('supabase/tests/workshop_forward_lz4_isolated_qa.sql','utf8');
  await client.query(sql);
  console.log('PASS PostgreSQL 17 synthetic forward LZ4: old PGLZ preserved, new LZ4, JSONB round-trip intact');
}finally{
  await client.end();
}
