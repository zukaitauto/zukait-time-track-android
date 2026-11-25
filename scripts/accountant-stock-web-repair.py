"""Restore omitted Accountant script dependencies from the already-published V421 source.
No APK, updater, backend, staff session or database is changed.
"""
import concurrent.futures, hashlib, json, pathlib, subprocess, sys, time, urllib.request
from html.parser import HTMLParser
from urllib.parse import urlsplit, quote

BASE = "https://zukaitauto.github.io/zukait-time-track-android/"
SOURCE = "5e02808249f536505d115d2f054651c161617408"
APK = "593bde3fe7733e312891cf2117f5bdd3f53b914830832db66f946f9064210f3a"
SITE = pathlib.Path("_site")
EVIDENCE = pathlib.Path("artifacts/accountant-stock-web-repair")
def digest(data): return hashlib.sha256(data).hexdigest()
def require(condition, message):
    if not condition: raise ValueError(message)
def safe(name):
    p=pathlib.PurePosixPath(name)
    require(bool(name) and not p.is_absolute() and ".." not in p.parts and ":" not in name and "\\" not in name and "?" not in name and "#" not in name, "Unsafe path: "+name)
    return p
def fetch(name):
    with urllib.request.urlopen(urllib.request.Request(BASE+name,headers={"Cache-Control":"no-cache","User-Agent":"Zukait-stock-web-repair"}),timeout=45) as response:
        require(response.url.startswith(BASE),"Unexpected redirect")
        return response.read()
def pinned(name):
    return subprocess.check_output(["git","show",SOURCE+":app/src/main/assets/"+str(safe(name))])
def check_record(record):
    require(record.get("sourceCommit")==SOURCE and record.get("versionName")=="V421" and record.get("versionCode")==384 and record.get("apkSha256")==APK and record.get("releaseTag")=="release-V421-architecture-v2","Live release is not the expected V421")
    require("accountant.html" in record["files"] and "index.html" in record["files"] and "receptionist.html" in record["files"],"Incomplete live manifest")
def check_updater():
    u=json.loads(pathlib.Path("latest-version.json").read_text())
    require(u.get("sourceCommit")==SOURCE and u.get("versionCode")==384 and u.get("apkSha256")==APK and u.get("status")=="current","Updater changed; stop")
class Scripts(HTMLParser):
    def __init__(self):
        super().__init__(); self.urls=[]
    def handle_starttag(self,tag,attrs):
        if tag=="script":
            src=dict(attrs).get("src")
            if src: self.urls.append(src)
def dependencies(markup):
    p=Scripts(); p.feed(markup.decode("utf-8"))
    urls={}
    for url in p.urls:
        q=urlsplit(url)
        require(not q.scheme and not q.netloc and not q.fragment,"Unexpected external Accountant script")
        name=str(safe(q.path)); urls.setdefault(name,[]).append(url)
    require("accountant_stock.js" in urls,"Stock script not referenced")
    return urls
def prepare():
    check_updater()
    require(not SITE.exists(),"Refuse to overwrite staging")
    raw=fetch("release-integrity.json"); record=json.loads(raw); check_record(record)
    SITE.mkdir(); EVIDENCE.mkdir(parents=True,exist_ok=True)
    original=dict(record["files"])
    def preserve(entry):
        name,sha=entry; path=safe(name); data=fetch(quote(name,safe="/"))
        require(digest(data)==sha,"Live asset drift: "+name)
        dest=SITE/path; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(data)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: list(pool.map(preserve,original.items()))
    markup=(SITE/"accountant.html").read_bytes()
    require(markup==pinned("accountant.html"),"Live Accountant markup differs from signed V421 source")
    urls=dependencies(markup)
    added=[]
    for name in urls:
        data=pinned(name)
        if name in original:
            require(digest(data)==original[name],"Existing Accountant dependency differs from signed source: "+name)
        else:
            path=SITE/safe(name); path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(data)
            record["files"][name]=digest(data); added.append(name)
    require(all(record["files"][n]==sha for n,sha in original.items()),"Existing manifest entries changed")
    require("accountant_stock.js" in record["files"],"Stock adapter missing")
    (SITE/"release-integrity.json").write_text(json.dumps(record,indent=2)+"\n")
    (SITE/".nojekyll").touch()
    (EVIDENCE/"original-manifest.json").write_bytes(raw)
    (EVIDENCE/"repair.json").write_text(json.dumps({"sourceCommit":SOURCE,"added":added,"preserved":len(original),"apkUnchanged":True},indent=2)+"\n")
    print("V421 preserved; restored signed-source scripts:",added)
def verify():
    check_updater()
    record=json.loads((SITE/"release-integrity.json").read_text()); check_record(record)
    raw=(EVIDENCE/"original-manifest.json").read_bytes(); original=json.loads(raw)
    require(all(record["files"].get(n)==sha for n,sha in original["files"].items()),"Existing assets were not preserved")
    urls=dependencies((SITE/"accountant.html").read_bytes())
    checks={quote(n,safe="/"):sha for n,sha in record["files"].items()}
    checks["release-integrity.json"]=digest((SITE/"release-integrity.json").read_bytes())
    for name,links in urls.items():
        for link in links: checks[link]=record["files"][name]
    def verify_one(entry):
        name,sha=entry
        require(digest(fetch(name))==sha,"Public asset mismatch: "+name)
    for attempt in range(12):
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: list(pool.map(verify_one,checks.items()))
            break
        except Exception:
            if attempt==11: raise
            time.sleep(10)
    (EVIDENCE/"verified.json").write_text(json.dumps({"verified":len(checks),"sourceCommit":SOURCE,"apkUnchanged":True,"productionWrites":False},indent=2)+"\n")
    print("Verified all existing public assets and exact Accountant script URLs.")
def selftest():
    assert dependencies(b'<script src="accountant_stock.js?v=421"></script>')=={"accountant_stock.js":["accountant_stock.js?v=421"]}
    for bad in ["../x","https://x/a.js","/x","a\\b"]:
        try: dependencies(('<script src="accountant_stock.js"></script><script src="'+bad+'"></script>').encode())
        except ValueError: pass
        else: raise AssertionError("Unsafe script accepted: "+bad)
    print("PASS: Accountant script discovery and path guards")
if __name__=="__main__":
    {"prepare":prepare,"verify":verify,"selftest":selftest}[sys.argv[1]]()
