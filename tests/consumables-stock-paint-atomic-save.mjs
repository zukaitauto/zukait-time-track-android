import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Fully isolated database: NO production connections or user records.
const db=new PGlite();
try {
 await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.workshop_state(
    id text primary key,revision bigint not null,data jsonb not null);
  insert into public.workshop_state values('main',0,
    '{"consumables":{"actuals":[]}}');
  create or replace function public.zukait_commit_workshop_state_v2(
    p_expected_revision bigint,p_data jsonb,p_changed_by text,p_live jsonb
  ) returns jsonb language plpgsql as $mock$
  declare v_new bigint;
  begin
    update public.workshop_state set revision=revision+1,data=p_data
     where id='main' and revision=p_expected_revision
     returning revision into v_new;
    if not found then return jsonb_build_object('ok',false,'code','conflict');end if;
    return jsonb_build_object('ok',true,'revision',v_new);
  end $mock$;
 `);
 await db.exec(readFileSync('supabase/staged/CONSUMABLES_STOCK_COMPACT_FOUNDATION.sql','utf8'));
 await db.exec(readFileSync('supabase/staged/CONSUMABLES_STOCK_PAINT_ATOMIC_SAVE.sql','utf8'));
 await db.exec(`
 insert into public.zukait_stock_material_keys(material_id,unit,department)
 values ('clear','Liter','Painting'),('tape','Piece','Both');
 insert into public.zukait_stock_brand_keys(brand_id) values ('alpha');
 insert into public.zukait_stock_balances
  (material_id,brand_id,unit,physical,reserved,stock_value,initialised)
 values ('clear','alpha','Liter',10,0,50,true),
        ('tape','alpha','Piece',5,0,10,true);
 `);

 const call=(revision,data)=>db.query(
  'select public.zukait_commit_workshop_paint_stock_v1($1,$2::jsonb,$3,$4::jsonb) result',
  [revision,JSON.stringify(data),'manager',JSON.stringify([])])
  .then(x=>x.rows[0].result);
 const live=async()=>Number((await db.query(
  "select revision from public.workshop_state where id='main'"
 )).rows[0].revision);
 const stock=async(material='clear')=>{
  const r=(await db.query('select physical,reserved,stock_value,initialised from public.zukait_stock_balances where material_id=$1',[material])).rows[0];
  return {physical:Number(r.physical),reserved:Number(r.reserved),value:Number(r.stock_value),counted:r.initialised};
 };
 const movements=async()=>Number((await db.query('select count(*) n from public.zukait_stock_movements')).rows[0].n);
 const actual=(jc,mid,quantity,locked=true,voided=false)=>({
  id:'actual-'+jc,department:'Painting',jobCard:jc,locked,voided,
  actualAt:Date.now(),totalCost:quantity*20,
  lines:[{materialId:mid,brandId:'alpha',unit:mid==='tape'?'Piece':'Liter',actualQuantity:quantity}]
 });
 const data=(...entries)=>({consumables:{actuals:entries}});
 const approx=(x,y)=>assert.ok(Math.abs(x-y)<0.0000001,x+' != '+y);

 const first=data(actual('JC12500','clear',2));
 assert.equal((await call(0,first)).ok,true);
 approx((await stock()).physical,8);approx((await stock()).value,40);
 assert.equal(await movements(),1,'new Actual is one physical issue');
 let applied=(await db.query("select quantity,inventory_cost from public.zukait_stock_paint_applied where job_card='JC12500'")).rows[0];
 approx(Number(applied.quantity),2);approx(Number(applied.inventory_cost),10);

 const stale=await call(0,first);
 assert.equal(stale.ok,false,'stale save is rejected');
 assert.equal(await movements(),1,'retry may not double-deduct');
 assert.equal((await call(1,first)).ok,true,'identical new-revision save stays legal');
 assert.equal(await movements(),1,'unchanged Actuals do not issue again');

 // Price-only recalculation is financial, not a physical stock movement.
 const priced=structuredClone(first);priced.consumables.actuals[0].totalCost=999;
 assert.equal((await call(2,priced)).ok,true);
 assert.equal(await movements(),1);
 approx((await stock()).value,40);

 // Return a reduced Actual at original locked inventory cost, not new Master price.
 const reduced=data(actual('JC12500','clear',1));
 assert.equal((await call(3,reduced)).ok,true);
 approx((await stock()).physical,9);approx((await stock()).value,45);
 assert.equal((await db.query("select action from public.zukait_stock_movements order by id desc limit 1")).rows[0].action,'PAINT_ACTUAL_RETURN');

 const reopened=data(actual('JC12500','clear',1,false));
 assert.equal((await call(4,reopened)).ok,true);
 approx((await stock()).physical,10);approx((await stock()).value,50);
 const z=await db.query("select count(*) n from public.zukait_stock_paint_applied where job_card='JC12500'");
 assert.equal(Number(z.rows[0].n),0,'fully returned Actual has no applied quantity');

 const refinalised=data(actual('JC12500','clear',3));
 assert.equal((await call(5,refinalised)).ok,true);
 approx((await stock()).physical,7);approx((await stock()).value,35);
 assert.equal(await movements(),4);

 const revBefore=await live(),eventsBefore=await movements();
 await assert.rejects(()=>call(revBefore,data(actual('JC12500','clear',100))),/INSUFFICIENT_STOCK/);
 assert.equal(await live(),revBefore,'failed inventory issue rolls back workshop save');
 assert.equal(await movements(),eventsBefore,'failed inventory issue rolls back audit movements');
 approx((await stock()).physical,7);

 // Fractional Piece must not be stored nor rounded by NUMERIC(18,4).
 await assert.rejects(()=>call(revBefore,data(
   actual('JC12500','clear',3),actual('JC12501','tape',1.5)
  )),/PIECE_WHOLE_REQUIRED/);
 assert.equal(await live(),revBefore);
 approx((await stock('tape')).physical,5);

 // A multi-line save is all-or-nothing, including its first valid line.
 await assert.rejects(()=>call(revBefore,data(
   actual('JC12500','clear',4),actual('JC12501','tape',90)
  )),/INSUFFICIENT_STOCK/);
 assert.equal(await live(),revBefore);
 approx((await stock()).physical,7);
 approx((await stock('tape')).physical,5);

 // Existing pre-activation Actuals must not be silently deducted/refunded.
 const old=data(actual('JC12500','clear',3),actual('JC12000','clear',2));
 await db.query("update public.workshop_state set data=$1::jsonb,revision=revision+1 where id='main'",[JSON.stringify(old)]);
 const historicalCorrection=data(actual('JC12500','clear',3),actual('JC12000','clear',1));
 const beforeHistorical=await live();
 await assert.rejects(()=>call(beforeHistorical,historicalCorrection),/HISTORICAL_ACTUAL_BASELINE_REQUIRED/);
 assert.equal(await live(),beforeHistorical,'legacy correction rejected until reviewed baseline');
 approx((await stock()).physical,7);

 // An outstanding explicit reservation cannot be finalised a second time by
 // the automatic Actual handler. Block atomically until its cost lots are linked.
 await db.exec("insert into public.zukait_stock_reservations(material_id,brand_id,job_card,reserved_qty,created_by) values('tape','alpha','JC12509',1,'supervisor')");
 const beforeReservation=await live();
 await assert.rejects(()=>call(beforeReservation,data(
   actual('JC12500','clear',3),actual('JC12000','clear',2),actual('JC12509','tape',1)
 )),/PAINT_RESERVATION_FINALISATION_REQUIRED/);
 assert.equal(await live(),beforeReservation,'reserved paint stock must not be deducted twice');
 approx((await stock('tape')).physical,5);

 const granted=(await db.query("select has_function_privilege('authenticated','public.zukait_commit_workshop_paint_stock_v1(bigint,jsonb,text,jsonb)','EXECUTE') as ok")).rows[0].ok;
 assert.equal(granted,false,'untrusted users cannot invoke atomic stock-save RPC');
 console.log('PASS atomic Paint Actual save: fresh issue, retry, no-op/price-only, correction/return, reopen/refinalise, negative-stock rollback, Piece guard, multi-line rollback, legacy baseline, RPC privileges');
} finally {await db.close();}
