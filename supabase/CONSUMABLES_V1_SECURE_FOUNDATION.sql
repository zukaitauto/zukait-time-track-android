-- Zukait Painting Consumables V1 secure backend foundation
-- ISOLATED from public.workshop_state / zukait_save_workshop_state.
-- Apply only after Supabase Auth users have app_metadata.role and staff_id.

create table if not exists public.consumables_transactions (
 id uuid primary key default gen_random_uuid(), client_request_id text not null unique,
 department text not null check (department in ('Painting','Denting','Mechanical')),
 transaction_type text not null check (transaction_type in ('issued','additional','actual','correction','void','reopen')),
 job_card text not null, payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), created_by uuid not null default auth.uid()
);
create table if not exists public.consumables_prices (
 id uuid primary key default gen_random_uuid(), material_id text not null, brand_id text not null, unit text not null,
 price_per_unit numeric(14,3) not null check(price_per_unit>=0), effective_from date not null,
 created_at timestamptz not null default now(), created_by uuid not null default auth.uid(), voided_at timestamptz,
 unique(material_id,brand_id,effective_from)
);
create table if not exists public.consumables_audit (
 id uuid primary key default gen_random_uuid(), action text not null, entity_type text not null, entity_id text not null,
 job_card text, reason text not null check(length(trim(reason))>0), before_data jsonb, after_data jsonb,
 changed_at timestamptz not null default now(), changed_by uuid not null default auth.uid()
);
alter table public.consumables_transactions enable row level security;
alter table public.consumables_prices enable row level security;
alter table public.consumables_audit enable row level security;
revoke all on public.consumables_transactions,public.consumables_prices,public.consumables_audit from anon;
revoke all on public.consumables_transactions,public.consumables_prices,public.consumables_audit from authenticated;
grant select,insert on public.consumables_transactions to authenticated;
grant select on public.consumables_prices to authenticated;
grant select on public.consumables_audit to authenticated;
create or replace function public.zukait_role() returns text language sql stable security invoker
as $$ select coalesce(auth.jwt()->'app_metadata'->>'role','') $$;
create policy "consumables read transactions" on public.consumables_transactions for select to authenticated
using(public.zukait_role() in ('Supervisor','Manager'));
create policy "consumables insert permitted" on public.consumables_transactions for insert to authenticated with check(
 public.zukait_role() in ('Supervisor','Manager') and
 transaction_type in ('issued','additional','actual')
 and created_by=auth.uid()
);
create policy "consumables read prices" on public.consumables_prices for select to authenticated
using(public.zukait_role() in ('Supervisor','Manager'));
create policy "consumables manager read audit" on public.consumables_audit for select to authenticated
using(public.zukait_role()='Manager');

-- No UPDATE/DELETE grants intentionally.
-- Manager corrections/void/reopen/price changes cannot use direct INSERT and must use append-only SECURITY DEFINER RPCs
-- with Manager + mandatory reason checks and audit insertion atomically.
-- Existing workshop_state is intentionally untouched.
