import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8'),pipeline=fs.readFileSync('.github/workflows/publish-approved-release.yml','utf8');
const styles=[...html.matchAll(/<link\b[^>]*>/gi)].map(x=>x[0]).filter(x=>/rel=["']stylesheet["']/i.test(x)).map(x=>x.match(/href=["']([^"']+)/i)?.[1]).filter(Boolean);
assert.ok(styles.length>0);
for(const url of styles){if(/^https?:/.test(url))continue;const path=url.split('?')[0];assert.ok(!path.includes('..'));assert.ok(fs.statSync('app/src/main/assets/'+path).size>0);assert.ok(pipeline.includes('cp app/src/main/assets/'+path+' _site/'+path),'Public Pages must copy referenced stylesheet '+path);}
assert.match(html,/manager_job_edit\.css\?v=348/,'Refresh the formerly missing stylesheet cache key');
console.log('Public stylesheets: all local CSS references exist and are copied into Pages.');
