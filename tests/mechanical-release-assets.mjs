import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root='app/src/main/assets/',window={};
vm.runInNewContext(fs.readFileSync(root+'mechanical_release_flags.js','utf8'),{window});
const prep=fs.readFileSync('scripts/prepare-mechanical-acceptance.py','utf8');
const testedFlags=prep.match(/FLAGS=\[([^\]]+)\]/)[1].split(',').map(s=>s.trim().slice(1,-1));
assert.equal(testedFlags.length,7);
assert.deepEqual(Object.keys(window).sort(),testedFlags.slice().sort(),'production availability must match the isolated tested configuration without enabling finance expansion');
for(const flag of testedFlags)assert.equal(window[flag],true);
for(const html of ['offline_test.html','mechanical_supervisor.html','receptionist.html']){
 const source=fs.readFileSync(root+html,'utf8');
 assert.ok(source.includes('src="mechanical_release_flags.js?v=375"'));
 assert.ok(source.indexOf('mechanical_release_flags.js')<source.indexOf('</head>'));
}
for(const file of ['.github/workflows/pages.yml','.github/workflows/publish-approved-release.yml']){
 const source=fs.readFileSync(file,'utf8');
 assert.ok(source.includes("for origin in assets.glob('mechanical_*'):"),'dynamic Mechanical imports must be shipped');
 assert.ok(source.includes("parser.feed((assets / 'mechanical_supervisor.html').read_text(encoding='utf-8'))"));
}
const modules=fs.readdirSync(root).filter(n=>n.startsWith('mechanical_')&&n.endsWith('.js'));
const shipped=new Set([...modules,'accountant_exports.js','v2/features/estimate/main_module.js']);
assert.ok(fs.readFileSync(root+'offline_test.html','utf8').includes('src="v2/features/estimate/main_module.js'),'Both publishers must copy the shared estimate editor referenced by the main host');
assert.ok(fs.existsSync(root+'mechanical_estimate.html'),'The separate estimate document must ship with all mechanical_* assets');
for(const name of modules){
 const source=fs.readFileSync(root+name,'utf8');
 for(const m of source.matchAll(/(?:from\s*|import\s*\()\s*['"]\.\/([^'"]+)['"]/g)){
  assert.ok(shipped.has(m[1].split('?')[0]),'Missing Mechanical module dependency: '+name+' -> '+m[1]);
 }
}
const {mechanicalRoute}=await import('../supabase/functions/workshop-api/extensions/mechanical_route.js');
const denied=await mechanicalRoute({}, {id:'SUP003',role:'Mechanical Supervisor'}, {action:'mechanical_dashboard'},{});
assert.equal(denied.status,403,'client flags cannot bypass server activation or authorize access');
console.log('PASS production Mechanical flags match tested QA, all entrypoints load them, both PC publishers include dynamic modules, and server stays fail closed.');
