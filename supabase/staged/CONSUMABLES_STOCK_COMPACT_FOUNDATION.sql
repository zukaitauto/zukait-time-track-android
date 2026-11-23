-- ZUKAIT Consumables Stock: compact, isolated schema (STAGED; DO NOT APPLY TO PRODUCTION).
-- Generated source draft; run through Supabase migration CLI and isolated PG17 QA before deployment.
-- Material names and brands remain authoritative in the EXISTING Consumables Master.
-- Catalog keys below are small authorization references, not duplicate material names.
-- No full JSON workshop_state snapshots and no triggers on workshop_state.

create table if not exists public.zukait_stock_material_keys (
  material_id text primary key,
  display_name text not null default '' check (length(display_name)<=180),
  department text not null default 'Unassigned' check (department in ('Unassigned','Mechanical','Painting','Both')),
  unit text not null check (unit in ('Liter','kg','Piece')),
  active boolean not null default true
);
create table if not exists public.zukait_stock_brand_keys (
  brand_id text primary key,
  display_name text not null default '' check (length(display_name)<=180),
  active boolean not null default true
);
create table if not exists public.zukait_stock_balances (
  material_id text not null references public.zukait_stock_material_keys(material_id),
  brand_id text not null references public.zukait_stock_brand_keys(brand_id),
  unit text not null check (unit in ('Liter','kg','Piece')),
  physical numeric(18,4) not null default 0 check (physical >= 0),
  reserved numeric(18,4) not null default 0 check (reserved >= 0 and reserved <= physical),
  stock_value numeric(20,8) not null default 0 check (stock_value >= 0),
  minimum numeric(18,4) not null default 0 check (minimum >= 0),
  initialised boolean not null default false, -- false = uncounted/unreceived placeholder, NOT verified zero
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (material_id,brand_id)
);
create table if not exists public.zukait_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  material_id text not null,
  brand_id text not null,
  job_card text not null check (length(job_card) between 1 and 36),
  status text not null default 'reserved' check (status in ('reserved','finalised','cancelled')),
  reserved_qty numeric(18,4) not null default 0 check (reserved_qty >= 0),
  actual_qty numeric(18,4) not null default 0 check (actual_qty >= 0),
  final_cost numeric(20,8) not null default 0 check (final_cost >= 0),
  returned_qty numeric(18,4) not null default 0 check (returned_qty >= 0),
  return_credit numeric(20,8) not null default 0 check (return_credit >= 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  finalised_at timestamptz,
  foreign key (material_id,brand_id) references public.zukait_stock_balances(material_id,brand_id)
);
create index if not exists zukait_stock_res_job_idx
  on public.zukait_stock_reservations(job_card,status);
create table if not exists public.zukait_stock_reservation_lots (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references public.zukait_stock_reservations(id),
  quantity numeric(18,4) not null check (quantity > 0),
  unit_cost numeric(20,8) not null check (unit_cost >= 0),
  used_qty numeric(18,4) not null default 0 check (used_qty >= 0 and used_qty <= quantity),
  returned_qty numeric(18,4) not null default 0 check (returned_qty >= 0 and returned_qty <= used_qty)
);
create index if not exists zukait_stock_lots_res_idx
  on public.zukait_stock_reservation_lots(reservation_id,id);
-- Small, append-only records. Never store full before/after workshop_state.
create table if not exists public.zukait_stock_movements (
  id bigint generated always as identity primary key,
  material_id text not null,
  brand_id text not null,
  action text not null check (action in (
    'OPENING','PURCHASE','RESERVE','CHANGE','CANCEL','FINALISE','RETURN','ADJUST','MINIMUM','MECHANICAL_ISSUE','MECHANICAL_RETURN')),
  physical_delta numeric(18,4) not null default 0,
  reserved_delta numeric(18,4) not null default 0,
  cost_delta numeric(20,8) not null default 0,
  job_card text,
  reservation_id uuid,
  actor_id text not null,
  request_id text not null unique,
  note text not null default '' check (length(note) <= 240),
  recorded_at timestamptz not null default now()
);
create index if not exists zukait_stock_move_item_idx
  on public.zukait_stock_movements(material_id,brand_id,id desc);
create index if not exists zukait_stock_move_month_idx
  on public.zukait_stock_movements(recorded_at desc);
-- Response receipt only; bounded command payload (<= 2KB), never bulk state.
create table if not exists public.zukait_stock_request_receipts (
  request_id text primary key,
  actor_id text not null,
  action text not null,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
-- Keep every stock table private to the service-role Workshop API.
-- The actual identity is validated against staff_sessions again inside the write RPC.
do $$
declare rel text;
begin
  foreach rel in array array[
    'zukait_stock_material_keys','zukait_stock_brand_keys','zukait_stock_balances',
    'zukait_stock_reservations','zukait_stock_reservation_lots',
    'zukait_stock_movements','zukait_stock_request_receipts'
  ] loop
    execute format('alter table public.%I enable row level security',rel);
    execute format('revoke all on table public.%I from public, anon, authenticated',rel);
    execute format('grant select,insert,update,delete on table public.%I to service_role',rel);
  end loop;
end $$;
-- Identity sequence access is handled by owner/service_role; never grant all public sequences.
-- No policies for anon/authenticated: even an authenticated user cannot directly read or mutate stock.
-- One-time catalog-key import must come from trusted server-verified existing material/brand master.
-- No automatic deletion of financial history; archive old movements ONLY after verified offline export.
