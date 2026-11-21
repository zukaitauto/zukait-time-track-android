import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {consumablesStockApi} from '../supabase/functions/workshop-api/extensions/consumables_stock_api.js';

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table staff_credentials(user_id text primary key, role text not null,
      active boolean default true, must_change boolean default false);
    create table staff_sessions(token_hash text primary key,
      user_id text references staff_credentials, revoked_at timestamptz);
    create table workshop_state(id text primary key, data jsonb not null);
    insert into workshop_state values ('main',
      '{"consumables":{"prices":[{"id":"price","unitCost":3}],"audit":[{"id":"audit"}],"actuals":[{"id":"actual","total":9}]}}');
    insert into staff_credentials(user_id,role) values ('m','Manager'),('s','Supervisor');
    insert into staff_sessions(token_hash,user_id) values ('manager-session','m'),('supervisor-session','s');
  `);
  for (const name of ['COMPACT_FOUNDATION','COMPACT_RPC','REPORTS']) {
    await db.exec(readFileSync(`supabase/staged/CONSUMABLES_STOCK_${name}.sql`, 'utf8'));
  }
  await db.exec(`
    insert into zukait_stock_material_keys(material_id,unit) values ('oil','Liter');
    insert into zukait_stock_brand_keys(brand_id) values ('brand');
  `);
  const legacy = async () => (await db.query("select data from workshop_state where id='main'")).rows[0].data;
  const initial = await legacy();
  const admin = {
    async rpc(name, params) {
      try {
        let result;
        if (name === 'zukait_stock_command') {
          result = await db.query('select zukait_stock_command($1,$2,$3,$4::jsonb) result',
            [params.p_session_hash, params.p_request_id, params.p_action, JSON.stringify(params.p_data)]);
        } else {
          assert.equal(name, 'zukait_stock_balance_report');
          result = await db.query('select zukait_stock_balance_report() result');
        }
        return {data:result.rows[0].result, error:null};
      } catch (error) {
        return {error};
      }
    }
  };
  const call = (role, body) => consumablesStockApi(admin, {role}, body, {
    enabled:true, writesEnabled:true, sessionHash:role.toLowerCase()+'-session'
  });
  const write = (role, command, requestId, data) => call(role, {
    operation:'WRITE', command, requestId, data:{materialId:'oil', brandId:'brand', ...data}
  });
  const purchase = {quantity:10, priceMethod:'total', price:40};
  const count = {countedQuantity:18, reason:'Physical stock count'};
  assert.equal((await write('Manager','OPENING','opening',{
    quantity:10, unitCost:2, countConfirmed:true, reason:'Physical opening count'
  })).status, 200);
  assert.equal((await write('Supervisor','PURCHASE','purchase',purchase)).status, 200);
  assert.equal((await write('Supervisor','PURCHASE','purchase',purchase)).status, 200);
  const {physical,stock_value} = (await db.query('select physical,stock_value from zukait_stock_balances')).rows[0];
  assert.equal(Number(physical), 20);
  assert.equal(Number(stock_value)/Number(physical), 3);
  assert.equal((await write('Supervisor','ADJUST','denied',count)).status, 403);
  assert.equal((await write('Manager','ADJUST','adjustment',count)).status, 200);
  const report = await call('Manager',{operation:'REPORTS'});
  assert.equal(report.status, 200);
  assert.equal(Number(report.body.report.valuation), 54);
  await db.exec("update staff_sessions set revoked_at=now() where token_hash='supervisor-session'");
  assert.equal((await write('Supervisor','PURCHASE','revoked',purchase)).status, 403);
  const movements = await db.query('select action,actor_id from zukait_stock_movements order by id');
  assert.deepEqual(movements.rows.map(row=>[row.action,row.actor_id]),
    [['OPENING','m'],['PURCHASE','s'],['ADJUST','m']]);
  assert.deepEqual(await legacy(), initial);
  console.log('Stock API + SQL: costing, valuation, receipts, access and legacy preservation passed');
} finally {
  await db.close();
}
