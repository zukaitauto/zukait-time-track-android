import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const ctx={window:{}};
vm.runInNewContext(fs.readFileSync('app/src/main/assets/accountant_exports.js','utf8'),ctx,{filename:'accountant_exports.js'});
const exports=ctx.window.zukaitAccountantExports;
const columns=[
 ['No.','serial'],['JC','job_card'],['Labour OMR','labour_cost_omr',true],
 ['Paint OMR','paint_cost_omr',true],['Total Job Cost OMR','total_job_cost_omr',true],
 ['Net Profit / Loss OMR','net_profit_omr',true],['Percentage','percentage']
];
const rows=[
 {serial:1,job_card:'12103',labour_cost_omr:61.888,paint_cost_omr:4,total_job_cost_omr:81.818,net_profit_omr:58.182,percentage:41.56},
 {serial:2,job_card:'12108',labour_cost_omr:30.919,paint_cost_omr:null,total_job_cost_omr:null,net_profit_omr:-0.984,percentage:-1.97}
];
for(const title of ['Cash In','Insurance Invoiced','Profit / Loss','Leave Management','Job Card 360°']){
 const report=exports.html(title,columns,rows,'{"month":"2026-11","kind":"CASH"}',{cleanPrint:true});
 assert.ok(report.includes(title),'printed page heading includes '+title);
 assert.match(report,/Labour OMR/);
 assert.match(report,/Net Profit \/ Loss OMR/);
 assert.doesNotMatch(report,/kind&quot;|month&quot;|Revenue ≠|Purchases ≠|Estimated gross profit ≠/,'no filter JSON or descriptions in print');
 const td=[...report.matchAll(/<td>(.*?)<\/td>/g)].map(m=>m[1]);
 assert.deepEqual(td.slice(0,7),['1','12103','61.888','4.000','81.818','58.182','41.56%'],title+' print cells');
 assert.ok(td.includes('-0.984'),'negative currency retains sign and three decimals');
 assert.ok(td.includes('-1.97%'),'negative percentages retain percent sign');
 assert.ok(td.includes('Not Available / Pending'),'pending costs must not become zero');
 assert.ok(td.every(v=>!v.startsWith('OMR ')),'OMR appears in currency headers, not each row');
}
const legacyPdf=exports.html('Cash In',columns,rows,'Sample metadata');
assert.ok(legacyPdf.includes('OMR 61.888'),'default export behavior remains compatible');
assert.ok(legacyPdf.includes('Sample metadata'));
const accountJs=fs.readFileSync('app/src/main/assets/accountant.js','utf8');
assert.equal(accountJs.split("window.zukaitAccountantExports.html(title,exportColumns,all,'',{cleanPrint:true})").length-1,2,'both PDF and Print use clean print report');
assert.match(accountJs,/const html=financialDocument\(d,breakdown,kind==='print'\|\|kind==='pdf'\)/,'JC360 PDF and Print use compact format');
assert.match(accountJs,/table\(breakdown\[type\],drilldownColumns\[type\],false,cleanPrint\)/,'JC360 expense item rows use compact format');
console.log('Accounts print/PDF: 5 report types, only header OMR, percentage %, no filter JSON/descriptions, unchanged source values and JC360 compact print PASS');
