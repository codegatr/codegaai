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

def create_php_project_zip(description: str,
                           project_name: str = "arac_kiralama",
                           db_name: str = "arac_kiralama_db",
                           php_version: str = "8.3") -> dict:
    """Create a complete PHP project ZIP without waiting for the LLM."""
    name = re.sub(r"[^a-zA-Z0-9_-]", "_", project_name)[:30] or "project"
    db = re.sub(r"[^a-zA-Z0-9_]", "_", db_name)[:40] or "project_db"
    title = "Online Arac Kiralama Sistemi"
    files = {
        "config.php": f"""<?php
declare(strict_types=1);

const DB_HOST = 'localhost';
const DB_NAME = '{db}';
const DB_USER = 'root';
const DB_PASS = '';
const APP_NAME = '{title}';

function db(): PDO
{{
    static $pdo = null;
    if ($pdo instanceof PDO) {{
        return $pdo;
    }}

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}}

function e(string $value): string
{{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}}
""",
        "index.php": """<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

$pdo = db();
$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $vehicleId = (int)($_POST['vehicle_id'] ?? 0);
    $customerName = trim((string)($_POST['customer_name'] ?? ''));
    $email = trim((string)($_POST['email'] ?? ''));
    $phone = trim((string)($_POST['phone'] ?? ''));
    $startDate = (string)($_POST['start_date'] ?? '');
    $endDate = (string)($_POST['end_date'] ?? '');

    if ($vehicleId && $customerName && filter_var($email, FILTER_VALIDATE_EMAIL) && $startDate && $endDate && $endDate >= $startDate) {
        $stmt = $pdo->prepare('INSERT INTO reservations (vehicle_id, customer_name, email, phone, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$vehicleId, $customerName, $email, $phone, $startDate, $endDate, 'pending']);
        $message = 'Rezervasyon talebiniz alindi. Ekibimiz kisa surede sizinle iletisime gececek.';
    } else {
        $message = 'Lutfen tum alanlari dogru doldurun.';
    }
}

$vehicles = $pdo->query('SELECT * FROM vehicles WHERE is_active = 1 ORDER BY daily_price ASC')->fetchAll();
?>
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= e(APP_NAME) ?></title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header class="hero">
    <nav>
      <strong><?= e(APP_NAME) ?></strong>
      <a href="#cars">Araclar</a>
      <a href="#reserve">Rezervasyon</a>
      <a href="admin.php">Yonetim</a>
    </nav>
    <section>
      <p class="eyebrow">PHP 8.3 + MySQL</p>
      <h1>Hizli, guvenilir ve online arac kiralama</h1>
      <p>Musait araclari inceleyin, tarih secin ve rezervasyon talebinizi saniyeler icinde gonderin.</p>
      <a class="button" href="#reserve">Hemen Kirala</a>
    </section>
  </header>

  <main>
    <?php if ($message): ?><div class="notice"><?= e($message) ?></div><?php endif; ?>

    <section id="cars" class="grid">
      <?php foreach ($vehicles as $car): ?>
        <article class="card">
          <span><?= e($car['category']) ?></span>
          <h2><?= e($car['brand'] . ' ' . $car['model']) ?></h2>
          <p><?= e($car['fuel_type']) ?> · <?= e($car['transmission']) ?> · <?= (int)$car['seats'] ?> koltuk</p>
          <strong><?= number_format((float)$car['daily_price'], 2, ',', '.') ?> TL / gun</strong>
        </article>
      <?php endforeach; ?>
    </section>

    <section id="reserve" class="panel">
      <h2>Online Kiralama Talebi</h2>
      <form method="post">
        <label>Arac
          <select name="vehicle_id" required>
            <option value="">Arac secin</option>
            <?php foreach ($vehicles as $car): ?>
              <option value="<?= (int)$car['id'] ?>"><?= e($car['brand'] . ' ' . $car['model']) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
        <label>Ad Soyad <input name="customer_name" required></label>
        <label>E-posta <input type="email" name="email" required></label>
        <label>Telefon <input name="phone" required></label>
        <label>Baslangic <input type="date" name="start_date" required></label>
        <label>Bitis <input type="date" name="end_date" required></label>
        <button type="submit">Rezervasyon Gonder</button>
      </form>
    </section>
  </main>
</body>
</html>
""",
        "admin.php": """<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

$reservations = db()->query('SELECT r.*, v.brand, v.model FROM reservations r JOIN vehicles v ON v.id = r.vehicle_id ORDER BY r.created_at DESC')->fetchAll();
?>
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rezervasyon Yonetimi</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <main class="admin">
    <a href="index.php">← Siteye don</a>
    <h1>Rezervasyonlar</h1>
    <table>
      <thead><tr><th>Musteri</th><th>Arac</th><th>Tarih</th><th>Durum</th><th>Iletisim</th></tr></thead>
      <tbody>
        <?php foreach ($reservations as $r): ?>
          <tr>
            <td><?= e($r['customer_name']) ?></td>
            <td><?= e($r['brand'] . ' ' . $r['model']) ?></td>
            <td><?= e($r['start_date'] . ' - ' . $r['end_date']) ?></td>
            <td><?= e($r['status']) ?></td>
            <td><?= e($r['email'] . ' / ' . $r['phone']) ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </main>
</body>
</html>
""",
        "schema.sql": f"""DROP DATABASE IF EXISTS `{db}`;
CREATE DATABASE `{db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `{db}`;

CREATE TABLE vehicles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(80) NOT NULL,
  model VARCHAR(80) NOT NULL,
  category VARCHAR(80) NOT NULL,
  fuel_type VARCHAR(40) NOT NULL,
  transmission VARCHAR(40) NOT NULL,
  seats TINYINT UNSIGNED NOT NULL DEFAULT 5,
  daily_price DECIMAL(10,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reservations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_id INT UNSIGNED NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('pending','approved','cancelled','completed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservations_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

INSERT INTO vehicles (brand, model, category, fuel_type, transmission, seats, daily_price) VALUES
('Renault', 'Clio', 'Ekonomik', 'Benzin', 'Manuel', 5, 1250.00),
('Fiat', 'Egea', 'Konfor', 'Dizel', 'Otomatik', 5, 1550.00),
('Toyota', 'Corolla', 'Sedan', 'Hibrit', 'Otomatik', 5, 2100.00),
('Volkswagen', 'Transporter', 'Minibus', 'Dizel', 'Manuel', 8, 3200.00);
""",
        "assets/style.css": """:root{color-scheme:dark;--bg:#0b0f14;--panel:#121820;--text:#eef4ff;--muted:#93a4b8;--accent:#f5a400;--line:#253040}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,Segoe UI,Arial,sans-serif}a{color:inherit}
.hero{min-height:58vh;padding:28px 6vw;background:linear-gradient(120deg,#101722,#172231 55%,#2b210f)}
nav{display:flex;gap:24px;align-items:center}nav strong{margin-right:auto;font-size:20px}nav a{text-decoration:none;color:var(--muted)}
.hero section{max-width:760px;margin-top:90px}.eyebrow{color:var(--accent);font-weight:700;letter-spacing:.08em;text-transform:uppercase}
h1{font-size:clamp(36px,6vw,72px);line-height:1;margin:0 0 18px}p{color:var(--muted);line-height:1.7}.button,button{border:0;border-radius:8px;background:var(--accent);color:#111;padding:14px 20px;font-weight:800;text-decoration:none;cursor:pointer}
main{padding:36px 6vw}.notice{padding:16px 18px;border:1px solid #2f6f53;background:#0f2a22;border-radius:8px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card,.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:22px}.card span{color:var(--accent);font-size:12px;font-weight:800;text-transform:uppercase}.card strong{display:block;margin-top:18px;font-size:20px}
.panel{max-width:920px;margin:34px auto}form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}label{display:grid;gap:8px;color:var(--muted)}input,select{width:100%;background:#0d1218;border:1px solid var(--line);border-radius:8px;color:var(--text);padding:13px}button{grid-column:1/-1}
.admin{max-width:1100px;margin:auto}table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line)}th,td{text-align:left;padding:14px;border-bottom:1px solid var(--line)}th{color:var(--accent)}
@media(max-width:720px){nav{flex-wrap:wrap}.hero section{margin-top:48px}form{grid-template-columns:1fr}}
""",
        ".htaccess": """RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.php [L]
""",
        "README.md": f"""# {title}

PHP {php_version}+ ve MySQL/MariaDB destekli online arac kiralama sistemi.

## Kurulum
1. Dosyalari web sunucusuna yukleyin.
2. `schema.sql` dosyasini MySQL/MariaDB icine aktararak `{db}` veritabanini olusturun.
3. `config.php` icindeki DB kullanici/parola bilgilerini duzenleyin.
4. `index.php` uzerinden siteyi, `admin.php` uzerinden rezervasyonlari acin.

## Icerik
- Arac listeleme
- Online rezervasyon formu
- PDO ile guvenli veritabani baglantisi
- Rezervasyon yonetim ekrani
- Ornek arac verileri

## Talep
{description}
""",
    }
    data = _make_zip(name, files)
    zid = str(uuid.uuid4())[:8]
    _zip_store[zid] = {"data": data, "filename": f"{name}.zip", "ts": time.time()}
    _cleanup(_zip_store)
    return {
        "zip_id": zid,
        "filename": f"{name}.zip",
        "file_count": len(files),
        "size_kb": round(len(data) / 1024, 1),
        "files": list(files.keys()),
        "has_sql": True,
        "download_url": f"/api/files/download/{zid}?filename={name}.zip",
    }

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
    if re.search(r"(arac|ara.|kiralama|rent a car|rentacar)", req.description, re.IGNORECASE):
        return create_php_project_zip(
            req.description,
            project_name=req.project_name,
            db_name=req.db_name,
            php_version=req.php_version,
        )
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


