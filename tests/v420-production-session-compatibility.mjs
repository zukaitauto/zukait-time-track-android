import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const src=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const block=stripTypeScriptTypes(src.slice(src.indexOf('async function sessionUser('),src.indexOf('function same(',src.indexOf('async function sessionUser('))));
let checked=0;
for(const production of [false,true]) for(const role of ['Employee','Manager','Supervisor','Mechanical Supervisor','Receptionist','Accountant','Purchaser']) for(const must_change of [false,true]) for(const active of [false,true]) for(const revoked of [false,true]) {
 const staff={user_id:'QA',display_name:'Synthetic',role,department:'Workshop',active,must_change};
 const session={user_id:'QA',revoked_at:revoked?'revoked':null,last_seen_at:new Date().toISOString(),staff_credentials:staff,job_numbers:[]};
 const admin={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:session,error:null})})};
 const Deno={env:{get:()=>production?'https://pjknotnjkufadqavcmii.supabase.co':'https://wilbkrwbeptpgubxkxau.supabase.co'}};
 const sessionUser=new Function('admin','Deno','sha256Hex',block+';return sessionUser;')(admin,Deno,async()=> 'synthetic');
 const result=await sessionUser('synthetic');
 assert.equal(Boolean(result),active&&!revoked&&(!must_change||(production&&!['Receptionist','Accountant'].includes(role))));
 if(result)assert.equal(result.role,role);
 assert.equal(await sessionUser(''),null);
 checked++;
}
console.log('PASS production staff-session compatibility; revoked/inactive accounts denied; QA strict: '+checked+' role cases');
