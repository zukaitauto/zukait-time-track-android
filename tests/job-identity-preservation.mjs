import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';
const state={jobs:[{no:'J1',customerName:'Existing customer',customerMobile:'90000000',intakeOdometer:0,intakeOdometerUnit:'KM'},{no:'J2',customerName:'Visit 2',intakeOdometer:12345,jobIntakeOdometer:null}]};const before=JSON.stringify(state);const ctx={state,window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/src/main/assets/job_card_master.js','utf8'),ctx);const identity=ctx.window.zukaitJobCardMaster.identity;assert.equal(identity('J1').customer,'Existing customer');assert.equal(identity('J1').mobile,'90000000');assert.equal(identity('J1').jobIntakeOdometer,0);assert.equal(identity('J2').jobIntakeOdometer,null);assert.equal(JSON.stringify(state),before);console.log('PASS shared customer/phone aliases, zero KM, explicit clearing, separate visits and read-only identity');

// Cleared current fields must never revive stale aliases or historical copies.
const master=ctx.window.zukaitJobCardMaster;
state.jobs.push({no:'J3',year:'',modelYear:'2019',reg:'',registrationNo:'OLD',vin:'',VIN:'OLDVIN',color:'',colour:'Old blue',colorCode:'',colourCode:'Old code',claimNo:'',claimNumber:'OLD-CLAIM',customer:null,customerName:'Old customer',mobile:'',phone:'OLD-PHONE',jobIntakeOdometer:null,intakeOdometer:999,jobIntakeOdometerUnit:'MILES'});
const saved=JSON.stringify(state),cleared=master.identity('J3');
for(const key of ['year','reg','vin','color','colorCode','claimNo','customer','mobile'])assert.equal(cleared[key],'',key+' explicit clear');
const display=master.display('J3',{customerName:'Snapshot customer',modelYear:'2020',VIN:'SNAPSHOT',intakeOdometer:123,odometerUnit:'KM',colourCode:'SNAPSHOT'});
assert.equal(display.customer,'');assert.equal(display.jobIntakeOdometer,null);assert.equal(display.jobIntakeOdometerUnit,'MILES');
for(const key of ['customerName','modelYear','VIN','intakeOdometer','odometerUnit','colourCode'])assert.equal(display[key],undefined,key+' stale snapshot removed for legacy and linked jobs');
assert.equal(JSON.stringify(state),saved,'shared identity is read-only');
console.log('PASS explicit clears beat legacy aliases and stale report snapshots for vehicle, customer/contact and odometer fields.');

state.jobs.push({no:'J4',modelYear:'',vehicleYear:'2020',registration:'',registrationNo:'NEW'});assert.equal(identity('J4').year,'2020');assert.equal(identity('J4').reg,'NEW');
