import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec('create role anon;create role authenticated;create role service_role;');
await db.exec("create table public.staff_credentials(user_id text primary key,role text not null,department text,active boolean default true,must_change boolean default false)");
await db.exec("create table public.staff_sessions(user_id text references public.staff_credentials(user_id),token_hash text primary key,revoked_at timestamptz)");
await db.exec("create schema zukait_mechanical;create table zukait_mechanical.checklists(job_card text primary key);create table zukait_mechanical.intake_jobs(job_card text primary key)");
for(const file of ['CONSUMABLES_STOCK_COMPACT_FOUNDATION.sql',
 'CONSUMABLES_STOCK_MECHANICAL_BATCH.sql','CONSUMABLES_STOCK_MECHANICAL_RETURN.sql']){
 await db.exec(readFileSync('supabase/staged/'+file,'utf8'));
}
await db.exec("insert into public.staff_credentials(user_id,role) values ('M','Manager'),('S','Mechanical Supervisor'),('P','Supervisor')");
await db.exec("insert into public.staff_sessions(user_id,token_hash) values('M','manager'),('S','mechanical'),('P','painting')");
await db.exec("insert into zukait_mechanical.checklists(job_card) values ('JC12500')");
await db.exec("insert into public.zukait_stock_material_keys(material_id,unit,department,display_name) values ('oil','Liter','Mechanical','Engine Oil 5W-30'),('wd','Piece','Both','WD-40')");
await db.exec("insert into public.zukait_stock_brand_keys(brand_id,display_name) values ('a','Brand A'),('b','Brand B')");
await db.exec("insert into public.zukait_stock_balances(material_id,brand_id,unit,physical,stock_value) values('oil','a','Liter',20,100),('oil','b','Liter',10,70),('wd','a','Piece',4,12)");
const issue=async(token,id,payload)=>{
 const {rows}=await db.query("select public.zukait_stock_mechanical_issue($1,$2,$3::jsonb) result",[token,id,JSON.stringify(payload)]);
 return rows[0].result;
};
const ret=async(token,id,payload)=>{
 const {rows}=await db.query("select public.zukait_stock_mechanical_return($1,$2,$3::jsonb) result",[token,id,JSON.stringify(payload)]);
 return rows[0].result;
};
const list=async(token,page=0,jc='JC12500')=>{
 const {rows}=await db.query("select public.zukait_stock_mechanical_returnable($1,$2,$3) result",[token,jc,page]);
 return rows[0].result;
};
const bal=async(mat,brand)=>{
 const {rows}=await db.query("select physical,stock_value,reserved from public.zukait_stock_balances where material_id=$1 and brand_id=$2",[mat,brand]);return rows[0];
};
const approx=(x,y)=>assert.ok(Math.abs(Number(x)-Number(y))<0.000001,x+' != '+y);
const issued=await issue('mechanical','issue-1',{jobCard:'JC12500',lines:[
 {materialId:'oil',brandId:'a',quantity:4.5},{materialId:'oil',brandId:'b',quantity:2},
 {materialId:'wd',brandId:'a',quantity:2}]});
