import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8');
const start=source.indexOf('function formatEstimateDescription(value){');
const end=source.indexOf('function lsRowsHtml(rows){',start);
assert.ok(start>0&&end>start,'Shared estimate description functions are available');

const saved=[
  {status:'Saved',partRows:[
    {description:'fr rh fender'}, {description:'fr rh fender liner'},
    {description:'fr rh fender molding'},{description:'Fr Fender Rh'},
    {description:'Fr Bumper'},{description:'Tail Lamp Rh'}]},
  {status:'Draft',partRows:[{description:'Unsaved Secret Part'}]},
  {status:'Saved',labourRows:[{description:'Fr Rh Fender Labour'}]}
];
let saves=0;
const helpers=vm.runInNewContext(source.slice(start,end)+
 '\n({estimatePartSuggestionList,showEstimatePartHints,hideEstimatePartHints,selectEstimatePartHint,estimatePartHintKeydown})',{
 state:{estimates:saved},ensureState(){},autoSave(){saves++},
 esc:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 setTimeout
});
const match=query=>Array.from(helpers.estimatePartSuggestionList(query));
assert.deepEqual(match(''),[],'No parts shown before typing');
assert.deepEqual(match('F'),[],'Do not open the entire catalog on one key');
assert.deepEqual(match('FR RH FE').slice(0,3),[
 'Fr Rh Fender','Fr Rh Fender Liner','Fr Rh Fender Molding'
],'Part-name suggestions should match the abbreviated ordered prefix');
assert.ok(match('fr rh fe').includes('Fr Fender Rh'),'Side and component in another order should still match');
assert.ok(match('tail lamp').includes('Tail Lamp Rh'));
assert.ok(!match('fr rh fe').some(x=>x.includes('Labour')),'Labour is excluded from parts search');
assert.ok(!match('unsaved').length,'Only saved part descriptions supply catalog values');
assert.ok(match('fr').length<=8,'Never display more than 8 suggestions');

let panel={hidden:true,innerHTML:''};
const input={
 value:'',attributes:{},_partHints:[],
 setAttribute(k,v){this.attributes[k]=v},
 focus(){this.focused=true},
 closest(){return wrapper}
};
const wrapper={querySelector(selector){
 if(selector==='.est-part-suggestions')return panel;
 if(selector==='.est-desc')return input;
 return null;
}};
helpers.showEstimatePartHints(input);
assert.equal(panel.hidden,true,'Focus/empty text keeps suggestions closed');
input.value='FR RH FE';
helpers.showEstimatePartHints(input);
assert.equal(panel.hidden,false,'Suggestions show after typing');
assert.equal(input.attributes['aria-expanded'],'true');
assert.match(panel.innerHTML,/Fr Rh Fender Liner/);
assert.doesNotMatch(panel.innerHTML,/Fr Bumper/,'Unrelated parts must not appear');
const button={closest(){return wrapper},getAttribute(){return '1'}};
helpers.selectEstimatePartHint(button);
assert.equal(input.value,'Fr Rh Fender Liner','Chosen suggestion fills the description');
assert.equal(panel.hidden,true,'Choice closes dropdown');
assert.equal(input.attributes['aria-expanded'],'false');
assert.equal(saves,1,'Selection uses the existing autosave path');

assert.ok(source.includes('oninput="zukaitEstimate.suggestParts(this)"'));
assert.ok(source.includes('onkeydown="zukaitEstimate.partHintKeydown(event,this)"'));
assert.ok(source.includes('onblur="zukaitEstimate.hidePartHints(this)"'));
assert.ok(source.includes('class="est-part-suggestions" role="listbox" hidden'));
assert.ok(!source.includes('list="estPartDescOptions"'),'No native full-catalog PART datalist');
assert.ok(!source.includes('<datalist id="estPartDescOptions">'),'No full PART datalist rendered on editor open');
assert.ok(source.includes('list="estLabDescOptions"'),'Labour description workflow stays unchanged');
assert.ok(source.includes("description:formatEstimateDescription(r.querySelector('.est-desc')?.value)"),
 'Part selection and typed descriptions still serialize via existing estimate save workflow');
console.log('PASS: estimate parts type-to-suggest after 2 characters, FR RH FE matches, max 8, pick/autosave, no full dropdown');
