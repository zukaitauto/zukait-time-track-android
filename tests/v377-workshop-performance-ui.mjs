// V377 Workshop Performance static wiring regression checks.
// Run: node tests/v377-workshop-performance-ui.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../app/src/main/assets/offline_test.html',import.meta.url),'utf8');
const start=html.indexOf("const cards=[['Work in Progress'");
assert.ok(start>=0,'Workshop Performance theme script exists');
const section=html.slice(start,html.indexOf('})();',start)+5);
assert.match(section,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'two-column desktop grid');
for(const [key,order] of [['progress',2],['repeat',3],['efficiency',4],['labour',1],['parts',5],['consumables',6],['cash',7],['insurance',8]]){
 const marker='data-perf-key=\\\"'+key+'\\\"]{';
 const pos=section.indexOf(marker);
 assert.ok(pos>=0,key+' card style exists');
 const rule=section.slice(pos,section.indexOf('}',pos));
 assert.ok(rule.includes('order:'+order+';'),key+' card order');
}
assert.match(section,/window\.openEmployeeEfficiency\(\)/,'efficiency tile opens employee ranking');
assert.match(section,/event\.stopImmediatePropagation\(\)/,'legacy handler blocked');
assert.match(html,/Completed normal assignments only/,'employee ranking excludes repeat assignments');
console.log('V377 Workshop Performance layout and efficiency wiring: PASS');
