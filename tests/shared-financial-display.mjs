import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({window:{},state:{jobs:[{no:'12053',jobType:'Cash',amount:35,delivered:true}]}});
vm.runInContext(fs.readFileSync('app/src/main/assets/job_card_master.js','utf8'),ctx);
const master=ctx.window.zukaitJobCardMaster;
for(const v of [undefined,null,'','invalid',false,-1]){
 ctx.state.jobs[0].finalInvoiceAmount=v;
 assert.equal(master.identity('12053').finalInvoiceAmount,null,'Absent or invalid invoice cannot become a saved zero');
 assert.equal(master.display('12053',{finalInvoiceAmount:999}).finalInvoiceAmount,null,'Authoritative absence must override stale report snapshots');
 assert.equal(master.display('12053').amount,35);
}
for(const v of [0,35,'35.000']){
 ctx.state.jobs[0].finalInvoiceAmount=v;
 assert.equal(master.display('12053').finalInvoiceAmount,Number(v),'Valid financial amount, including zero, must be preserved');
}
delete ctx.state.jobs[0].finalInvoiceAmount;ctx.state.jobs[0].invoiceAmount=35;
assert.equal(master.identity('12053').finalInvoiceAmount,35,'Legacy recorded invoices remain available');
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
for(const name of ['job_card_master','cash_monthly_pulse','cloud_sync','qc_delivery'])assert.match(html,new RegExp(name+'\\.js\\?v=2026101404'),'Changed shared scripts must use new browser cache keys');
console.log('Shared financial display passed: missing vs zero, saved amounts, stale snapshots, legacy invoices and browser cache keys');
