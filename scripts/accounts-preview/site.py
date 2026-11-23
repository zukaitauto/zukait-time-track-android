"""Protected additive preview: retain every existing production asset byte-for-byte."""
import concurrent.futures, hashlib, json, pathlib, shutil, sys, urllib.request
BASE='https://zukaitauto.github.io/zukait-time-track-android/'
PREFIX='previews/accounts-cash-invoices'
def digest(b): return hashlib.sha256(b).hexdigest()
def safe_path(name):
 p=pathlib.PurePosixPath(name)
 if p.is_absolute() or '..' in p.parts or ':' in name or '\\' in name: raise ValueError('Unsafe asset path')
 return p

def get(name):
 with urllib.request.urlopen(urllib.request.Request(BASE+name,headers={'Cache-Control':'no-cache'}),timeout=45) as r: return r.read()

def preserve(target,record,raw,reader=get):
 entries=list(record['files'].items())
 def copy(entry):
  name,expected=entry;p=safe_path(name);data=reader(name)
  if digest(data)!=expected: raise ValueError('Live workshop source drift: '+name)
  dest=target/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: list(pool.map(copy,entries))
 (target/'release-integrity.json').write_bytes(raw);(target/'.nojekyll').touch()

def preview(target,assets,source):
 dest=target/PREFIX;dest.mkdir(parents=True,exist_ok=True)
 for pattern in ['accountant*','dashboard_cards.css','report_pdf_export.js']:
  for p in assets.glob(pattern):
   if p.is_file(): shutil.copy2(p,dest/p.name)
 shutil.copytree(assets/'vendor/pdf',dest/'vendor/pdf',dirs_exist_ok=True)
 shutil.copy2(pathlib.Path(__file__).with_name('guard.js'),dest/'preview-guard.js')
 shutil.copy2('artifacts/accounts-preview/data.js',dest/'preview-data.js')
 html=(assets/'accountant.html').read_text()
 import re
 html=re.sub(r'<script src="session_privacy\.js[^\"]*"></script>','',html,count=1)
 html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; connect-src \'none\'; form-action \'none\'; object-src \'none\'; base-uri \'none\'"><script src="preview-data.js"></script><script src="preview-guard.js"></script>',1)
 html=html.replace('<body>','<body><aside style="padding:12px;background:#fff4cf;color:#17263b"><b>Cash Invoices · Read-only visual preview</b><p id="preview-status">Example data only. No sign-in or live database connection. No transactions can be saved here.</p><a href="../../index.html" target="_blank" rel="noopener">Open workshop app / sign in</a></aside>',1)
 (dest/'accountant.html').write_text(html)
 (dest/'index.html').write_text('<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Cash Invoices Preview</title></head><body style=\"margin:0\"><iframe title=\"Cash Invoices visual preview\" sandbox=\"allow-scripts\" src=\"accountant.html\" style=\"border:0;width:100%;height:100dvh\"></iframe></body></html>')
 (dest/'preview-integrity.json').write_text(json.dumps({'sourceCommit':source,'readOnly':True,'files':{str(p.relative_to(dest)):digest(p.read_bytes()) for p in dest.rglob('*') if p.is_file()}},indent=2)+'\n')

def main():
 mode=sys.argv[1];target=pathlib.Path('_site');evidence=pathlib.Path('artifacts/accounts-preview');evidence.mkdir(parents=True,exist_ok=True)
 if mode=='prepare':
  raw=get('release-integrity.json');record=json.loads(raw)
  approval=json.loads(pathlib.Path('accounts-web-preview-request.json').read_text())
  assert record['sourceCommit']==approval['preservedWorkshopSource'], 'Published workshop changed; review baseline again'
  assert not target.exists(), 'Refuse to overwrite existing site'
  target.mkdir();preserve(target,record,raw);preview(target,pathlib.Path('app/src/main/assets'),approval['sourceCommit'])
  (evidence/'preserved-workshop.json').write_bytes(raw)
 elif mode=='verify':
  record=json.loads((target/'release-integrity.json').read_text());entries=dict(record['files']);entries['release-integrity.json']=digest((target/'release-integrity.json').read_bytes())
  for p in (target/PREFIX).rglob('*'):
   if p.is_file(): entries[str(p.relative_to(target))]=digest(p.read_bytes())
  def check(entry):
   name,expected=entry
   if digest(get(name))!=expected: raise ValueError('Live publication mismatch: '+name)
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: list(pool.map(check,entries.items()))
  (evidence/'live-verification.json').write_text(json.dumps({'verifiedAssets':len(entries),'preservedWorkshopSource':record['sourceCommit'],'previewSource':json.loads((target/PREFIX/'preview-integrity.json').read_text())['sourceCommit'],'productionAccountingWrites':False},indent=2)+'\n')
 else: raise ValueError('Unknown mode')
if __name__=='__main__': main()