# ── GitHub PR Oluşturma ────────────────────────────────────────────────────

class PRRequest(BaseModel):
    repo: str
    token: str
    title: str
    body: str = ""
    head_branch: str = "codega-ai-patch"
    base_branch: str = "main"
    files: dict = {}   # Değiştirilecek dosyalar {path: content}

@router.post("/github/pr")
async def create_pr(req: PRRequest) -> dict:
    """Yeni branch aç, dosyaları push et, PR oluştur."""
    import httpx, base64, re
    hdrs = {"Authorization": f"token {req.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"}
    api = f"https://api.github.com/repos/{req.repo}"

    async with httpx.AsyncClient(timeout=30.0) as c:
        # Ana branch SHA al
        r = await c.get(f"{api}/git/ref/heads/{req.base_branch}", headers=hdrs)
        if r.status_code != 200:
            return {"error": f"Base branch bulunamadı: {r.status_code}"}
        base_sha = r.json()["object"]["sha"]

        # Yeni branch oluştur
        branch = re.sub(r"[^a-zA-Z0-9_-]", "-", req.head_branch)[:50]
        await c.post(f"{api}/git/refs", headers=hdrs,
                     json={"ref": f"refs/heads/{branch}", "sha": base_sha})

        # Dosyaları push et
        for path, content in req.files.items():
            safe = path.lstrip("/").replace("\\", "/")
            url = f"{api}/contents/{safe}"
            sha = None
            try:
                ex = await c.get(url + f"?ref={branch}", headers=hdrs)
                if ex.status_code == 200:
                    sha = ex.json().get("sha")
            except Exception:
                pass
            body: dict = {"message": f"CODEGA AI: {req.title}",
                          "content": base64.b64encode(content.encode()).decode(),
                          "branch": branch}
            if sha:
                body["sha"] = sha
            await c.put(url, headers=hdrs, json=body)

        # PR oluştur
        r = await c.post(f"{api}/pulls", headers=hdrs, json={
            "title": req.title, "body": req.body or "CODEGA AI tarafından oluşturuldu.",
            "head": branch, "base": req.base_branch,
        })
        if r.status_code in (200, 201):
            pr = r.json()
            return {"ok": True, "pr_url": pr["html_url"], "number": pr["number"],
                    "title": pr["title"]}
        return {"error": f"PR oluşturulamadı: {r.status_code} {r.text[:200]}"}


