import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const code=fs.readFileSync('app/src/main/assets/print_navigation.js','utf8');
const calls=[],window={AndroidBridge:{printHtmlNamed:(html,title)=>calls.push({html,title})}},document={activeElement:null};
const native={window,document};vm.createContext(native);vm.runInContext(code,native);const p=window.zukaitOpenPrintPreview('Materials');p.document.write('<html>');p.document.write('Saved list</html>');p.document.close();p.print();assert.deepEqual(calls,[{html:'<html>Saved list</html>',title:'Materials'}]);
let printed=0,restored=0,frame;
class Node{constructor(tag){this.tag=tag;this.children=[];this.style={}}setAttribute(){}appendChild(x){this.children.push(x);return x}insertBefore(x){this.children.unshift(x)}querySelector(){return this.children[0]}querySelectorAll(){return []}addEventListener(type,fn){this[type]=fn}remove(){this.removed=true}focus(){}}
const doc={activeElement:{focus(){restored++}},body:new Node('body'),createElement(tag){const n=new Node(tag);if(tag==='iframe'){frame=n;n.contentDocument={body:new Node('body'),head:new Node('head'),querySelectorAll:()=>[],createElement:t=>new Node(t),addEventListener(){}};n.contentWindow={focus(){},print(){printed++}}}return n},addEventListener(){},removeEventListener(){}};
const browser={window:{},document:doc};vm.createContext(browser);vm.runInContext(code,browser);
const preview=browser.window.zukaitOpenPrintPreview('Report');preview.document.write('<html><body>Report</body></html>');preview.document.close();preview.print();assert.equal(printed,0,'print waits for iframe');frame.onload();assert.equal(printed,1);
const nav=frame.contentDocument.body.children[0];assert.equal(nav.children[0].textContent,'← Back');assert.equal(nav.children[1].textContent,'✕ Close');nav.children[0].click();assert.equal(doc.body.children[0].removed,true);assert.equal(restored,1);
const second=browser.window.zukaitOpenPrintPreview('Paint');second.document.write('Paint');second.document.close();frame.onload();frame.contentDocument.body.children[0].children[1].click();assert.equal(doc.body.children[1].removed,true);assert.equal(restored,2);
assert.doesNotMatch(code,/history\.back|window\.close\(/);console.log('Print navigation: native routing, preview readiness, Back and Close passed');
