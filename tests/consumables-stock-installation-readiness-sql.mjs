import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// This runs entirely in isolated embedded PostgreSQL. No production access,
// catalog writes, opening quantities, or work-card changes.
const db=new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.staff_credentials(
      user_id text primary key,role text not null,
      active boolean default true,must_change boolean default false);
    create table public.staff_sessions(
      token_hash text primary key,user_id text references public.staff_credentials,
      revoked_at timestamptz);
    create table public.workshop_state(id text primary key,data jsonb);
  `);
  const install=name=>db.exec(readFileSync(
    `supabase/staged/CONSUMABLES_STOCK_${name}.sql`,'utf8'));
  await install('INSTALLATION_READINESS');
  const readiness=async()=>(await db.query(
    'select public.zukait_stock_installation_ready() as result')).rows[0].result;

  assert.equal((await readiness()).ready,false,
    'No database tables or RPCs must never be considered ready');
  await install('COMPACT_FOUNDATION');
  assert.equal((await readiness()).ready,false,
    'Seven empty tables are not enough to enable Stock');
  await install('COMPACT_RPC');
  assert.equal((await readiness()).ready,false,
    'Atomic write RPC alone is not complete integration');
  await install('MASTER_LINK');
  await install('LEGACY_PREVIEW');
  assert.equal((await readiness()).ready,false,
    'A missing reports RPC must not be treated as ready');
  await install('REPORTS');
  let status=await readiness();
  assert.equal(status.ready,true,
    'Complete, private stock schema and required RPCs should pass readiness');
  assert.equal(status.schemaReady,true);
  assert.equal(status.rpcReady,true);

  await db.exec('grant select on public.zukait_stock_balances to anon');
  status=await readiness();
  assert.equal(status.ready,false,'Public SELECT must prevent activation');
  assert.equal(status.schemaReady,false);
  await db.exec('revoke select on public.zukait_stock_balances from anon');
  assert.equal((await readiness()).ready,true);

  await db.exec('alter table public.zukait_stock_movements disable row level security');
  assert.equal((await readiness()).ready,false,'Every stock table requires RLS');
  await db.exec('alter table public.zukait_stock_movements enable row level security');
  assert.equal((await readiness()).ready,true);

  await db.exec('grant execute on function public.zukait_stock_command(text,text,text,jsonb) to authenticated');
  status=await readiness();
  assert.equal(status.ready,false,'Client EXECUTE on atomic write RPC must block activation');
  assert.equal(status.rpcReady,false);
  await db.exec('revoke execute on function public.zukait_stock_command(text,text,text,jsonb) from authenticated');
  assert.equal((await readiness()).ready,true);

  const snapshot=(await db.query('select count(*)::int as n from public.workshop_state')).rows[0].n;
  assert.equal(snapshot,0,'Readiness test must not create workshop-state snapshots');
  console.log('PASS: complete stock schema, RLS, no public grants, RPC inventory, fail-closed installation.');
}finally{await db.close();}
