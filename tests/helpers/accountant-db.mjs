import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
export async function accountantDb(){
const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;grant usage,create on schema public to service_role;
create table staff_credentials(user_id text primary key,display_name text,role text,department text,password_hash text,password_salt text,password_iterations integer,active boolean default true,must_change boolean default false,failed_attempts integer,locked_until timestamptz,updated_at timestamptz default now());
create table staff_sessions(token_hash text primary key,user_id text references staff_credentials(user_id),created_at timestamptz,last_seen_at timestamptz,revoked_at timestamptz);
create table workshop_state(id text primary key,data jsonb,revision bigint,updated_at timestamptz,updated_by text);
create table workshop_v2_events(event_id text,entity_id text,event_type text,revision bigint,server_time timestamptz,payload jsonb);
grant select,insert,update on staff_credentials,staff_sessions,workshop_state,workshop_v2_events to service_role;
insert into staff_credentials(user_id,display_name,role) values('M','Manager','Manager'),('A','Accountant','Accountant'),('E','Employee','Employee');
insert into workshop_state values('main','{"jobs":[{"no":"J1","jobType":"CASH","finalInvoiceAmount":100,"invoiceDate":"2026-10-01"}]}',1,now(),'M');`);
await db.exec(fs.readFileSync('supabase/migrations/20261017195634_accountant_financial_ledger.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261017202257_accountant_lpo_audit.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261018092000_accountant_append_only_grants.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261018093000_accountant_append_only_corrections.sql','utf8'));return db;
}
