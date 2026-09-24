import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const src=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const dir='app/src/main/assets/vehicle-logos';
const refs=[...new Set([...src.matchAll(/['"]([a-z0-9-]+\.svg)['"]/gi)].map(m=>m[1]))];
assert.ok(refs.length>20,'expected the vehicle logo authority to reference the brand SVG set');
const missing=refs.filter(name=>!fs.existsSync(path.join(dir,name)));
assert.deepEqual(missing,[],`missing referenced vehicle logo assets: ${missing.join(', ')}`);
for(const name of ['honda.svg','ford.svg','chevrolet.svg','gmc.svg','cadillac.svg']){
  const p=path.join(dir,name);
  assert.ok(fs.existsSync(p),`${name} must exist`);
  const svg=fs.readFileSync(p,'utf8');
  assert.match(svg,/<svg\b/i,`${name} must be an SVG`);
}
console.log(`Vehicle logo asset test passed: ${refs.length} referenced SVGs are present.`);
