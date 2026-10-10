#!/usr/bin/env node
'use strict';
// Read-only public GitHub Pages diagnostic: no tokens, login, writes or API mutations.
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {writeFileSync,appendFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const SITE='https://zukaitauto.github.io/zukait-time-track-android/';
const OLD='8458b8082281779a0abb584cb6310354ebed1624';
const FILES=[
 ['index.html','app/src/main/assets/offline_test.html'],
 ['v2/features/insurance/reception.js','app/src/main/assets/v2/features/insurance/reception.js']
];
function hash(bytes){return createHash('sha256').update(bytes).digest('hex');}
function classification(actual,old,current){
 if(actual===old&&actual===current)return 'MATCHES_BOTH';
 if(actual===old)return 'MATCHES_OLDER_PAGES_SOURCE';
 if(actual===current)return 'MATCHES_TESTED_BRANCH_SOURCE';
 return 'DIFFERENT_FROM_BOTH';
}
function fromGit(ref,path){return execFileSync('git',['show',ref+':'+path],{maxBuffer:4*1024*1024});}
async function download(path){
 const target=new URL(path,SITE);
 let last;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const response=await fetch(target,{
    redirect:'follow',signal:AbortSignal.timeout(18000),
    headers:{'User-Agent':'Zukait-Release-Pages-ReadOnly-Verification'}
   });
   const destination=new URL(response.url);
   if(destination.protocol!=='https:'||destination.hostname!=='zukaitauto.github.io')
     throw Error('Unexpected redirect host');
   if(!response.ok)throw Error('HTTP '+response.status);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length<128||bytes.length>5*1024*1024)throw Error('Unexpected response size');
   return {bytes,httpStatus:response.status,contentType:response.headers.get('content-type')||''};
  }catch(e){last=e;}
 }
 throw last;
}
function summarizeReport(report){
 const lines=['## Reception PC live-site comparison','Target: '+SITE,
  'Tested SHA: '+report.sourceSha,
  'Last known Pages SHA: '+OLD,''];
 for(const item of report.files){
  lines.push('- '+item.path+': '+(item.status||'INCONCLUSIVE')+
    (item.remoteSha256?' (SHA256 '+item.remoteSha256+')':'')+
    (item.error?' — '+item.error:''));
 }
 lines.push('', '**Read-only diagnostics are NOT publication, release approval, authenticated QA, or a complete acceptance gate.**');
 return lines.join('\n')+'\n';
}
async function main(){
 if(process.argv.includes('--self-test')){
  assert.equal(hash(Buffer.from('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(classification('a','a','b'),'MATCHES_OLDER_PAGES_SOURCE');
  assert.equal(classification('b','a','b'),'MATCHES_TESTED_BRANCH_SOURCE');
  assert.equal(classification('c','a','b'),'DIFFERENT_FROM_BOTH');
  console.log('Read-only Pages comparison self-test PASS');
  return;
 }
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const report={target:SITE,sourceSha:head,oldPagesSource:OLD,checkedAtUtc:new Date().toISOString(),files:[]};
 for(const [path,sourcePath] of FILES){
  const old=hash(fromGit(OLD,sourcePath));
  const current=hash(fromGit('HEAD',sourcePath));
  const item={path,oldSourceSha256:old,testedSourceSha256:current};
  try{
   const response=await download(path);
   item.httpStatus=response.httpStatus;
   item.contentType=response.contentType;
   item.remoteSha256=hash(response.bytes);
   item.bytes=response.bytes.length;
   item.status=classification(item.remoteSha256,old,current);
   if(path==='index.html'){
    const html=response.bytes.toString('utf8');
    item.scriptReferencesReception=/src=["']v2\/features\/insurance\/reception\.js\?v=/.test(html);
    item.hasLatestQueryTag=html.includes('304-compat-reception-1');
   }
  }catch(e){
   item.status='INCONCLUSIVE';
   item.error=String(e.message||e).slice(0,230);
  }
  report.files.push(item);
 }
 writeFileSync('reception-pages-live-report.json',JSON.stringify(report,null,2)+'\n');
 const summary=summarizeReport(report);
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
 for(const item of report.files)
  console.log(item.path+': '+item.status+(item.remoteSha256?' SHA256='+item.remoteSha256:' '+(item.error||'')));
 if(report.files.some(x=>x.status==='INCONCLUSIVE'))process.exitCode=2;
}
main().catch(e=>{console.error('Diagnostic could not complete:',String(e.message||e));process.exitCode=2;});
