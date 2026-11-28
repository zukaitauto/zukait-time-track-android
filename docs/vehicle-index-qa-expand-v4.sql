-- QA-only additive update, never rebase existing approvals.
begin;
do $$
declare b bigint; v bigint;
begin
 select base_version,version into b,v from public.zukait_vehicle_index_meta where id=true for update;
 if b is distinct from 3 or v is distinct from 3 or exists(select 1 from public.zukait_vehicle_index_audit) or (select count(*) from public.zukait_vehicle_index_entries where kind='ADD_MAKE')<>29 or (select count(*) from public.zukait_vehicle_index_entries where kind='ADD_MODEL')<>294 or exists(select 1 from public.zukait_vehicle_index_entries where kind in ('MAKE_ALIAS','MODEL_ALIAS')) then raise exception 'base_version_or_approval_conflict'; end if;
end $$;
insert into public.zukait_vehicle_index_entries(id,kind,name,scope,name_key,make_id,target_id) values
('make:oman:mg','ADD_MAKE','MG','@makes',lower(btrim(regexp_replace(normalize('MG',NFKC),'[[:space:]]+',' ','g'))),null,null),
('make:oman:isuzu','ADD_MAKE','Isuzu','@makes',lower(btrim(regexp_replace(normalize('Isuzu',NFKC),'[[:space:]]+',' ','g'))),null,null),
('make:oman:renault','ADD_MAKE','Renault','@makes',lower(btrim(regexp_replace(normalize('Renault',NFKC),'[[:space:]]+',' ','g'))),null,null),
('make:oman:chery','ADD_MAKE','Chery','@makes',lower(btrim(regexp_replace(normalize('Chery',NFKC),'[[:space:]]+',' ','g'))),null,null),
('make:oman:gac','ADD_MAKE','GAC','@makes',lower(btrim(regexp_replace(normalize('GAC',NFKC),'[[:space:]]+',' ','g'))),null,null);
insert into public.zukait_vehicle_index_entries(id,kind,name,scope,name_key,make_id,target_id) values
('series:oman:mg:hs','ADD_MODEL','HS','make:oman:mg',lower(btrim(regexp_replace(normalize('HS',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:mg:hs-hybrid','ADD_MODEL','HS Hybrid+','make:oman:mg',lower(btrim(regexp_replace(normalize('HS Hybrid+',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:mg:zs','ADD_MODEL','ZS','make:oman:mg',lower(btrim(regexp_replace(normalize('ZS',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:mg:rx9','ADD_MODEL','RX9','make:oman:mg',lower(btrim(regexp_replace(normalize('RX9',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:mg:gt','ADD_MODEL','GT','make:oman:mg',lower(btrim(regexp_replace(normalize('GT',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:mg:7','ADD_MODEL','7','make:oman:mg',lower(btrim(regexp_replace(normalize('7',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:mg:3','ADD_MODEL','3','make:oman:mg',lower(btrim(regexp_replace(normalize('3',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:mg:cyberster','ADD_MODEL','Cyberster','make:oman:mg',lower(btrim(regexp_replace(normalize('Cyberster',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:mg:one','ADD_MODEL','One','make:oman:mg',lower(btrim(regexp_replace(normalize('One',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:mg:5','ADD_MODEL','5','make:oman:mg',lower(btrim(regexp_replace(normalize('5',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:mg:8-phev','ADD_MODEL','8 PHEV','make:oman:mg',lower(btrim(regexp_replace(normalize('8 PHEV',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:mg:4-ev','ADD_MODEL','4 EV','make:oman:mg',lower(btrim(regexp_replace(normalize('4 EV',NFKC),'[[:space:]]+',' ','g'))),'make:oman:mg',null),
('series:oman:isuzu:d-max','ADD_MODEL','D-MAX','make:oman:isuzu',lower(btrim(regexp_replace(normalize('D-MAX',NFKC),'[[:space:]]+',' ','g'))),'make:oman:isuzu',null),
('series:oman:isuzu:mu-x','ADD_MODEL','MU-X','make:oman:isuzu',lower(btrim(regexp_replace(normalize('MU-X',NFKC),'[[:space:]]+',' ','g'))),'make:oman:isuzu',null),
('series:oman:renault:duster','ADD_MODEL','Duster','make:oman:renault',lower(btrim(regexp_replace(normalize('Duster',NFKC),'[[:space:]]+',' ','g'))),'make:oman:renault',null),
('series:oman:renault:koleos','ADD_MODEL','Koleos','make:oman:renault',lower(btrim(regexp_replace(normalize('Koleos',NFKC),'[[:space:]]+',' ','g'))),'make:oman:renault',null),
('series:oman:renault:express-van','ADD_MODEL','Express Van','make:oman:renault',lower(btrim(regexp_replace(normalize('Express Van',NFKC),'[[:space:]]+',' ','g'))),'make:oman:renault',null),
('series:oman:chery:tiggo-7','ADD_MODEL','Tiggo 7','make:oman:chery',lower(btrim(regexp_replace(normalize('Tiggo 7',NFKC),'[[:space:]]+',' ','g'))),'make:oman:chery',null),
('series:oman:chery:arrizo-5','ADD_MODEL','Arrizo 5','make:oman:chery',lower(btrim(regexp_replace(normalize('Arrizo 5',NFKC),'[[:space:]]+',' ','g'))),'make:oman:chery',null),
('series:oman:chery:himla','ADD_MODEL','Himla','make:oman:chery',lower(btrim(regexp_replace(normalize('Himla',NFKC),'[[:space:]]+',' ','g'))),'make:oman:chery',null),
('series:oman:gac:gs3-emzoom','ADD_MODEL','GS3 Emzoom','make:oman:gac',lower(btrim(regexp_replace(normalize('GS3 Emzoom',NFKC),'[[:space:]]+',' ','g'))),'make:oman:gac',null),
('series:oman:gac:gs8','ADD_MODEL','GS8','make:oman:gac',lower(btrim(regexp_replace(normalize('GS8',NFKC),'[[:space:]]+',' ','g'))),'make:oman:gac',null),
('series:oman:gac:empow','ADD_MODEL','Empow','make:oman:gac',lower(btrim(regexp_replace(normalize('Empow',NFKC),'[[:space:]]+',' ','g'))),'make:oman:gac',null),
('series:oman:gac:empow-r','ADD_MODEL','Empow R','make:oman:gac',lower(btrim(regexp_replace(normalize('Empow R',NFKC),'[[:space:]]+',' ','g'))),'make:oman:gac',null),
('series:oman:gac:m8','ADD_MODEL','M8','make:oman:gac',lower(btrim(regexp_replace(normalize('M8',NFKC),'[[:space:]]+',' ','g'))),'make:oman:gac',null),
('series:oman:gac:gn8','ADD_MODEL','GN8','make:oman:gac',lower(btrim(regexp_replace(normalize('GN8',NFKC),'[[:space:]]+',' ','g'))),'make:oman:gac',null),
('series:oman:gmc:sierra','ADD_MODEL','Sierra','wikidata-make:Q28993',lower(btrim(regexp_replace(normalize('Sierra',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q28993',null),
('series:oman:gmc:canyon','ADD_MODEL','Canyon','wikidata-make:Q28993',lower(btrim(regexp_replace(normalize('Canyon',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q28993',null),
('series:oman:gmc:hummer-ev-suv','ADD_MODEL','Hummer EV SUV','wikidata-make:Q28993',lower(btrim(regexp_replace(normalize('Hummer EV SUV',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q28993',null),
('series:oman:gmc:hummer-ev-pickup','ADD_MODEL','Hummer EV Pickup','wikidata-make:Q28993',lower(btrim(regexp_replace(normalize('Hummer EV Pickup',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q28993',null),
('series:oman:mitsubishi:l200','ADD_MODEL','L200','wikidata-make:Q36033',lower(btrim(regexp_replace(normalize('L200',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q36033',null),
('series:oman:mitsubishi:attrage','ADD_MODEL','Attrage','wikidata-make:Q36033',lower(btrim(regexp_replace(normalize('Attrage',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q36033',null),
('series:oman:mitsubishi:montero-sport','ADD_MODEL','Montero Sport','wikidata-make:Q36033',lower(btrim(regexp_replace(normalize('Montero Sport',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q36033',null),
('series:oman:mitsubishi:destinator','ADD_MODEL','Destinator','wikidata-make:Q36033',lower(btrim(regexp_replace(normalize('Destinator',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q36033',null),
('series:oman:hyundai:creta','ADD_MODEL','Creta','wikidata-make:Q55931',lower(btrim(regexp_replace(normalize('Creta',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q55931',null),
('series:oman:hyundai:palisade','ADD_MODEL','Palisade','wikidata-make:Q55931',lower(btrim(regexp_replace(normalize('Palisade',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q55931',null),
('series:oman:hyundai:elantra','ADD_MODEL','Elantra','wikidata-make:Q55931',lower(btrim(regexp_replace(normalize('Elantra',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q55931',null),
('series:oman:hyundai:accent','ADD_MODEL','Accent','wikidata-make:Q55931',lower(btrim(regexp_replace(normalize('Accent',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q55931',null),
('series:oman:mazda:6','ADD_MODEL','6','wikidata-make:Q35996',lower(btrim(regexp_replace(normalize('6',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q35996',null),
('series:oman:mazda:cx-3','ADD_MODEL','CX-3','wikidata-make:Q35996',lower(btrim(regexp_replace(normalize('CX-3',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q35996',null),
('series:oman:mazda:cx-5','ADD_MODEL','CX-5','wikidata-make:Q35996',lower(btrim(regexp_replace(normalize('CX-5',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q35996',null),
('series:oman:mazda:3','ADD_MODEL','3','wikidata-make:Q35996',lower(btrim(regexp_replace(normalize('3',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q35996',null),
('series:oman:mazda:2','ADD_MODEL','2','wikidata-make:Q35996',lower(btrim(regexp_replace(normalize('2',NFKC),'[[:space:]]+',' ','g'))),'wikidata-make:Q35996',null);
update public.zukait_vehicle_index_meta set base_version=4,version=4 where id=true;
commit;
