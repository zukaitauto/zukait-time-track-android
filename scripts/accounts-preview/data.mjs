// Synthetic display fixture only; never accesses a database or exports production data.
import fs from 'node:fs';
import {accountantApi} from '../../supabase/functions/workshop-api/accountant/api.js';
const month=new Date(Date.now()+14400000).toISOString().slice(0,7),date=month+'-05';
const context={revision:1,finance_revision:1,state:{jobs:[{no:'DEMO-001',jobType:'CASH',vehicle:'Toyota Camry',reg:'DEMO 001',customerName:'Example customer',finalInvoiceAmount:150,invoiceDate:date},{no:'DEMO-002',jobType:'CASH',vehicle:'Nissan Altima',reg:'DEMO 002',customerName:'Example customer 2',finalInvoiceAmount:85.5,invoiceDate:date}],assign:[],sessions:[],consumables:{materials:[],actuals:[]},paintPurchasing:{orders:[]}},events:[],entries:[]};
const user={id:'VISUAL-PREVIEW',role:'Manager',name:'Visual preview · example data'};
const admin={rpc:async name=>{if(name!=='zukait_accountant_context')throw Error('Unexpected preview RPC');return {data:context,error:null}}};
const data={month,user};
for(const [key,body] of Object.entries({dashboard:{action:'accountant_dashboard'},cash:{action:'accountant_report',report:'cash_invoices',filters:{month},offset:0,limit:25},ledger:{action:'accountant_report',report:'cash',filters:{month},offset:0,limit:25},detail:{action:'accountant_jc_detail',job_card:'DEMO-001'}})){
 const r=await accountantApi(admin,user,body,'ISOLATED-NOT-A-PRODUCTION-SECRET');if(r.status!==200)throw Error(JSON.stringify(r));data[key]=r.body;
}
fs.writeFileSync('artifacts/accounts-preview/data.js','window.ZUKAIT_VISUAL_PREVIEW_DATA='+JSON.stringify(data)+';\n');
