import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const invoice='00000000-0000-4000-8000-000000000001';
try{
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table public.staff_credentials(user_id text primary key,role text,active boolean,must_change boolean);
 create table public.staff_sessions(user_id text,token_hash text,revoked_at timestamptz);
 insert into public.staff_credentials values ('m','Manager',true,false),('s','Supervisor',true,false);
 insert into public.staff_sessions values ('m','manager',null),('s','supervisor',null);
 create table public.zukait_purchase_invoices(id uuid primary key,revision integer,status text,invoice_date date,lines jsonb);
 insert into public.zukait_purchase_invoices values ('${invoice}',1,'posted','2026-11-24','[]');
 create table public.workshop_state(id text primary key,revision bigint,data jsonb);
 insert into public.workshop_state values('main',10,'{"jobs":[1],"consumables":{"prices":[],"actuals":[],"audit":[]}}');
 create function public.zukait_commit_workshop_state_v2(p_expected_revision bigint,p_data jsonb,p_changed_by text,p_live jsonb)
 returns jsonb language plpgsql as $f$
 declare n bigint;
 begin
 update public.workshop_state set data=p_data,revision=revision+1 where id='main' and revision=p_expected_revision returning revision into n;
 if not found then return '{"ok":false,"code":"conflict"}';end if;
 if p_live='[]'::jsonb then return '{"ok":false,"code":"simulated_failure"}';end if;
 return jsonb_build_object('ok',true,'revision',n);
 end $f$;
 `);
 await db.exec(readFileSync(new URL('../supabase/staged/CONSUMABLES_INVOICE_PRICE_APPLY.sql',import.meta.url),'utf8'));
 const receipt={invoiceId:invoice,invoiceRevision:1,requestId:'r1',changes:[{priceId:'p'}]};
 const c={prices:[{id:'p'}],actuals:[],audit:[{type:'INVOICE_PRICE_APPLIED',invoiceId:invoice,invoiceRevision:1,requestId:'r1',by:'m',receipt}]};
 const fp={reason:'Verified price',review:[]};
 const apply=async({token='manager',revision=1,expected=10,cons=c,live=[{}],fingerprint=fp}={})=>(await db.query('select public.zukait_invoice_price_apply_commit($1,$2,$3,$4,$5,$6,$7,$8,$9) as r',[token,invoice,revision,'r1',JSON.stringify(fingerprint),expected,JSON.stringify(cons),JSON.stringify(receipt),JSON.stringify(live)])).rows[0].r;
 const state=async()=>(await db.query("select revision,data from public.workshop_state where id='main'")).rows[0];
 const count=async()=>Number((await db.query('select count(*) as n from public.zukait_invoice_price_applications')).rows[0].n);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.zukait_invoice_price_apply_commit(text,uuid,integer,text,jsonb,bigint,jsonb,jsonb,jsonb)','execute') as permitted")).rows[0].permitted,false);
 await assert.rejects(apply({token:'supervisor'}),/MANAGER_ONLY/);
 await assert.rejects(apply({revision:2}),/INVOICE_REVISION_CONFLICT/);
 assert.equal((await apply({expected:9})).code,'conflict');
 await assert.rejects(apply({cons:{...c,issues:[{}]}}),/UNRELATED_CONSUMABLES_CHANGE/);
 await assert.rejects(apply({live:[]}),/WORKSHOP_PRICE_COMMIT_FAILED/);
 assert.equal(Number((await state()).revision),10);assert.equal(await count(),0);
 const done=await apply();assert.equal(done.ok,true);assert.equal(done.server_revision,11);
 assert.equal(Number((await state()).revision),11);assert.deepEqual((await state()).data.jobs,[1]);assert.equal(await count(),1);
 assert.equal((await apply({expected:0})).replayed,true);assert.equal(Number((await state()).revision),11);
 await assert.rejects(apply({fingerprint:{...fp,reason:'changed'}}),/REQUEST_ID_CONFLICT/);
 await assert.rejects(db.exec("update public.zukait_purchase_invoices set revision=2,status='cancelled'"),/INVOICE_PRICE_RECONCILIATION_REQUIRED/);
 await assert.rejects(db.exec("update public.zukait_purchase_invoices set revision=2,invoice_date='2026-11-23'"),/INVOICE_PRICE_RECONCILIATION_REQUIRED/);
 assert.equal((await db.query('select status from public.zukait_purchase_invoices')).rows[0].status,'posted');
 console.log('Isolated SQL fixture: role, revision, rollback, atomic receipt, replay, correction and cancellation guard PASS');
}finally{await db.close()}
