import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec("create table public.staff_credentials(user_id text primary key,role text not null,active boolean default true,must_change boolean default false)");
await db.exec("create table public.staff_sessions(user_id text references public.staff_credentials(user_id),token_hash text primary key,revoked_at timestamptz)");
await db.exec("create table public.workshop_state(id text primary key,revision bigint default 1,data jsonb not null)");
await db.exec(readFileSync('supabase/staged/CONSUMABLES_STOCK_COMPACT_FOUNDATION.sql','utf8'));
await db.exec(readFileSync('supabase/staged/CONSUMABLES_STOCK_MASTER_LINK.sql','utf8'));
await db.exec(readFileSync('supabase/staged/CONSUMABLES_STOCK_COMPACT_RPC.sql','utf8'));
await db.exec("insert into public.staff_credentials(user_id,role) values('MGR','Manager'),('SUP','Supervisor')");
await db.exec("insert into public.staff_sessions(user_id,token_hash) values('MGR','valid-manager'),('SUP','bodyshop')");
const master={consumables:{
 materials:[{id:'oil5w30',name:'Engine Oil 5W-30',unit:'Liter',category:'Consumable',active:true},
            {id:'primer',name:'Primer',unit:'Liter',category:'Paint',active:true}],
 brands:[{id:'a',name:'Brand A',active:true},{id:'b',name:'Brand B',active:true}],
 prices:[{materialId:'oil5w30',brandId:'a',pricePerUnit:3,effectiveFrom:1},
         {materialId:'oil5w30',brandId:'b',pricePerUnit:4,effectiveFrom:1},
         {materialId:'primer',brandId:'a',pricePerUnit:6,effectiveFrom:1}]
}};
const link=async(token,m,b,origin)=>{
 const r=await db.query('select public.zukait_stock_link_master($1,$2,$3,$4) as result',[token,m,b,origin]);
 return r.rows[0].result;
};
const saveMaster=async doc=>db.query("insert into public.workshop_state(id,revision,data) values('main',1,$1::jsonb) on conflict(id) do update set data=excluded.data,revision=workshop_state.revision+1",[JSON.stringify(doc)]);
await assert.rejects(link('valid-manager','oil5w30','a','Mechanical'),/MASTER_NOT_SAVED/,'no stock link until workshop save is confirmed');
await saveMaster(master);
await assert.rejects(link('bodyshop','oil5w30','a','Mechanical'),/MANAGER_ONLY/);
await assert.rejects(link('valid-manager','primer','a','Mechanical'),/PAINT_ONLY_MASTER/);
await assert.rejects(link('valid-manager','oil5w30','unknown','Mechanical'),/MASTER_NOT_SAVED/);
let res=await link('valid-manager','oil5w30','a','Mechanical');
assert.equal(res.linked,true);assert.equal(res.department,'Mechanical');
assert.equal(res.openingStock,0);
res=await link('valid-manager','oil5w30','a','Mechanical');
assert.equal(res.department,'Mechanical','retry must never create a duplicate');
let rows=await db.query("select m.material_id,m.display_name,m.unit,m.department,b.brand_id,b.display_name as brand,bal.physical,bal.stock_value from public.zukait_stock_balances bal join public.zukait_stock_material_keys m using(material_id) join public.zukait_stock_brand_keys b using(brand_id) order by b.brand_id");
assert.equal(rows.rows.length,1);
assert.equal(rows.rows[0].display_name,'Engine Oil 5W-30');
assert.equal(rows.rows[0].brand,'Brand A');
assert.equal(rows.rows[0].unit,'Liter');
assert.equal(Number(rows.rows[0].physical),0);
assert.equal(Number(rows.rows[0].stock_value),0);
await link('valid-manager','oil5w30','b','Mechanical');
rows=await db.query("select brand_id,physical from public.zukait_stock_balances order by brand_id");
assert.deepEqual(rows.rows.map(x=>x.brand_id),['a','b'],'two brands share one material but not stock quantity');
const mk=await db.query("select count(*) as n from public.zukait_stock_material_keys");
assert.equal(mk.rows[0].n,1);
// Opening remains available on the new zero-balance placeholder once.
let opening=await db.query("select public.zukait_stock_command($1,$2,$3,$4::jsonb) as result",[
 'valid-manager','opening-brand-b','OPENING',JSON.stringify({materialId:'oil5w30',brandId:'b',quantity:3,unitCost:4})
]);
assert.equal(Number(opening.rows[0].result.physical),3);
await assert.rejects(db.query("select public.zukait_stock_command($1,$2,$3,$4::jsonb) as result",[
 'valid-manager','opening-brand-b-again','OPENING',JSON.stringify({materialId:'oil5w30',brandId:'b',quantity:3,unitCost:4})
]),/OPENING_ALREADY_RECORDED/);
const savedPrice=master.consumables.prices[0];
let r=await db.query("select public.zukait_stock_command($1,$2,$3,$4::jsonb) as result",[
 'valid-manager','stock-purchase','PURCHASE',JSON.stringify({materialId:'oil5w30',brandId:'a',quantity:10,price:30,priceMethod:'total'})
]);
assert.equal(Number(r.rows[0].result.physical),10);
const before=await db.query("select physical,stock_value from public.zukait_stock_balances where brand_id='a'");
assert.equal(Number(before.rows[0].stock_value),30);
await link('valid-manager','oil5w30','a','Painting');
await link('valid-manager','oil5w30','a','Mechanical');
const after=await db.query("select physical,stock_value from public.zukait_stock_balances where brand_id='a'");
assert.deepEqual(after.rows,before.rows,'link never reprices or resets existing stock');
const dep=await db.query("select department from public.zukait_stock_material_keys where material_id='oil5w30'");
assert.equal(dep.rows[0].department,'Both','existing shared material can serve both departments without duplicate ID');
assert.equal(master.consumables.prices[0],savedPrice,'original Master price remains untouched');

master.consumables.materials[0].unit='Piece';
await saveMaster(master);
await assert.rejects(link('valid-manager','oil5w30','a','Mechanical'),/STOCK_UNIT_CONFLICT/);
const unit=await db.query("select unit from public.zukait_stock_material_keys where material_id='oil5w30'");
assert.equal(unit.rows[0].unit,'Liter','existing stock quantities cannot silently change units');
master.consumables.materials[0].unit='Liter';
master.consumables.prices=master.consumables.prices.filter(p=>p.brandId!=='b');
await saveMaster(master);
await assert.rejects(link('valid-manager','oil5w30','b','Mechanical'),/MASTER_NOT_SAVED/);
await db.exec("update public.staff_sessions set revoked_at=now() where token_hash='valid-manager'");
await assert.rejects(link('valid-manager','oil5w30','a','Mechanical'),/MANAGER_ONLY/);
const audit=await db.query("select count(*) as n from public.zukait_stock_movements");
assert.equal(audit.rows[0].n,2,'catalog linking itself never makes a stock movement; only explicit opening and purchase do');
console.log('Stock Master link: canonical saved source, multi-brand, unit guard, zero opening, retries, cross-department safety, Manager auth, no repricing PASS');
await db.close();
