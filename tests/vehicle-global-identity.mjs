import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const v74=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8'),normalizer=v74.slice(v74.indexOf('window.zukaitVehicleAliasIndex='),v74.indexOf('window.v132OpenSupervisorVehicleEdit='));
const store={},ctx={window:{},localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v}},console};ctx.window.localStorage=ctx.localStorage;vm.createContext(ctx);vm.runInContext(normalizer,ctx);const n=ctx.window.zukaitNormalizeVehicle;
for(const [raw,make,model,year] of [['n.versa 2015','Nissan','Versa','2015'],['toy Camry 2012','Toyota','Camry','2012'],['Benz c300 2018','Mercedes-Benz','C300','2018'],['mit-pajero 2017','Mitsubishi','Pajero','2017']]){const x=n('','',raw);assert.equal(x.make,make,raw+' make');assert.equal(x.model,model,raw+' model');assert.equal(x.year,year,raw+' year')}
ctx.window.zukaitLearnVehicleAlias('my patrol','Nissan','Patrol');const learned=n('','','my patrol 2020');assert.equal(learned.make,'Nissan');assert.equal(learned.model,'Patrol');assert.equal(learned.year,'2020');
const master=fs.readFileSync('app/src/main/assets/job_card_master.js','utf8');assert.match(master,/function patchIdentity\(no,patch,meta=/);assert.match(master,/colorCode','claimNo','jobType','insuranceCompany/);
const paint=fs.readFileSync('app/src/main/assets/paint_module.js','utf8');assert.match(paint,/patchIdentity\(j\.no,\{colorCode:o\.colorCode\},\{source:'PAINT_PURCHASE_ORDER'/);assert.match(paint,/zukaitJobCardMaster\?\.display\?\.\(j\.no,j\)/);
const quick=fs.readFileSync('app/src/main/assets/supervisor_stable.js','utf8');assert.match(quick,/zukaitNormalizeVehicle\?\.\('','',rawVehicle\)/);assert.match(quick,/make:nv\.make/);

assert.deepEqual(normalize('nISSAN','aLTIMA',''),{make:'Nissan',model:'Altima',vehicle:'Nissan Altima',year:'',learned:false});
assert.deepEqual(normalize('TOYOTA','camry',''),{make:'Toyota',model:'Camry',vehicle:'Toyota Camry',year:'',learned:false});
assert.deepEqual(normalize('honda','cr-v',''),{make:'Honda',model:'CR-V',vehicle:'Honda CR-V',year:'',learned:false});
assert.deepEqual(normalize('BMW','x5',''),{make:'BMW',model:'X5',vehicle:'BMW X5',year:'',learned:false});
console.log('Global vehicle identity, short-form recognition, alias learning and Paint PO color-code write-back passed');
