import assert from 'node:assert/strict';
import {loadApi,fixture,clone,TEST_NOW} from './helpers/workshop-api.mjs';
const before=fixture(),after=clone(before),start=TEST_NOW-60000;
after.sessions=[{id:'s1',emp:'E1',job:'JC1',assignmentId:'a1',start,end:TEST_NOW,finished:true}];
after.assign[0].completed=true;after.assign[0].completedAt=TEST_NOW;
after.jobs[0].status='Completed';after.jobs[0].completedAt=TEST_NOW;
const {helpers}=loadApi({state:before});
assert.equal(helpers.validateEmployeeChange('E1',before,after),true,'own Finish derives job completion');
for(const edit of [x=>x.jobs[0].vehicle='Spoofed',x=>x.jobs[0].completedAt++,x=>x.assign.push({id:'other',emp:'E2',job:'JC1',completed:false})]){
 const bad=clone(after);edit(bad);assert.equal(helpers.validateEmployeeChange('E1',before,bad),false);
}
console.log('Employee Finish derives job completion without permitting metadata or other employee changes');
