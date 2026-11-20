import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
await db.exec('create role anon;create role authenticated;create role service_role;');
await db.exec("create table public.staff_credentials(user_id text primary key,role text not null,department text,active boolean default true,must_change boolean default false)");
await db.exec("create table public.staff_sessions(user_id text references public.staff_credentials(user_id),token_hash text primary key,revoked_at timestamptz)");
await db.exec("create schema zukait_mechanical;create table zukait_mechanical.checklists(job_card text primary key);create table zukait_mechanical.intake_jobs(job_card text primary key)");
for(const file of ['CONSUMABLES_STOCK_COMPACT_FOUNDATION.sql','CONSUMABLES_STOCK_COMPACT_RPC.sql',
 'CONSUMABLES_STOCK_MECHANICAL_BATCH.sql','CONSUMABLES_STOCK_MECHANICAL_RETURN.sql',
 'CONSUMABLES_STOCK_MECHANICAL_TOTALS.sql']){
 await db.exec(readFileSync('supabase/staged/'+file,'utf8'));
}
await db.exec("insert into public.staff_credentials(user_id,role) values('M','Manager'),('S','Mechanical Supervisor'),('P','Supervisor')");
await db.exec("insert into public.staff_sessions(user_id,token_hash) values('M','manager'),('S','mechanical'),('P','painting')");
await db.exec("insert into zukait_mechanical.checklists(job_card) values('JC12500'),('JC12501')");
await db.exec("insert into public.zukait_stock_material_keys(material_id,unit,department,display_name) values('oil','Liter','Mechanical','Engine Oil 5W-30'),('wd','Piece','Both','WD-40')");
await db.exec("insert into public.zukait_stock_brand_keys(brand_id,display_name) values('a','Brand A'),('b','Brand B')");
await db.exec("insert into public.zukait_stock_balances(material_id,brand_id,unit,physical,reserved,stock_value) values('oil','a','Liter',0,0,0),('oil','b','Liter',0,0,0),('wd','a','Piece',0,0,0)");
const rpc=async(name,params)=>{
 const args=params.map((_,i)=>String.fromCharCode(36)+(i+1)+(i===params.length-1&&name!=='zukait_stock_mechanical_job_totals'?'::jsonb':'')).join(',');
 const {rows}=await db.query("select public."+name+"("+args+") result",params);
 return rows[0].result;
};
const issue=(id,lines,jc='JC12500')=>rpc('zukait_stock_mechanical_issue',['mechanical',id,JSON.stringify({jobCard:jc,lines})]);
const ret=(id,lineId,quantity,reason='Unused original material')=>
 rpc('zukait_stock_mechanical_return',['mechanical',id,JSON.stringify({lineId,quantity,reason})]);
const totals=(token='mechanical',jc='JC12500',page=0)=>
 rpc('zukait_stock_mechanical_job_totals',[token,jc,page]);
const cmd=(id,action,data,who='manager')=>
 rpc('zukait_stock_command',[who,id,action,JSON.stringify(data)]);
const approx=(x,y)=>assert.ok(Math.abs(Number(x)-y)<0.000001,'expected '+y+', got '+x);

await assert.rejects(totals('painting'),/MECHANICAL_STOCK_FORBIDDEN/);
await assert.rejects(totals('mechanical','BAD-JC'),/MECHANICAL_JOB_NOT_FOUND/);
await assert.rejects(totals('mechanical','JC12500',50),/INVALID_TOTALS_PAGE/);
let t=await totals();
assert.equal(t.readOnly,true);assert.equal(t.jobCard,'JC12500');
assert.equal(t.lineCount,0);approx(t.grossCost,0);approx(t.returnCredit,0);approx(t.netCost,0);
assert.equal(t.items.length,0);
await assert.rejects(issue('before-opening',[{materialId:'oil',brandId:'a',quantity:1}]),/INSUFFICIENT_STOCK/);

