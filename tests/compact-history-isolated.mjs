// In-memory PostgreSQL only: no connection URL or production access.
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(fs.readFileSync('tests/fixtures/reception-postgres17-baseline.sql','utf8').replace('create extension if not exists pgcrypto;',''));
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>/workshop_(compact_history_foundation|history_read_compatibility|history_array_patch_experiment|compact_array_patch_capture|history_rpc_compatibility)\.sql$/.test(f)).sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.query("insert into workshop_state(id,revision,data,updated_by) values('main',1,$1::jsonb,'QA')",[JSON.stringify({jobs:Array.from({length:100},(_,i)=>({no:'QA'+i,vehicle:'Synthetic vehicle '+i,notes:'Synthetic fixture only '.repeat(8)})),assign:[{id:'QA-A',job:'QA1',emp:'QA-E',suggested:60}],sessions:[],users:[],expenses:[]})]);
 for(const name of ['workshop_compact_history_qa','workshop_dual_history_compatibility_qa','workshop_history_read_compatibility_qa','workshop_reception_mechanical_history_qa','workshop_compact_history_growth_qa','workshop_compact_history_integrity_qa','workshop_history_array_patch_qa','workshop_compact_array_patch_capture_qa','workshop_history_rpc_reader_qa']){
  await db.exec("update zukait_history.configuration set mode='dual' where singleton=true");
  await db.exec(fs.readFileSync('supabase/tests/'+name+'.sql','utf8'));console.log('PASS '+name);
 }
}catch(e){console.error(e.message);process.exitCode=1}finally{await db.close()}
