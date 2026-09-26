import fs from'node:fs';import assert from'node:assert/strict';
const v67=fs.readFileSync('app/src/main/assets/v67_updates.js','utf8');
assert.match(v67,/window\.render=function\(\)\{if\(me\?\.role==='Manager'\)return renderManager67\(\)/);
assert.match(v67,/window\.renderManager=renderManager67/);
assert.match(v67,/zukaitManagerRendererAuthority='V67'/);
assert.doesNotMatch(v67,/setTimeout\(\(\)=>\{if\(me\?\.role==='Manager'\)renderManager67\(\)\},(?:0|80)\)/);
const start=v67.indexOf('function renderManager67()'),end=v67.indexOf("window.render=function",start),block=v67.slice(start,end);
assert.match(block,/Spare Parts/);assert.match(block,/data-v2-manager-spare-parts/);
console.log('V145 Manager single-render authority guard passed');