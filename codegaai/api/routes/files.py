"""
codegaai.api.routes.files — ZIP upload/download, proje üretme, GitHub push
"""
from __future__ import annotations
import base64, io, re, time, uuid, zipfile
from pathlib import Path
from fastapi import APIRouter, File, UploadFile
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from codegaai.utils.logger import get_logger
log = get_logger(__name__)
router = APIRouter()
_file_store: dict = {}
_zip_store:  dict = {}
TEXT_EXTS = {".php",".html",".css",".js",".json",".xml",".txt",".md",
             ".py",".sql",".env",".htaccess",".ts",".tsx",".jsx",".vue",
             ".yaml",".yml",".sh",".bat",".ini",".toml",".conf",".gitignore"}

def _cleanup(store, mx=20):
    if len(store) > mx:
        for k in sorted(store, key=lambda k: store[k].get("ts",0))[:len(store)-mx]:
            del store[k]

# ── Upload ────────────────────────────────────────────────────────────────
@router.post("/upload")
async def upload_file(file: UploadFile = File(...)) -> dict:
    fid = str(uuid.uuid4())[:8]
    content = await file.read()
    fname = file.filename or "upload"
    ext = Path(fname).suffix.lower()
    result = {"file_id":fid,"filename":fname,"size_kb":round(len(content)/1024,1),"files":[],"context":""}
    if ext == ".zip":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                fl = zf.namelist(); result["files"] = fl[:100]
                texts = []; tot = 0
                for n in fl:
                    if tot > 60000: texts.append("\n[... daha fazla dosya ...]"); break
                    fe = Path(n).suffix.lower()
                    if fe in TEXT_EXTS or not fe:
                        try:
                            fc = zf.read(n).decode("utf-8","replace")
                            texts.append(f"\n### {n}\n```{fe[1:] or 'text'}\n{fc[:4000]}\n```"); tot += len(fc)
                        except: texts.append(f"\n### {n}\n[ikili dosya]")
                result["context"] = f"ZIP: **{fname}** ({len(fl)} dosya)\n" + "\n".join(texts)
        except zipfile.BadZipFile: return {"error":"Geçersiz ZIP"}
    else:
        try:
            text = content.decode("utf-8","replace")
            result["context"] = f"Dosya: **{fname}**\n```{ext[1:] or 'text'}\n{text[:12000]}\n```"
            result["files"] = [fname]
        except: result["context"] = f"İkili: {fname}"
    _file_store[fid] = {"filename":fname,"context":result["context"],"ts":time.time()}
    _cleanup(_file_store)
    log.info("Upload: %s (%.1f KB)", fname, result["size_kb"])
    return result

@router.get("/context/{fid}")
async def get_context(fid: str) -> dict:
    f = _file_store.get(fid)
    return {"context":f["context"],"filename":f["filename"]} if f else {"error":"Bulunamadı"}

# ── Parse & ZIP ───────────────────────────────────────────────────────────
def _parse(text: str) -> dict:
    files = {}
    for m in re.finditer(r'\[FILE:\s*([^\]]+)\]\s*\n(.*?)\[/FILE\]', text, re.DOTALL|re.I):
        code = re.sub(r'^```\w*\n?','',m.group(2).strip()); code = re.sub(r'\n?```$','',code)
        files[m.group(1).strip()] = code
    if not files:
        for m in re.finditer(r'(?:\*{1,2}|#{1,3}\s+)([a-zA-Z0-9_./-]+\.\w+)\*{0,2}\s*\n```(?:\w+)?\n(.*?)```', text, re.DOTALL):
            files[m.group(1).strip()] = m.group(2).strip()
    if not files:
        em = {"php":"index.php","html":"index.html","css":"style.css","js":"script.js","sql":"schema.sql","python":"main.py","bash":"install.sh","json":"config.json"}
        for i,m in enumerate(re.finditer(r'```(\w+)\n(.*?)```', text, re.DOTALL)):
            if i>=20: break
            files[em.get(m.group(1),f"file_{i+1}.{m.group(1)}")] = m.group(2).strip()
    return files

def _make_zip(name: str, files: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf,"w",zipfile.ZIP_DEFLATED) as zf:
        for fn,fc in files.items():
            safe = fn.lstrip("/").replace("..","").replace("\\","/")
            zf.writestr(f"{name}/{safe}", fc)
        readme = f"# {name}\n\nCODEGA AI tarafından oluşturuldu.\n\n" + "\n".join(f"- `{f}`" for f in files)
        zf.writestr(f"{name}/README.md", readme)
    return buf.getvalue()

class PackReq(BaseModel):
    text: str; project_name: str = "project"

