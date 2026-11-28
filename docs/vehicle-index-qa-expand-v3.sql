-- QA-only base expansion. No approval history is discarded or rebased.
begin;
do $$
declare b bigint; v bigint;
begin
 select base_version,version into b,v from public.zukait_vehicle_index_meta where id=true for update;
 if b is distinct from 2 or v is distinct from 2 or exists(select 1 from public.zukait_vehicle_index_audit) or (select count(*) from public.zukait_vehicle_index_entries where kind='ADD_MAKE')<>25 or (select count(*) from public.zukait_vehicle_index_entries where kind='ADD_MODEL')<>259 or exists(select 1 from public.zukait_vehicle_index_entries where kind in ('MAKE_ALIAS','MODEL_ALIAS')) then raise exception 'base_version_or_approval_conflict'; end if;
end $$;
insert into public.zukait_vehicle_index_entries(id,kind,name,scope,name_key,make_id,target_id) values
('wikidata-make:Q29570','ADD_MAKE','Chevrolet','@makes',lower(btrim(regexp_replace(normalize('Chevrolet',NFKC),'[[:space:]]+',' ','g'))),null,null),
('wikidata-make:Q28993','ADD_MAKE','GMC','@makes',lower(btrim(regexp_replace(normalize('GMC',NFKC),'[[:space:]]+',' ','g'))),null,null),
('wikidata-make:Q30113','ADD_MAKE','Jeep','@makes',lower(btrim(regexp_replace(normalize('Jeep',NFKC),'[[:space:]]+',' ','g'))),null,null),
('wikidata-make:Q216796','ADD_MAKE','Lincoln','@makes',lower(btrim(regexp_replace(normalize('Lincoln',NFKC),'[[:space:]]+',' ','g'))),null,null);
insert into public.zukait_vehicle_index_entries(id,kind,name,scope,name_key,make_id,target_id) values
('wikidata:Q500035','ADD_MODEL','Camry','make:toyota',lower(btrim(regexp_replace(normalize('Camry',NFKC),'[[:space:]]+',' ','g'))),'make:toyota',null),
('wikidata:Q848607','ADD_MODEL','Hilux','make:toyota',lower(btrim(regexp_replace(normalize('Hilux',NFKC),'[[:space:]]+',' ','g'))),'make:toyota',null),
('series:toyota:corolla','ADD_MODEL','Corolla','make:toyota',lower(btrim(regexp_replace(normalize('Corolla',NFKC),'[[:space:]]+',' ','g'))),'make:toyota',null),
('wikidata:Q636791','ADD_MODEL','Altima','make:nissan',lower(btrim(regexp_replace(normalize('Altima',NFKC),'[[:space:]]+',' ','g'))),'make:nissan',null),
('wikidata:Q611158','ADD_MODEL','Armada','make:nissan',lower(btrim(regexp_replace(normalize('Armada',NFKC),'[[:space:]]+',' ','g'))),'make:nissan',null),
('wikidata:Q1135638','ADD_MODEL','X-Trail','make:nissan',lower(btrim(regexp_replace(normalize('X-Trail',NFKC),'[[:space:]]+',' ','g'))),'make:nissan',null),
('wikidata:Q1465915','ADD_MODEL','Navara','make:nissan',lower(btrim(regexp_replace(normalize('Navara',NFKC),'[[:space:]]+',' ','g'))),'make:nissan',null),
('wikidata:Q926124','ADD_MODEL','Qashqai','make:nissan',lower(btrim(regexp_replace(normalize('Qashqai',NFKC),'[[:space:]]+',' ','g'))),'make:nissan',null),
('wikidata:Q374755','ADD_MODEL','Pajero','wikidata-make:Q36033',lower(btrim(regexp_replace(normalize('Pajero',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q36033',null),
('wikidata:Q911859','ADD_MODEL','Pajero Sport','wikidata-make:Q36033',lower(btrim(regexp_replace(normalize('Pajero Sport',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q36033',null),
('wikidata:Q1044544','ADD_MODEL','Outlander','wikidata-make:Q36033',lower(btrim(regexp_replace(normalize('Outlander',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q36033',null),
('wikidata:Q579798','ADD_MODEL','Triton','wikidata-make:Q36033',lower(btrim(regexp_replace(normalize('Triton',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q36033',null),
('wikidata:Q1134042','ADD_MODEL','Range Rover','wikidata-make:Q26777551',lower(btrim(regexp_replace(normalize('Range Rover',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q26777551',null),
('wikidata:Q1165231','ADD_MODEL','Range Rover Sport','wikidata-make:Q26777551',lower(btrim(regexp_replace(normalize('Range Rover Sport',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q26777551',null),
('wikidata:Q642647','ADD_MODEL','Range Rover Evoque','wikidata-make:Q26777551',lower(btrim(regexp_replace(normalize('Range Rover Evoque',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q26777551',null),
('wikidata:Q28843797','ADD_MODEL','Range Rover Velar','wikidata-make:Q26777551',lower(btrim(regexp_replace(normalize('Range Rover Velar',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q26777551',null),
('wikidata:Q908027','ADD_MODEL','Defender','wikidata-make:Q26777551',lower(btrim(regexp_replace(normalize('Defender',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q26777551',null),
('wikidata:Q1140003','ADD_MODEL','Discovery','wikidata-make:Q26777551',lower(btrim(regexp_replace(normalize('Discovery',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q26777551',null),
('wikidata:Q910928','ADD_MODEL','Tahoe','wikidata-make:Q29570',lower(btrim(regexp_replace(normalize('Tahoe',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q29570',null),
('wikidata:Q859501','ADD_MODEL','Suburban','wikidata-make:Q29570',lower(btrim(regexp_replace(normalize('Suburban',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q29570',null),
('wikidata:Q871329','ADD_MODEL','Silverado','wikidata-make:Q29570',lower(btrim(regexp_replace(normalize('Silverado',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q29570',null),
('wikidata:Q287723','ADD_MODEL','Malibu','wikidata-make:Q29570',lower(btrim(regexp_replace(normalize('Malibu',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q29570',null),
('wikidata:Q482542','ADD_MODEL','Captiva','wikidata-make:Q29570',lower(btrim(regexp_replace(normalize('Captiva',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q29570',null),
('wikidata:Q494073','ADD_MODEL','Cruze','wikidata-make:Q29570',lower(btrim(regexp_replace(normalize('Cruze',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q29570',null),
('wikidata:Q12206628','ADD_MODEL','Yukon','wikidata-make:Q28993',lower(btrim(regexp_replace(normalize('Yukon',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q28993',null),
('wikidata:Q936505','ADD_MODEL','Acadia','wikidata-make:Q28993',lower(btrim(regexp_replace(normalize('Acadia',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q28993',null),
('wikidata:Q18669755','ADD_MODEL','Terrain','wikidata-make:Q28993',lower(btrim(regexp_replace(normalize('Terrain',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q28993',null),
('wikidata:Q1353305','ADD_MODEL','Wrangler','wikidata-make:Q30113',lower(btrim(regexp_replace(normalize('Wrangler',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q30113',null),
('wikidata:Q1129521','ADD_MODEL','Grand Cherokee','wikidata-make:Q30113',lower(btrim(regexp_replace(normalize('Grand Cherokee',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q30113',null),
('wikidata:Q1686208','ADD_MODEL','Compass','wikidata-make:Q30113',lower(btrim(regexp_replace(normalize('Compass',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q30113',null),
('wikidata:Q15907271','ADD_MODEL','Renegade','wikidata-make:Q30113',lower(btrim(regexp_replace(normalize('Renegade',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q30113',null),
('wikidata:Q1425644','ADD_MODEL','Navigator','wikidata-make:Q216796',lower(btrim(regexp_replace(normalize('Navigator',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q216796',null),
('wikidata:Q1760333','ADD_MODEL','Aviator','wikidata-make:Q216796',lower(btrim(regexp_replace(normalize('Aviator',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q216796',null),
('wikidata:Q77973915','ADD_MODEL','Nautilus','wikidata-make:Q216796',lower(btrim(regexp_replace(normalize('Nautilus',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q216796',null),
('wikidata:Q65075518','ADD_MODEL','Corsair','wikidata-make:Q216796',lower(btrim(regexp_replace(normalize('Corsair',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q216796',null);
update public.zukait_vehicle_index_meta set base_version=3,version=3 where id=true;
commit;