# ── Otomatik Test Yazma ───────────────────────────────────────────────────

class TestGenRequest(BaseModel):
    code: str
    language: str = "php"   # php, python, js
    project_name: str = "test"

@router.post("/generate/tests")
async def generate_tests(req: TestGenRequest) -> dict:
    """Verilen koda otomatik test dosyası yaz."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    lang_guides = {
        "php": "PHPUnit ile test_* metodları, setUp, tearDown. PHP 8.3.",
        "python": "pytest ile test_ fonksiyonları. mock, fixtures.",
        "js": "Jest ile describe/it blokları. expect matchers.",
    }
    guide = lang_guides.get(req.language, lang_guides["php"])

    prompt = f"""Bu {req.language.upper()} kodunu incele ve kapsamlı test dosyası yaz:

```{req.language}
{req.code[:3000]}
```

Test çerçevesi: {guide}

[FILE: test_{req.project_name}.{req.language}]
{{% test kodu buraya %}}
[/FILE]

Tüm public metotları test et. Edge case'leri kapsayanlara özellikle dikkat et."""

    msgs = [{"role": "system", "content": "Sen bir test uzmanısın. Kapsamlı, çalışan testler yazarsın."},
            {"role": "user", "content": prompt}]

    full = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=1500, temperature=0.2)):
        full += tok

    files = _parse(full)
    if not files:
        # Direkt cevabı test dosyası olarak al
        files = {f"test_{req.project_name}.{req.language}": full}

    data = _make_zip(f"tests_{req.project_name}", files)
    zid = str(uuid.uuid4())[:8]
    _zip_store[zid] = {"data": data, "filename": f"tests_{req.project_name}.zip", "ts": time.time()}
    _cleanup(_zip_store)
    return {"zip_id": zid, "files": list(files.keys()),
            "download_url": f"/api/files/download/{zid}",
            "test_code": list(files.values())[0][:2000]}