@router.post("/pack")
async def pack(req: PackReq) -> dict:
    files = _parse(req.text)
    if not files: return {"error":"Kod bloğu bulunamadı"}
    name = re.sub(r"[^a-zA-Z0-9_-]","_",req.project_name)[:30] or "project"
    data = _make_zip(name, files); zid = str(uuid.uuid4())[:8]
    _zip_store[zid] = {"data":data,"filename":f"{name}.zip","ts":time.time()}; _cleanup(_zip_store)
    return {"zip_id":zid,"filename":f"{name}.zip","file_count":len(files),"size_kb":round(len(data)/1024,1),"files":list(files.keys()),"download_url":f"/api/files/download/{zid}?filename={name}.zip"}

# ── PHP Proje Üretici ─────────────────────────────────────────────────────
class ProjectReq(BaseModel):
    description: str; project_name: str = "my_project"
    db_name: str = "project_db"; php_version: str = "8.3"

@router.post("/project")
async def generate_project(req: ProjectReq) -> dict:
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready: return {"error":"Model yüklü değil"}
    name = re.sub(r"[^a-zA-Z0-9_-]","_",req.project_name)[:30] or "project"
    prompt = f"""PHP {req.php_version}+ projesi oluştur.

Proje: {req.description}
Veritabanı: {req.db_name}

Aşağıdaki dosyaları [FILE: dosya_adı] ... [/FILE] formatında yaz:
- config.php (PDO bağlantısı, sabitler)
- index.php (ana sayfa/router)
- schema.sql (DROP TABLE IF EXISTS + CREATE TABLE + örnek veri)
- .htaccess (FrontController)
- README.md (kurulum, gereksinimler)
- İhtiyaç duyulan diğer dosyalar

PHP 8.3 özelliklerini kullan. Gerçek çalışan kod yaz, placeholder koyma.
Her dosyayı MUTLAKA [FILE: ad.php] ile başlat [/FILE] ile bitir."""
    msgs = [
        {"role":"system","content":"Sen bir kıdemli PHP geliştiricisisin. Tam çalışan projeler üretirsin."},
        {"role":"user","content":prompt}
    ]
    full = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=2048, temperature=0.2)):
        full += tok
    files = _parse(full)
    if not files: return {"error":"Proje üretilemedi","raw":full[:500]}
    data = _make_zip(name, files); zid = str(uuid.uuid4())[:8]
    _zip_store[zid] = {"data":data,"filename":f"{name}.zip","ts":time.time()}; _cleanup(_zip_store)
    sql = next((v for k,v in files.items() if k.endswith(".sql")), "")
    return {"zip_id":zid,"filename":f"{name}.zip","file_count":len(files),"size_kb":round(len(data)/1024,1),"files":list(files.keys()),"has_sql":bool(sql),"download_url":f"/api/files/download/{zid}?filename={name}.zip"}

# ── İndirme ───────────────────────────────────────────────────────────────
@router.get("/download/{zid}")
async def download(zid: str, filename: str = "project.zip"):
    e = _zip_store.get(zid)
    if not e: return JSONResponse({"error":"ZIP bulunamadı"},404)
    return StreamingResponse(io.BytesIO(e["data"]),media_type="application/zip",
        headers={"Content-Disposition":f'attachment; filename="{filename}"',"Content-Length":str(len(e["data"]))})

# ── GitHub Push ───────────────────────────────────────────────────────────
class GithubReq(BaseModel):
    repo: str; token: str; files: dict
    message: str = "CODEGA AI ile güncellendi"; branch: str = "main"

@router.post("/github/push")
async def github_push(req: GithubReq) -> dict:
    import httpx
    hdrs = {"Authorization":f"token {req.token}","Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}
    base = f"https://api.github.com/repos/{req.repo}/contents"
    pushed=[]; errors=[]
    async with httpx.AsyncClient(timeout=30.0) as client:
        for path, content in req.files.items():
            safe = path.lstrip("/").replace("\\","/")
            url = f"{base}/{safe}"
            sha = None
            try:
                r = await client.get(url, headers=hdrs)
                if r.status_code == 200: sha = r.json().get("sha")
            except: pass
            body = {"message":req.message,"content":base64.b64encode(content.encode()).decode(),"branch":req.branch}
            if sha: body["sha"] = sha
            try:
                r = await client.put(url, headers=hdrs, json=body)
                if r.status_code in (200,201): pushed.append(safe)
                else: errors.append(f"{safe}: {r.status_code}")
            except Exception as e: errors.append(f"{safe}: {e}")
    log.info("GitHub: %d push, %d hata — %s", len(pushed), len(errors), req.repo)
    return {"ok":not errors,"repo":req.repo,"pushed":pushed,"errors":errors,"message":f"{len(pushed)} dosya push edildi"}

@router.get("/github/repos")
async def list_repos(token: str) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get("https://api.github.com/user/repos?per_page=50&sort=updated",
            headers={"Authorization":f"token {token}","Accept":"application/vnd.github+json"})
        if r.status_code != 200: return {"error":f"GitHub {r.status_code}"}
        return {"repos":[{"name":x["full_name"],"private":x["private"]} for x in r.json()]}
