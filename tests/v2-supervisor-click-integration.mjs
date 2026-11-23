import fs from 'node:fs';import assert from 'node:assert/strict';
const sup=fs.readFileSync('app/src/main/assets/supervisor_stable.js','utf8');
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const srcs=[...html.matchAll(/<script[^>]+src="([^"?]+)[^"]*"[^>]*><\/script>/g)].map(m=>m[1]);
let all=html+'\n'+sup;
for(const src of srcs){const p='app/src/main/assets/'+src;if(fs.existsSync(p))all+='\n'+fs.readFileSync(p,'utf8')}
const names=[...new Set([...sup.matchAll(/onclick="([A-Za-z_$][\w$]*)\(/g)].map(m=>m[1]))];
const missing=names.filter(n=>!new RegExp('(?:function\\s+'+n+'\\s*\\(|window\\.'+n+'\\s*=|(?:const|let|var)\\s+'+n+'\\s*=)').test(all));
assert.deepEqual(missing,[], 'Supervisor onclick targets must resolve: '+missing.join(', '));
assert.match(sup,/v74Ready\('supervisor'\)/);assert.match(sup,/v106OpenAssignID001\(\)/);assert.match(sup,/v753OpenID001Report\(\)/);assert.match(sup,/openAdditionalHistoryWindow\(\)/);
const spare=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
assert.match(spare,/typeof me!=='undefined'&&me/,'Spare Parts must bridge legacy lexical session identity');
console.log('Supervisor click and Spare Parts identity integration guard passed');