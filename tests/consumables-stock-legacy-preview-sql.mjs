import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec('create role anon;create role authenticated;create role service_role;');
await db.exec("create table public.staff_credentials(user_id text primary key,role text not null,active boolean default true,must_change boolean default false)");
await db.exec("create table public.staff_sessions(user_id text references public.staff_credentials(user_id),token_hash text primary key,revoked_at timestamptz)");
await db.exec("create table public.workshop_state(id text primary key,revision bigint default 1,data jsonb not null)");
await db.exec(readFileSync('supabase/staged/CONSUMABLES_STOCK_COMPACT_FOUNDATION.sql','utf8'));
await db.exec(readFileSync('supabase/staged/CONSUMABLES_STOCK_MASTER_LINK.sql','utf8'));
await db.exec(readFileSync('supabase/staged/CONSUMABLES_STOCK_LEGACY_PREVIEW.sql','utf8'));
await db.exec("insert into public.staff_credentials(user_id,role) values('MGR','Manager'),('SUP','Supervisor')");
await db.exec("insert into public.staff_sessions(user_id,token_hash) values('MGR','manager'),('SUP','bodyshop')");
let materials=[],prices=[];
for(let i=0;i<23;i++){
 const id='mat-'+String(i).padStart(3,'0');
 materials.push({id,name:'Material '+i,unit:i===22?'Piece':'Liter',category:i===22?'Paint':'Consumable',active:true});
 prices.push({materialId:id,brandId:'brand-a',pricePerUnit:2,effectiveFrom:1,voided:false});
}
prices.push({materialId:'mat-000',brandId:'brand-a',pricePerUnit:3,effectiveFrom:2});
prices.push({materialId:'mat-000',brandId:'brand-a',pricePerUnit:3.5,effectiveFrom:3,voided:true});
const master={consumables:{materials,brands:[{id:'brand-a',name:'Brand A',active:true}],prices}};
await db.query("insert into public.workshop_state(id,data) values('main',$1::jsonb)",[JSON.stringify(master)]);
const preview=async(token,page=0)=>{
 const res=await db.query('select public.zukait_stock_legacy_preview($1,$2) as result',[token,page]);
 return res.rows[0].result;
};
await assert.rejects(preview('bodyshop'),/MANAGER_ONLY/);
await assert.rejects(preview('manager',50),/INVALID_PREVIEW_PAGE/);
const p0=await preview('manager');
assert.equal(p0.readOnly,true);
assert.equal(p0.items.length,20);
assert.equal(p0.hasMore,true);
assert.equal(p0.items[0].materialId,'mat-000');
assert.equal(p0.items[0].brandId,'brand-a');
assert.equal(p0.items[0].department,'Unassigned');
assert.equal(p0.items[0].linked,false);
const p1=await preview('manager',1);
assert.equal(p1.items.length,3);
assert.equal(p1.hasMore,false);
assert.equal(p1.items[2].category,'Paint');
assert.equal(p1.items[2].unit,'Piece');
assert.equal((await db.query('select count(*) as n from public.zukait_stock_material_keys')).rows[0].n,0,
 'reading legacy preview must never seed catalog or write stock');

const link=async(m,b,origin)=>{
 const res=await db.query('select public.zukait_stock_link_master($1,$2,$3,$4) as result',['manager',m,b,origin]);
 return res.rows[0].result;
};
await assert.rejects(link('mat-022','brand-a','Both'),/PAINT_ONLY_MASTER/);
await link('mat-000','brand-a','Mechanical');
let result=await preview('manager');
assert.equal(result.items[0].department,'Mechanical');
assert.equal(result.items[0].linked,true);
assert.equal(result.items[1].linked,false);
await link('mat-000','brand-a','Both');
result=await preview('manager');
assert.equal(result.items[0].department,'Both');
await link('mat-022','brand-a','Painting');
result=await preview('manager',1);
assert.equal(result.items[2].department,'Painting');
const physical=await db.query('select physical,stock_value,reserved from public.zukait_stock_balances');
assert.equal(physical.rows.length,2);
assert.ok(physical.rows.every(row=>Number(row.physical)===0&&Number(row.stock_value)===0&&Number(row.reserved)===0),
 'classifying old materials must NEVER invent opening stock or purchase prices');
const movements=await db.query('select count(*) as n from public.zukait_stock_movements');
assert.equal(movements.rows[0].n,0);
await db.exec("update public.staff_sessions set revoked_at=now() where token_hash='manager'");
await assert.rejects(preview('manager'),/MANAGER_ONLY/);
console.log('Stock legacy preview: 20-item pages, Manager only, Paint protection, explicit Both, no fabricated balances or history PASS');
await db.close();
