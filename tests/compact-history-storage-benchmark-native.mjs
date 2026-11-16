// ZUKAIT compact-history storage benchmark. SYNTHETIC DATA, ISOLATED PG17 ONLY.
// Creates/drops one random fixture database on loopback in GitHub Actions.
// Never accepts a remote host, project ref, production credentials or real data.
// Compare identical revisions in LEGACY, DUAL, COMPACT; no retention/deletion advice.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {performance} from 'node:perf_hooks';

assert.equal(process.env.ZUKAIT_COMPACT_BENCHMARK_NATIVE,'1','Synthetic benchmark requires explicit CI opt-in');
const host=process.env.PGHOST||'127.0.0.1';
assert.ok(['127.0.0.1','localhost','::1'].includes(host),'Refusing non-loopback PostgreSQL host');
assert.ok(!process.env.DATABASE_URL && !process.env.SUPABASE_URL,'Remote connection strings are forbidden');
const config={host,port:Number(process.env.PGPORT||5432),user:'postgres',
  password:process.env.PGPASSWORD,connectionTimeoutMillis:5000};
const database='zukait_history_bench_'+randomUUID().replaceAll('-','');
const admin=new pg.Client({...config,database:'postgres'});
let client,created=false;
const q=async(sql,params)=>client.query(sql,params);
const digest=s=>createHash('sha256').update(String(s)).digest('hex');
const repeatable=n=>Array.from({length:7},(_,i)=>digest('synthetic-'+n+'-'+i)).join('').slice(0,380);

