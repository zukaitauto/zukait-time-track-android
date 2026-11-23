import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
export async function accountantReadDb(){
 if(process.env.ACCOUNTANT_READ_NATIVE!=='1'){const {accountantDb}=await import('./accountant-db.mjs');return {db:await accountantDb(),native:false}}
 const {default:pg}=await import('pg');const host=process.env.PGHOST||'127.0.0.1';assert.ok(['127.0.0.1','localhost','::1'].includes(host),'Isolated loopback only');assert.equal(process.env.PGPASSWORD,'isolated-accountant-context-test','Dedicated fixture password required');
 const cfg={host,port:Number(process.env.PGPORT||5432),user:'postgres',password:process.env.PGPASSWORD},admin=new pg.Client({...cfg,database:'postgres'});await admin.connect();const database='accountant_read_'+randomUUID().replaceAll('-','');await admin.query('create database "'+database+'"');const client=new pg.Client({...cfg,database});await client.connect();
 const version=Number((await client.query('show server_version_num')).rows[0].server_version_num);assert.ok(version>=170000&&version<180000);
 for(const r of ['anon','authenticated','service_role'])if(!(await client.query('select 1 from pg_roles where rolname=$1',[r])).rows.length)await client.query('create role '+r+' nologin'+(r==='service_role'?' bypassrls':''));
 const helper=fs.readFileSync('tests/helpers/accountant-db.mjs','utf8');await client.query(helper.slice(helper.indexOf('await db.exec(`')+15,helper.indexOf('`);')).replace(/create role (anon|authenticated|service_role)[^;]*;/g,''));
 for(const f of ['20261017195634_accountant_financial_ledger.sql','20261017202257_accountant_lpo_audit.sql','20261018092000_accountant_append_only_grants.sql','20261018093000_accountant_append_only_corrections.sql'])await client.query(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 return {native:true,db:{query:(...a)=>client.query(...a),exec:s=>client.query(s),close:async()=>{await client.end();await admin.query('drop database "'+database+'"');await admin.end()}},connect:async()=>{const c=new pg.Client({...cfg,database});await c.connect();return c}};
}