for(const [id,quantity,unitCost,mat,brand] of [
 ['opening-a',20,5,'oil','a'],['opening-b',10,7,'oil','b'],['opening-wd',4,3,'wd','a']]){
  const r=await cmd(id,'OPENING',{materialId:mat,brandId:brand,quantity,unitCost,countConfirmed:true,reason:'Verified physical count'});
  approx(r.physical,quantity);
}
await assert.rejects(cmd('opening-again','OPENING',{materialId:'oil',brandId:'a',quantity:20,unitCost:5,countConfirmed:true,reason:'Verified physical count'}),/OPENING_ALREADY_RECORDED/);
const first=await issue('first-batch',[
 {materialId:'oil',brandId:'a',quantity:4},
 {materialId:'oil',brandId:'b',quantity:2},
 {materialId:'wd',brandId:'a',quantity:1}
]);
assert.equal(first.final,true);approx(first.totalCost,37);
t=await totals();
assert.equal(t.lineCount,3);assert.equal(t.returnCount,0);
approx(t.grossCost,37);approx(t.returnCredit,0);approx(t.netCost,37);
assert.equal(t.items.length,3);
assert.ok(t.items.some(x=>x.brand==='Brand B'));
const lineA=t.items.find(x=>x.name==='Engine Oil 5W-30'&&x.brand==='Brand A').lineId;
const lineWD=t.items.find(x=>x.name==='WD-40').lineId;
await ret('return-one',lineA,1);
await ret('return-wd',lineWD,1);
t=await totals();
assert.equal(t.returnCount,2);approx(t.grossCost,37);approx(t.returnCredit,8);approx(t.netCost,29);
assert.equal(t.items.find(x=>String(x.lineId)===String(lineA)).netQty,3);
assert.equal(t.items.find(x=>String(x.lineId)===String(lineA)).netCost,15);
assert.equal(t.items.find(x=>String(x.lineId)===String(lineWD)).netCost,0);
const unrelated=await totals('mechanical','JC12501');
assert.equal(unrelated.lineCount,0);
approx(unrelated.netCost,0);

// A later purchase changes weighted-average stock cost, but it NEVER silently
// changes an earlier Job Card line's locked cost or historical report.
await cmd('purchase-oil','PURCHASE',{materialId:'oil',brandId:'a',quantity:10,price:8,priceMethod:'unit'});
t=await totals();approx(t.netCost,29);approx(t.grossCost,37);
const next=await issue('second-issue',[{materialId:'oil',brandId:'a',quantity:2}]);
assert.equal(next.final,true);
t=await totals();
assert.equal(t.lineCount,4);
approx(t.netCost,29+Number(next.totalCost));
const newest=t.items[0];
assert.equal(newest.kind,'issued');approx(newest.grossCost,next.totalCost);
const creditBefore=Number(t.returnCredit);
await ret('second-return',newest.lineId,1);
t=await totals();assert.equal(t.returnCount,3);
const issuedPrice=Number(next.totalCost)/2;
approx(t.returnCredit,creditBefore+issuedPrice);
approx(t.netCost,29+issuedPrice);

// Multiple later partial returns are capped at the original issue cost.
// No net-cost estimate uses today's Material Master price.
const prior=Number(t.netCost);
await ret('return-last-new',newest.lineId,1);
t=await totals();approx(t.netCost,prior-issuedPrice);
assert.equal(t.items[0].netCost,0);
assert.equal(t.returnCount,4);

// 20 visible lines per page, but totals always include ALL lines for that JC.
for(let i=0;i<19;i++){
 await issue('extra-'+i,[{materialId:'oil',brandId:'b',quantity:.1}]);
}
const firstPage=await totals('mechanical','JC12500',0),secondPage=await totals('mechanical','JC12500',1);
assert.equal(firstPage.lineCount,23);assert.equal(secondPage.lineCount,23);
assert.equal(firstPage.items.length,20);assert.equal(secondPage.items.length,3);
assert.equal(firstPage.hasMore,true);assert.equal(secondPage.hasMore,false);
approx(firstPage.netCost,secondPage.netCost);
approx(firstPage.grossCost,secondPage.grossCost);
const journal=await db.query("select count(*) as n from public.zukait_stock_movements where action='MECHANICAL_RETURN'");
assert.equal(journal.rows[0].n,4);
const balance=await db.query("select physical,stock_value from public.zukait_stock_balances where material_id='oil' and brand_id='a'");
assert.ok(Number(balance.rows[0].stock_value)>=0,'stock valuation never negative');
await db.exec("update public.staff_sessions set revoked_at=now() where token_hash='mechanical'");
await assert.rejects(totals(),/MECHANICAL_STOCK_FORBIDDEN/);
const legacy=await db.query("select count(*) as n from information_schema.tables where table_schema='public' and table_name='workshop_state'");
assert.equal(legacy.rows[0].n,0,'no full workshop snapshots');
console.log('Mechanical JC totals: zero opening/one-time opening, multi-brand issue, returns, purchase repricing isolation, pagination, role guard and no snapshots PASS');
await db.close();
