-- ZUKAIT isolated PostgreSQL 17-only forward LZ4 qualification.
-- Synthetic data only. Run in disposable GitHub Actions PostgreSQL 17.
-- Never run this against production. Roll back every fixture modification.
begin;
create temporary table zukait_lz4_forward_qa (
  id integer primary key,
  data jsonb not null
) on commit drop;
alter table zukait_lz4_forward_qa alter column data set compression pglz;

-- Large varied fixture guarantees TOAST compression is exercised.
insert into zukait_lz4_forward_qa(id,data)
select 1,jsonb_build_object('jobs',jsonb_agg(jsonb_build_object(
  'job_no','TEST-'||n::text,
  'details',repeat(md5(n::text),5),
  'description','Synthetic workshop data - test only'
)))
from generate_series(1,600) as g(n);

do $qa$
declare v_old jsonb; v_size integer;
begin
  select data,pg_column_size(data) into strict v_old,v_size
  from zukait_lz4_forward_qa where id=1;
  if pg_column_compression(v_old) is distinct from 'pglz' then
    raise exception 'initial_pglz_not_compressed';
  end if;
  if jsonb_array_length(v_old->'jobs')<>600 or v_size<1000 then
    raise exception 'initial_pglz_content_corruption';
  end if;
end $qa$;

alter table zukait_lz4_forward_qa alter column data set compression lz4;

insert into zukait_lz4_forward_qa(id,data)
select 2,jsonb_build_object('jobs',jsonb_agg(jsonb_build_object(
  'job_no','TEST-'||n::text,
  'details',repeat(md5(n::text),5),
  'description','Synthetic workshop data - test only'
)))
from generate_series(1,600) as g(n);

do $qa$
declare old_method text; new_method text; old_doc jsonb; new_doc jsonb;
begin
  select pg_column_compression(data),data into strict old_method,old_doc
  from zukait_lz4_forward_qa where id=1;
  select pg_column_compression(data),data into strict new_method,new_doc
  from zukait_lz4_forward_qa where id=2;
  if old_method is distinct from 'pglz' then
    raise exception 'alter_compression_rewrote_old_data';
  end if;
  if new_method is distinct from 'lz4' then
    raise exception 'forward_lz4_not_used';
  end if;
  if old_doc is distinct from new_doc then
    raise exception 'lz4_jsonb_roundtrip_differs_from_pglz';
  end if;
end $qa$;
rollback;