assert.equal(issued.final,true);assert.equal(issued.lineCount,3);
const before=await list('mechanical');
assert.equal(before.items.length,3);
assert.ok(before.items.every(x=>Number(x.availableToReturn)>0));
assert.equal(before.hasMore,false);
assert.deepEqual(before.items.map(x=>x.brand).sort(),['Brand A','Brand A','Brand B']);
await assert.rejects(list('painting'),/MECHANICAL_STOCK_FORBIDDEN/);
await assert.rejects(list('mechanical',50),/INVALID_RETURN_PAGE/);
const oils=before.items.filter(x=>x.materialId==='oil');
const lineA=oils.find(x=>x.brandId==='a').lineId;
const lineB=oils.find(x=>x.brandId==='b').lineId;
const wd=before.items.find(x=>x.materialId==='wd').lineId;
assert.ok(lineA&&lineB&&wd);
await assert.rejects(ret('painting','return-denied',{lineId:lineA,quantity:1,reason:'Unused oil'}),/MECHANICAL_STOCK_FORBIDDEN/);
await assert.rejects(ret('mechanical','return-no-reason',{lineId:lineA,quantity:1,reason:'bad'}),/RETURN_REASON_REQUIRED/);
await assert.rejects(ret('mechanical','return-over',{lineId:lineA,quantity:7,reason:'Unused oil'}),/RETURN_EXCEEDS_ISSUED/);
await assert.rejects(ret('mechanical','return-half-can',{lineId:wd,quantity:0.5,reason:'Unused spray'}),/PIECE_WHOLE_REQUIRED/);
await assert.rejects(ret('mechanical','return-zero',{lineId:wd,quantity:0,reason:'Unused spray'}),/INVALID_RETURN_QUANTITY/);
let r=await ret('mechanical','return-a1',{lineId:lineA,quantity:1.5,reason:'Unused oil'});
assert.equal(r.final,true);assert.equal(r.jobCard,'JC12500');approx(r.quantity,1.5);approx(r.credit,7.5);approx(r.remaining,3);
approx((await bal('oil','a')).physical,17);approx((await bal('oil','a')).stock_value,85);
const replay=await ret('mechanical','return-a1',{lineId:lineA,quantity:1.5,reason:'Unused oil'});
assert.deepEqual(replay,r,'same actor + request ID gives the exact original receipt');
await assert.rejects(ret('mechanical','return-a1',{lineId:lineA,quantity:1,reason:'Different qty'}),/REQUEST_ID_CONFLICT/);
await assert.rejects(ret('manager','return-a1',{lineId:lineA,quantity:1.5,reason:'Unused oil'}),/REQUEST_ID_CONFLICT/);
r=await ret('mechanical','return-a2',{lineId:lineA,quantity:3,reason:'More unused oil'});
approx(r.credit,15);approx(r.remaining,0);
approx((await bal('oil','a')).physical,20);approx((await bal('oil','a')).stock_value,100);
await assert.rejects(ret('mechanical','return-a3',{lineId:lineA,quantity:.01,reason:'No stock'}),/RETURN_EXCEEDS_ISSUED/);
const pending=await list('mechanical');
assert.equal(pending.items.length,2,'fully returned line no longer appears');
assert.equal(pending.items.find(x=>x.brandId==='b').availableToReturn,2);
r=await ret('manager','return-b1',{lineId:lineB,quantity:2,reason:'Unused Brand B'});
approx(r.credit,14);approx((await bal('oil','b')).physical,10);approx((await bal('oil','b')).stock_value,70);
r=await ret('mechanical','return-wd1',{lineId:wd,quantity:1,reason:'Unused can'});
approx(r.credit,3);approx(r.remaining,1);
await assert.rejects(ret('mechanical','return-wd2',{lineId:wd,quantity:2,reason:'Extra can'}),/RETURN_EXCEEDS_ISSUED/);
const qty=await db.query("select coalesce(sum(quantity),0) as q,coalesce(sum(credit),0) as c from public.zukait_stock_mechanical_returns");
approx(qty.rows[0].q,7.5);approx(qty.rows[0].c,39.5);
const net=await db.query("select sum(locked_cost-return_credit) net from public.zukait_stock_mechanical_lines");
approx(net.rows[0].net,3);
const physical=await db.query("select physical,reserved,stock_value from public.zukait_stock_balances where material_id='wd' and brand_id='a'");
approx(physical.rows[0].physical,3);approx(physical.rows[0].reserved,0);approx(physical.rows[0].stock_value,9);
const movements=await db.query("select action,physical_delta,cost_delta from public.zukait_stock_movements order by id");
assert.equal(movements.rows.filter(x=>x.action==='MECHANICAL_RETURN').length,4);
assert.equal(movements.rows.filter(x=>x.action==='MECHANICAL_ISSUE').length,3);
const receipt=await db.query("select count(*) n from public.zukait_stock_request_receipts where action='MECHANICAL_RETURN'");
assert.equal(receipt.rows[0].n,4,'replay and invalid attempts cannot create extra receipts');
await db.exec("update public.staff_sessions set revoked_at=now() where token_hash='mechanical'");
await assert.rejects(list('mechanical'),/MECHANICAL_STOCK_FORBIDDEN/);
await assert.rejects(ret('mechanical','revoked',{lineId:wd,quantity:1,reason:'Unused can'}),/MECHANICAL_STOCK_FORBIDDEN/);
const legacy=await db.query("select count(*) n from information_schema.tables where table_schema='public' and table_name='workshop_state'");
assert.equal(legacy.rows[0].n,0,'no full workshop snapshots required');
console.log('Mechanical Return: original-brand line, partial/full credit at locked cost, idempotency, over-return guard, Piece units, roles, immutable audit and no snapshots PASS');
await db.close();
