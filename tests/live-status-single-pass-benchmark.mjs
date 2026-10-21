import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const candidatePath=process.argv[2]||'experiments/live-status-session-partition.sql';
const before=fs.readFileSync('tests/fixtures/live-status-refresh-before.sql','utf8');
const after=fs.readFileSync(candidatePath,'utf8');
const db=new PGlite();
try{
 console.log('Isolated PostgreSQL engine:',(await db.query('select version() version')).rows[0].version);
 await db.exec(`set work_mem='2184kB'; create table workshop_live_status(employee_id text primary key,employee_name text,department text,status text,job_no text,assignment_id text,session_id text,session_start bigint,suggested_minutes numeric,vehicle text,registration text,overtime boolean,state_revision bigint,updated_at timestamptz,updated_by text); create table synthetic_probe(data jsonb);`);
 await db.exec(`insert into synthetic_probe select jsonb_build_object(
 'users',(select jsonb_agg(jsonb_build_object('id','E'||g,'name','Synthetic employee '||g,'role','Employee')) from generate_series(1,19) g),
 'jobs',jsonb_build_array(jsonb_build_object('no','J1','vehicle','Synthetic','reg','QA')),
 'assign',(select jsonb_agg(jsonb_build_object('id','A'||g,'emp','E'||g,'job','J1','assignedAt',1,'completed',false,'cancelled',false,'suggested',60)) from generate_series(1,19)g),
 'sessions',(select jsonb_agg(jsonb_build_object('id','S'||lpad(g::text,6,'0'),'emp','E'||(1+(g%19)),'job','J1','assignmentId','A'||(1+(g%19)),'start',10000+g,'end',20000+g,'paused',true,'reason',repeat('Synthetic-only history. ',16))) from generate_series(1,7000)g));`);
 const bytes=(await db.query('select octet_length(data::text) n from synthetic_probe')).rows[0].n;
 const trials=[];let expected;
 for(let pair=0;pair<3;pair++)for(const [name,sql] of [['before',before],['after',after]]){
  await db.exec(sql);
  const r=await db.query(`explain(analyze,buffers,format json) select public.zukait_refresh_live_status_from_state(data,1,'QA') from synthetic_probe`);
  const plan=r.rows[0]['QUERY PLAN'][0];
  const rows=(await db.query(`select to_jsonb(l)-'updated_at' r from workshop_live_status l order by employee_id`)).rows.map(x=>x.r);
  if(!expected)expected=rows;else assert.deepEqual(rows,expected,'Baseline and optimized status output must match exactly');
  const item={pair,name,execution_ms:plan['Execution Time'],temp_read_blocks:plan.Plan['Temp Read Blocks']||0,temp_written_blocks:plan.Plan['Temp Written Blocks']||0};trials.push(item);console.log(JSON.stringify(item));
 }
 const median=a=>a.slice().sort((x,y)=>x-y)[1];
 const b=trials.filter(x=>x.name==='before'),a=trials.filter(x=>x.name==='after');
 const report={engine:'PostgreSQL via PGlite; synthetic only; not production latency or physical Disk IO',synthetic_bytes:bytes,employees:19,sessions:7000,work_mem_kib:2184,output_identical:true,trials,before_median_ms:median(b.map(x=>x.execution_ms)),after_median_ms:median(a.map(x=>x.execution_ms)),before_temp_written_blocks:median(b.map(x=>x.temp_written_blocks)),after_temp_written_blocks:median(a.map(x=>x.temp_written_blocks))};
 report.time_reduction_pct=(1-report.after_median_ms/report.before_median_ms)*100;
 report.temp_block_reduction_pct=report.before_temp_written_blocks?(1-report.after_temp_written_blocks/report.before_temp_written_blocks)*100:null;

 // Compare exact output and legacy error handling, not only the large fixture.
 const base={users:[{id:'E1',name:'Employee',role:'Employee'},{id:'E2',name:'Second',role:'Employee'}],jobs:[{no:'J1',vehicle:'Synthetic',reg:'QA'}],assign:[{id:'A1',emp:'E1',job:'J1',assignedAt:1,completed:false,cancelled:false,suggested:60}],sessions:[]};
 const row={id:'S1',emp:'E1',job:'J1',assignmentId:'A1',start:100};
 const fixtures=[
 ['available',base],
 ['running-missing-end',{...base,sessions:[row]}],
 ['legacy-json-null-end',{...base,sessions:[{...row,end:null}]}],
 ['legacy-empty-end',{...base,sessions:[{...row,end:''}]}],
 ['legacy-string-null-end',{...base,sessions:[{...row,end:'null'}]}],
 ['paused',{...base,sessions:[{...row,end:200,paused:true}]}],
 ['finished',{...base,sessions:[{...row,end:200,finished:true}]}],
 ['cancelled-assignment',{...base,assign:[{...base.assign[0],cancelled:true}],sessions:[row]}],
 ['completed-assignment',{...base,assign:[{...base.assign[0],completed:true}],sessions:[row]}],
 ['fallback-assignment',{...base,sessions:[{...row,assignmentId:'missing'}]}],
 ['id001',{...base,assign:[{...base.assign[0],job:'ID001'}],sessions:[{...row,job:'ID001'}]}],
 ['overtime',{...base,sessions:[{...row,overtime:true}]}],
 ['tie-order',{...base,sessions:[{...row,id:'S2',paused:false},{...row,id:'S3',overtime:true}]}],
 ['unknown-employee-invalid-date',{...base,sessions:[row,{id:'unknown',emp:'not-an-employee',job:'J1',start:'bad-date'}]}],
 ['unused-closed-invalid-date',{...base,sessions:[row,{...row,id:'closed',start:'bad-date',end:150}]}],
 ['active-invalid-date',{...base,sessions:[{...row,start:'bad-date'}]}]
 ];
 for(const [name,data] of fixtures){
  const outcomes=[];
  for(const sql of [before,after]){
   await db.exec(sql);
   try{await db.query("select public.zukait_refresh_live_status_from_state($1::jsonb,2,'QA')",[JSON.stringify(data)]);outcomes.push({rows:(await db.query("select to_jsonb(l)-'updated_at' r from workshop_live_status l order by employee_id")).rows.map(x=>x.r)});}
   catch(e){outcomes.push({error:e.message});}
  }
  assert.deepEqual(outcomes[1],outcomes[0],name+' behavior changed');
 }
 report.parity_cases=fixtures.length;console.log('PASS '+fixtures.length+' legacy, active/paused/finished, ID001, assignment and invalid-date parity cases');
 fs.mkdirSync('artifacts/traffic-performance',{recursive:true});fs.writeFileSync('artifacts/traffic-performance/live-status-single-pass.json',JSON.stringify(report,null,2)+'\n');console.log('RESULT '+JSON.stringify(report));
}finally{await db.close();}
