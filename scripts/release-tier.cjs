'use strict';
// Advisory classifier only: NEVER authorizes publication or overrides release-request.json.
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const majorRules=[
 /^(supabase\/|database\/|migrations\/|scripts\/verify-.*release|\.github\/workflows\/publish-)/,
 /(^|\/)(auth|permissions|financial|invoice|insurance_management|job_edit_rules|time_management_rules)(\/|\.|_)/i,
 /^(app\/src\/main\/assets\/(workshop_api|workshop_overview|v2\/features\/insurance)\b)/,
];
function classify(changed) {
 const files=changed.filter(Boolean);
 const triggers=files.filter(f=>majorRules.some(re=>re.test(f)));
 // Fail closed: JavaScript UI controllers can write business data and are not cosmetic by default.
 const isUiAsset=f=>/^app\/src\/main\/res\/(layout|drawable|color|font|mipmap|values)\//.test(f) || /^app\/src\/main\/assets\/[^/]+\.(css|svg|png|jpg|webp)$/.test(f);
 const result=triggers.length?'MAJOR':files.length&&files.every(isUiAsset)?'NORMAL_UI':'REVIEW';
 return {tier:result,files,majorTriggers:triggers,advisoryOnly:true};
}
if(require.main===module){
 const base=process.argv[2];
 if(!base) {console.error('Usage: node scripts/release-tier.cjs <verified-base-commit>');process.exit(2);}
 const files=execFileSync('git',['diff','--name-only',base,'HEAD','--'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 const result=classify(files);
 console.log(JSON.stringify(result,null,2));
 // Classification never changes approval or masks failed release gates.
}
module.exports={classify};
