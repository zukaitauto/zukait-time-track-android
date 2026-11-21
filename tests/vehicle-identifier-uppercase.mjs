import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const root='app/src/main/assets/';
const source=fs.readFileSync(root+'vehicle_identifier_uppercase.js','utf8');
for(const page of ['offline_test.html','receptionist.html','mechanical_supervisor.html','mechanical_estimate.html','accountant.html']){
 const html=fs.readFileSync(root+page,'utf8');
 assert.match(html,/<script src="vehicle_identifier_uppercase\.js\?v=[^"]+"><\/script>/,
   'Every standalone dashboard host must load uppercase entry handling: '+page);
}
const markup='<!doctype html><html><body>'+
 '<form id="manager">'+
 '<label>Registration Number *<input id="newReg" value="51748-r"></label>'+
 '<label>VIN / Chassis<input id="mje-vin" value="4t1b11hk9ju016849"></label>'+
 '<label>Vehicle Make<input name="make" value="toyota"></label>'+
 '<label>Customer<input name="customer" value="john smith"></label>'+
 '<label>Registration Date<input name="registration_date" value="november"></label>'+
 '<label>Reception Observations<textarea id="observations">please check left side</textarea></label>'+
 '<label>Contact<input id="contact" value="salim"></label>'+
 '<label>Email<input type="email" id="email" value="test@example.com"></label>'+
 '<label>PIN<input type="password" name="vin" value="abcde"></label>'+
 '<button type="button" id="manager-save">Save Job Card</button>'+
 '</form><div id="dynamic"></div></body></html>';
const dom=new JSDOM(markup,{url:'https://zukaitauto.github.io',runScripts:'outside-only'});
const {window}=dom,doc=window.document;
try {
 window.eval(source);
 doc.dispatchEvent(new window.Event('DOMContentLoaded',{bubbles:true}));
 assert.ok(window.zukaitVehicleIdentifierUppercase);
 const get=id=>doc.getElementById(id);
 assert.equal(get('newReg').value,'51748-R','already populated registration must render uppercase');
 assert.equal(get('mje-vin').value,'4T1B11HK9JU016849','already populated VIN must render uppercase');
 assert.equal(get('newReg').style.textTransform,'uppercase');

 get('newReg').value='32621-m';
 get('newReg').setSelectionRange(4,4);
 get('newReg').dispatchEvent(new window.Event('input',{bubbles:true}));
 assert.equal(get('newReg').value,'32621-M','lowercase typing normalizes immediately');
 assert.equal(get('newReg').selectionStart,4,'cursor remains in place');

 get('mje-vin').value='4t1b11hk9ju016849';
 get('mje-vin').dispatchEvent(new window.Event('input',{bubbles:true}));
 assert.equal(get('mje-vin').value,'4T1B11HK9JU016849');

 get('newReg').value='51487-w';
 get('newReg').dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(get('newReg').value,'51487-W','pasted/replaced value normalizes on change');

 let captured;
 get('manager-save').addEventListener('click',()=>{
  captured={reg:get('newReg').value,vin:get('mje-vin').value,make:doc.querySelector('[name=make]').value};
 });
 get('newReg').value='51487-r';
 get('mje-vin').value='jt2bk12u160023342';
 get('manager-save').click();
 assert.deepEqual(captured,{reg:'51487-R',vin:'JT2BK12U160023342',make:'toyota'},
  'programmatically filled identifiers normalize before a Save click');

 const box=get('dynamic');
 box.innerHTML='<form id="reception"><label>Registration Number *<input id="genericFieldA" value="51748-r"></label>'+
   '<label>VIN / Chassis<input id="genericFieldB" value="abcde12345"></label>'+
   '<label>Make<input name="make" value="toyota"></label>'+
   '<label>Plate No.<input name="plate_no" value="3456-k"></label>'+
   '<label>VIN<input name="vin" value="jt2bk12u160023342"></label>'+
   '<label>Registration Search<input id="search" value="toyota"></label>'+
   '<button type="submit">Create Checklist</button></form>';
 await Promise.resolve();
 const reception=get('reception');
 assert.equal(reception.elements.namedItem('plate_no').value,'3456-K');
 assert.equal(reception.elements.namedItem('vin').value,'JT2BK12U160023342');
 assert.equal(get('genericFieldA').value,'51748-R','visible label-only fallback');
 assert.equal(get('genericFieldB').value,'ABCDE12345');
 assert.equal(get('search').value,'toyota','generic search must remain unchanged');

 reception.elements.namedItem('plate_no').value='52525-p';
 reception.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(reception.elements.namedItem('plate_no').value,'52525-P');

 const mechanical=doc.createElement('input');
 mechanical.setAttribute('name','registration');
 mechanical.value='5123-z';
 box.appendChild(mechanical);
 await Promise.resolve();
 assert.equal(mechanical.value,'5123-Z','Mechanical dynamically created named field');

 const notes=doc.createElement('textarea');
 notes.id='vin_notes';
 notes.value='lowercase remarks';
 box.appendChild(notes);
 await Promise.resolve();
 assert.equal(notes.value,'lowercase remarks','VIN notes are not VIN numbers');

 for (const [selector,value] of [
  ['[name=make]','toyota'],['[name=customer]','john smith'],
  ['[name=registration_date]','november'],['#observations','please check left side'],
  ['#contact','salim'],['#email','test@example.com'],['[type=password]','abcde']
 ]) assert.equal(doc.querySelector(selector).value,value,'Non-identifier inputs unchanged: '+selector);
 assert.equal(window.zukaitVehicleIdentifierUppercase.kind(doc.querySelector('[name=registration_date]')),'');
 assert.equal(window.zukaitVehicleIdentifierUppercase.kind(doc.querySelector('#mje-vin')),'vin');
 assert.equal(window.zukaitVehicleIdentifierUppercase.kind(doc.querySelector('#newReg')),'registration');
 console.log('PASS: VIN/chassis and registration auto-uppercase across all dashboard entrypoints, including typed/pasted/dynamic/saved values; unrelated inputs unchanged');
} finally { window.close(); }