// Realistic STRUCTURE ONLY; these are not actual employees, job cards, plates or
// audit records. The fixture deliberately includes work sessions and job arrays.
const baseline={
  jobs:Array.from({length:300},(_,i)=>({
    no:'QA-'+i,make:'Synthetic',model:'Workshop',registration:'TEST-'+i,
    notes:repeatable(i),status:'WIP',progress:0
  })),
  assign:Array.from({length:80},(_,i)=>({
    id:'QA-A'+i,job:'QA-'+(i%300),emp:'QA-E'+(i%16),suggested:60
  })),
  sessions:Array.from({length:60},(_,i)=>({
    id:'QA-S'+i,assignment:'QA-A'+(i%80),started:100000+i*1800,
    stopped:100900+i*1800,type:i%7===0?'ID001':'JOB'
  })),
  users:Array.from({length:16},(_,i)=>({id:'QA-E'+i,active:true})),
  expenses:[]
};
const states=[structuredClone(baseline)];
for(let i=1;i<=24;i++){
 const next=structuredClone(states[i-1]);
 next.jobs[(i*13)%next.jobs.length].progress=i;
 next.sessions[(i*7)%next.sessions.length].stopped+=i*10;
 states.push(next);
}
const results=[];
try {
  await admin.connect();
  const ver=await admin.query('show server_version_num');
  assert.ok(Number(ver.rows[0].server_version_num)>=170000 &&
    Number(ver.rows[0].server_version_num)<180000,'PostgreSQL 17 required');
  await admin.query('create database "'+database+'"');
  created=true;
  client=new pg.Client({...config,database});
  await client.connect();
  for(const role of ['anon','authenticated','service_role']){
    const found=await q('select 1 from pg_roles where rolname=$1',[role]);
    if(!found.rowCount)await q('create role '+role+' nologin'+(role==='service_role'?' bypassrls':''));
  }
  const base=fs.readFileSync('tests/fixtures/reception-postgres17-baseline.sql','utf8')
    .replace(/create role (anon|authenticated|service_role)[^;]+;/g,'');
  await q(base);
  for(const f of fs.readdirSync('supabase/migrations')
    .filter(f=>/workshop_(compact_history_foundation|history_read_compatibility|history_array_patch_experiment|compact_array_patch_capture|history_rpc_compatibility|history_seed_guard)\.sql$/.test(f)).sort()){
    await q(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  }
  // Seed a verified isolated state, then run THREE IDENTICAL sequences.
  await q("insert into public.workshop_state(id,revision,data,updated_by) values('main',1,$1::jsonb,'synthetic_qa')",[JSON.stringify(baseline)]);
  for(const mode of ['legacy','dual','compact']){
    await q("update zukait_history.configuration set mode='legacy',cutover_approved=false where singleton");
    await q('truncate table public.workshop_state_history,zukait_history.revisions');
    await q("update public.workshop_state set revision=1,data=$1::jsonb,updated_by='synthetic_qa' where id='main'",[JSON.stringify(baseline)]);
    await q('update zukait_history.configuration set mode=$1,checkpoint_interval=100,cutover_approved=$2 where singleton',[mode,mode==='compact']);
    const start=performance.now();
    for(let i=1;i<=24;i++){
      // Reproduces the existing DB-side archive-before-save pattern,
      // including the compact-mode BEFORE INSERT skip trigger.
      const previous=await q("select revision,data,updated_at,updated_by from public.workshop_state where id='main'");
      assert.equal(Number(previous.rows[0].revision),i,'Sequential synthetic revision');
      await q("insert into public.workshop_state_history(revision,data,updated_at,updated_by) values($1,$2,$3,$4) on conflict(revision) do nothing",
        [previous.rows[0].revision,previous.rows[0].data,previous.rows[0].updated_at,previous.rows[0].updated_by]);
      await q("update public.workshop_state set revision=$1,data=$2::jsonb,updated_by='synthetic_qa',updated_at=clock_timestamp() where id='main'",
        [i+1,JSON.stringify(states[i])]);
    }
    const elapsedMs=Math.round(performance.now()-start);
    const legacy=(await q("select count(*)::int as rows,coalesce(sum(pg_column_size(data)),0)::bigint as logical_bytes from public.workshop_state_history")).rows[0];
    const compact=(await q("select count(*)::int as rows,coalesce(sum(pg_column_size(payload)+pg_column_size(removed_keys)+pg_column_size(array_patches)),0)::bigint as logical_bytes from zukait_history.revisions")).rows[0];
    const sizes=(await q("select pg_total_relation_size('public.workshop_state_history')::bigint as legacy_allocated,pg_total_relation_size('zukait_history.revisions')::bigint as compact_allocated")).rows[0];
    const state=(await q("select data from public.workshop_state where id='main'")).rows[0].data;
    assert.deepEqual(state,states[24],'Final workshop state mismatch');
    if(mode!=='legacy'){
      for(const rev of [1,2,8,16,24,25]){
        const restored=(await q('select zukait_history.reconstruct_state($1) as data',[rev])).rows[0].data;
        assert.deepEqual(restored,states[rev-1],'Reconstructed revision mismatch: '+mode+'/'+rev);
        const compatible=(await q('select data from zukait_history.read_revision($1)',[rev])).rows[0].data;
        assert.deepEqual(compatible,states[rev-1],'Compatibility reader mismatch: '+mode+'/'+rev);
      }
    }
    if(mode==='legacy'){assert.equal(legacy.rows,24);assert.equal(compact.rows,0);}
    if(mode==='dual'){assert.equal(legacy.rows,24);assert.equal(compact.rows,25);}
    if(mode==='compact'){assert.equal(legacy.rows,0);assert.equal(compact.rows,25);}
    const row={
      mode,revisions:24,legacy_rows:legacy.rows,compact_rows:compact.rows,
      legacy_column_bytes:Number(legacy.logical_bytes),compact_column_bytes:Number(compact.logical_bytes),
      legacy_allocated_bytes:Number(sizes.legacy_allocated),
      compact_allocated_bytes:Number(sizes.compact_allocated),
      elapsed_ms:elapsedMs
    };
    results.push(row);
    console.log('SYNTHETIC_STORAGE '+JSON.stringify(row));
  }
  const old=results[0],comp=results[2];
  assert.ok(comp.compact_column_bytes<old.legacy_column_bytes,
    'Compact history must use fewer logical bytes for this synthetic small-change case');
  const pct=Math.round(100*(1-comp.compact_column_bytes/old.legacy_column_bytes));
  console.log('PASS synthetic 24-save comparison; compact versus legacy logical column bytes reduction='+pct+'%. NOT a live-data estimate.');
  console.log('NOTICE: elapsed_ms and allocated relation bytes reflect GitHub test hardware and synthetic fixture only.');
}finally{
  if(client)await client.end();
  if(created)await admin.query('drop database "'+database+'"');
  await admin.end();
}
