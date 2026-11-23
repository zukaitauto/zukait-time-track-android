import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const path='app/src/main/assets/v2/features/estimate/main_module.js';
const source=fs.readFileSync(path,'utf8');
const start=source.indexOf('function formatEstimateDescription(value){');
const end=source.indexOf('function lsRowsHtml(rows){',start);
assert.ok(start>0 && end>start,'Description normalization and suggestions must be in the shared estimate editor');

const saved=[
  {status:'Saved',labourRows:[{description:'fr brake o/h'},{description:'FR BRAKE O/H'}],
    partRows:[{description:'fr bumper'},{description:'FOG LAMP COVER lh'}]},
  {status:'Saved',lsRows:[{description:'fr brake pads replacing AND disc skimming'}],
    partRows:[{description:'Fr Bumper'}]},
  {status:'Draft',partRows:[{description:'do not suggest unsaved'}]}
];
let autoSaves=0;
const sandbox={
  state:{estimates:saved},
  ensureState(){},
  esc(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))},
  autoSave(){autoSaves++},
};
const helpers=vm.runInNewContext(source.slice(start,end)+
 '\n({formatEstimateDescription,estimateDescriptionOptions,normalizeEstimateDescriptionInput})',sandbox);
const format=helpers.formatEstimateDescription;
for(const [raw,expected] of [
  ['fr bumper','Fr Bumper'],
  ['FOG LAMP COVER lh','Fog Lamp Cover Lh'],
  ['fr brake o/h','Fr Brake O/H'],
  ['fr brake pads replacing AND disc skimming','Fr Brake Pads Replacing And Disc Skimming'],
  ['fender RH','Fender Rh'],
  ['Fr ABS sensor','Fr ABS Sensor'],
  ['  radiator   support panel  ','Radiator Support Panel'],
  ['a/c O/H','A/C O/H'],
]){
  assert.equal(format(raw),expected);
}
assert.equal(format(format('FR BRAKE o/h')),format('FR BRAKE o/h'),'Formatting should be idempotent');
const labour=helpers.estimateDescriptionOptions('LAB');
const parts=helpers.estimateDescriptionOptions('PART');
assert.ok(labour.includes('Fr Brake O/H')&&labour.includes('Fr Brake Pads Replacing And Disc Skimming'));
assert.ok(!labour.includes('Fr Bumper'),'Labour suggestions must not mix with Parts');
assert.ok(parts.includes('Fr Bumper')&&parts.includes('Fog Lamp Cover Lh'));
assert.ok(!parts.includes('Fr Brake O/H'),'Parts suggestions must not mix with Labour');
assert.ok(!parts.includes('Do Not Suggest Unsaved'));
assert.equal((parts.match(/Fr Bumper/g)||[]).length,1,'Case variants should not duplicate suggestions');
const input={value:'  fr   bumper  '};
helpers.normalizeEstimateDescriptionInput(input);
assert.equal(input.value,'Fr Bumper');
assert.equal(autoSaves,1);
assert.equal((source.match(/zukaitEstimate\.normalizeDescription\(this\)/g)||[]).length,3);
assert.equal((source.match(/esc\(formatEstimateDescription\(x\.description\)\)/g)||[]).length,3);
assert.ok(source.includes('description:formatEstimateDescription(r.querySelector(\'.est-desc\')?.value)'),
 'Normalized values must be saved to estimates');
console.log('PASS: Reception/Mechanical shared estimate title case, separated deduped saved suggestions, autosave and PDF formatting');