# ── PDF Okuma ─────────────────────────────────────────────────────────────

@router.post("/read-pdf")
async def read_pdf(file: UploadFile = File(...)) -> dict:
    """PDF dosyasını oku, metin çıkar, AI bağlamı hazırla."""
    content = await file.read()
    fname = file.filename or "file.pdf"
    text_pages = []

    # PyMuPDF (fitz) dene
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=content, filetype="pdf")
        for i, page in enumerate(doc):
            t = page.get_text().strip()
            if t:
                text_pages.append(f"[Sayfa {i+1}]\n{t}")
        doc.close()
    except ImportError:
        # pdfplumber dene
        try:
            import pdfplumber, io as _io
            with pdfplumber.open(_io.BytesIO(content)) as pdf:
                for i, page in enumerate(pdf.pages):
                    t = page.extract_text() or ""
                    if t.strip():
                        text_pages.append(f"[Sayfa {i+1}]\n{t}")
        except ImportError:
            return {"error": "PDF okuma için 'pip install pymupdf' veya 'pip install pdfplumber' gerekli"}

    if not text_pages:
        return {"error": "PDF'den metin çıkarılamadı (taranmış görüntü olabilir)"}

    full_text = "\n\n".join(text_pages)
    fid = str(uuid.uuid4())[:8]
    context = f"PDF: **{fname}** ({len(text_pages)} sayfa)\n\n{full_text[:15000]}"
    _file_store[fid] = {"filename": fname, "context": context, "ts": time.time()}
    _cleanup(_file_store)

    return {"file_id": fid, "filename": fname, "pages": len(text_pages),
            "chars": len(full_text), "context": context[:3000] + "..."}
