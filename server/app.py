"""BozorPOS server: har do'kon uchun alohida SQLite fayl + markaziy baza.

Ma'lumot "hujjatlar" (collection/id/json) ko'rinishida saqlanadi. Mijoz o'zgargan hujjatlarni
yuboradi va rev raqami bo'yicha boshqalarning o'zgarishini oladi (telefon, oshxona, kassa sinxroni).
"""
import hashlib, hmac, json, os, secrets, sqlite3, threading, time, urllib.parse, urllib.request
import printfmt
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

DATA_DIR = Path(os.environ.get("BPOS_DATA", Path(__file__).parent / "data"))
ROOT = Path(__file__).resolve().parent.parent
SESSION_TTL = 60 * 60 * 24 * 14
# Paketda faqat bitta ilova bo'lsa (alohida dokon yoki choyxona), server ham faqat shu turni qabul qiladi
APPS = [n for n in ("dokon", "choyxona") if (ROOT / n).exists()]
TYPE_OF = {"dokon": "dokon", "choyxona": "restoran"}
ALLOWED_TYPES = {TYPE_OF[n] for n in APPS} or {"dokon", "restoran"}
lock = threading.Lock()

# Kim qaysi to'plamga yoza oladi
WRITE = {
    "owner": "*",
    "manager": {"products", "receipts", "sales", "customers", "debts", "suppliers", "audit", "counts", "meta", "shifts"},
    "cashier": {"sales", "orders", "customers", "debts", "shifts", "audit", "meta", "reservations", "ingredients", "products"},
    "waiter": {"orders", "reservations", "audit", "products"},
    "chef": {"orders", "audit", "products"},
    "agent": set(),
}

# Mahsulotni to'liq tahrirlay olmaydigan rollar faqat shu maydonlarni o'zgartira oladi
PORTION = {"portions", "stop", "stopAuto"}
PRODUCT_FREE = {
    "cashier": PORTION | {"stock", "batches"},
    "waiter": PORTION,
    "chef": PORTION,
}

def can_write(role: str, coll: str) -> bool:
    w = WRITE.get(role, set())
    return w == "*" or coll in w

def app_data_dir() -> Path:
    (DATA_DIR / "stores").mkdir(parents=True, exist_ok=True)
    return DATA_DIR

@contextmanager
def central():
    c = sqlite3.connect(app_data_dir() / "central.db"); c.row_factory = sqlite3.Row
    c.executescript("""
    CREATE TABLE IF NOT EXISTS stores(id TEXT PRIMARY KEY,name TEXT,type TEXT,address TEXT,status TEXT,created REAL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,login TEXT UNIQUE,name TEXT,role TEXT,store_id TEXT,salt TEXT,hash TEXT);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires REAL);
    CREATE TABLE IF NOT EXISTS secrets(store_id TEXT,k TEXT,v TEXT,PRIMARY KEY(store_id,k));
    """)
    try:
        yield c; c.commit()
    finally:
        c.close()

@contextmanager
def store_db(store_id: str):
    if not store_id.replace("_", "").isalnum():
        raise HTTPException(400, "noto'g'ri do'kon")
    c = sqlite3.connect(app_data_dir() / "stores" / f"{store_id}.db"); c.row_factory = sqlite3.Row
    c.executescript("""
    CREATE TABLE IF NOT EXISTS docs(coll TEXT,id TEXT,data TEXT,rev INTEGER,deleted INTEGER DEFAULT 0,by TEXT,PRIMARY KEY(coll,id));
    CREATE INDEX IF NOT EXISTS docs_rev ON docs(rev);
    CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v INTEGER);
    INSERT OR IGNORE INTO meta VALUES('rev',0);
    CREATE TABLE IF NOT EXISTS print_jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT,width INTEGER,copies INTEGER,text TEXT,status TEXT,attempts INTEGER DEFAULT 0,err TEXT,ts REAL);
    """)
    try:
        yield c; c.commit()
    finally:
        c.close()

def hash_pw(pw: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 120_000).hex()

def new_user(c, login, name, role, store_id, pw, uid=None):
    salt = secrets.token_hex(16)
    c.execute("INSERT INTO users VALUES(?,?,?,?,?,?,?)", (uid or "u_" + secrets.token_hex(5), login.lower().strip(), name, role, store_id, salt, hash_pw(pw, salt)))

app = FastAPI(title="BozorPOS API")

class Login(BaseModel):
    login: str
    password: str

class Auth:
    def __init__(self, user, store):
        self.user, self.store = user, store

def user_dict(u):
    return {"id": u["id"], "login": u["login"], "name": u["name"], "role": u["role"], "storeId": u["store_id"]}

def current(authorization: Optional[str] = Header(None)) -> Auth:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "kirish kerak")
    tok = authorization[7:]
    with central() as c:
        s = c.execute("SELECT * FROM sessions WHERE token=? AND expires>?", (tok, time.time())).fetchone()
        if not s: raise HTTPException(401, "sessiya tugagan")
        u = c.execute("SELECT * FROM users WHERE id=?", (s["user_id"],)).fetchone()
        if not u: raise HTTPException(401, "foydalanuvchi yo'q")
        st = c.execute("SELECT * FROM stores WHERE id=?", (u["store_id"],)).fetchone() if u["store_id"] else None
        if st and st["status"] == "blocked": raise HTTPException(403, "do'kon bloklangan")
        return Auth(dict(u), dict(st) if st else None)

def need_store(a: Auth = Depends(current)) -> Auth:
    if not a.store: raise HTTPException(403, "do'kon kerak")
    return a

def need_super(a: Auth = Depends(current)) -> Auth:
    if a.user["role"] != "super": raise HTTPException(403, "faqat super-admin")
    return a

def need_owner(a: Auth = Depends(need_store)) -> Auth:
    if a.user["role"] != "owner": raise HTTPException(403, "faqat ega/admin")
    return a

@app.get("/api/health")
def health(): return {"ok": True}

@app.post("/api/login")
def login(b: Login):
    with central() as c:
        u = c.execute("SELECT * FROM users WHERE login=?", (b.login.lower().strip(),)).fetchone()
        if not u or not hmac.compare_digest(u["hash"], hash_pw(b.password, u["salt"])):
            time.sleep(0.4); raise HTTPException(401, "Login yoki parol noto'g'ri")
        st = c.execute("SELECT * FROM stores WHERE id=?", (u["store_id"],)).fetchone() if u["store_id"] else None
        if st and st["status"] == "blocked": raise HTTPException(403, "Bu do'kon bloklangan")
        tok = secrets.token_urlsafe(32)
        c.execute("DELETE FROM sessions WHERE expires<?", (time.time(),))
        c.execute("INSERT INTO sessions VALUES(?,?,?)", (tok, u["id"], time.time() + SESSION_TTL))
        return {"token": tok, "user": user_dict(u), "store": dict(st) if st else None}

@app.post("/api/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization:
        with central() as c: c.execute("DELETE FROM sessions WHERE token=?", (authorization[7:],))
    return {"ok": True}

@app.get("/api/me")
def me(a: Auth = Depends(current)):
    return {"user": user_dict(a.user), "store": a.store}

# ---------- sinxronizatsiya ----------
class Doc(BaseModel):
    c: str
    id: str
    data: Optional[Any] = None   # None => o'chirish

class Push(BaseModel):
    docs: list[Doc]

@app.get("/api/sync")
def sync(since: int = 0, a: Auth = Depends(need_store)):
    if a.user["role"] == "agent": raise HTTPException(403, "print-agent ma'lumotni o'qiy olmaydi")
    with store_db(a.store["id"]) as c:
        rev = c.execute("SELECT v FROM meta WHERE k='rev'").fetchone()[0]
        rows = c.execute("SELECT coll,id,data,rev,deleted FROM docs WHERE rev>? ORDER BY rev", (since,)).fetchall()
        return {"rev": rev, "docs": [{"c": r["coll"], "id": r["id"], "data": None if r["deleted"] else json.loads(r["data"]), "rev": r["rev"]} for r in rows]}

@app.post("/api/push")
def push(b: Push, a: Auth = Depends(need_store)):
    role = a.user["role"]
    for d in b.docs:
        if not can_write(role, d.c):
            raise HTTPException(403, f"'{role}' roli '{d.c}' ni o'zgartira olmaydi")
    if role in PRODUCT_FREE:
        # Bu rollar mahsulotda faqat ruxsat etilgan maydonlarni (qoldiq, porsiya, stop-list) o'zgartira oladi.
        # Oshpaz qo'shimcha ravishda yangi taom qo'sha oladi (narxni ega belgilaydi).
        free = PRODUCT_FREE[role]
        with store_db(a.store["id"]) as c:
            for d in b.docs:
                if d.c != "products": continue
                row = c.execute("SELECT data FROM docs WHERE coll='products' AND id=? AND deleted=0", (d.id,)).fetchone()
                old = json.loads(row["data"]) if row else None
                new = d.data
                if old is None and new is not None and role == "chef" and isinstance(new, dict) and new.get("menu"):
                    continue
                if old is None or new is None: raise HTTPException(403, f"'{role}' mahsulot qo'sha/o'chira olmaydi")
                strip = lambda x: {k: v for k, v in x.items() if k not in free}
                if strip(old) != strip(new): raise HTTPException(403, f"'{role}' mahsulot narxi yoki nomini o'zgartira olmaydi")
    with lock, store_db(a.store["id"]) as c:
        rev = c.execute("SELECT v FROM meta WHERE k='rev'").fetchone()[0]
        assigned = []
        for d in b.docs:
            rev += 1
            if d.c in ("sales", "orders") and d.data is not None and isinstance(d.data, dict):
                ex = c.execute("SELECT 1 FROM docs WHERE coll=? AND id=? AND deleted=0", (d.c, d.id)).fetchone()
                if not ex:  # yangi chek/buyurtma raqamini server beradi, qurilmalar to'qnashmaydi
                    k = f"ctr_{d.c}"
                    c.execute("INSERT OR IGNORE INTO meta VALUES(?,0)", (k,))
                    c.execute("UPDATE meta SET v=v+1 WHERE k=?", (k,))
                    d.data["no"] = c.execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()[0]
                    assigned.append({"c": d.c, "id": d.id, "no": d.data["no"]})
            if d.data is None:
                c.execute("INSERT INTO docs VALUES(?,?,?,?,1,?) ON CONFLICT(coll,id) DO UPDATE SET data='null',rev=?,deleted=1,by=?", (d.c, d.id, "null", rev, a.user["id"], rev, a.user["id"]))
            else:
                j = json.dumps(d.data, ensure_ascii=False)
                c.execute("INSERT INTO docs VALUES(?,?,?,?,0,?) ON CONFLICT(coll,id) DO UPDATE SET data=?,rev=?,deleted=0,by=?", (d.c, d.id, j, rev, a.user["id"], j, rev, a.user["id"]))
        c.execute("UPDATE meta SET v=? WHERE k='rev'", (rev,))
        return {"rev": rev, "assigned": assigned}

@app.post("/api/counter/{name}")
def counter(name: str, a: Auth = Depends(need_store)):
    """Chek/buyurtma raqami: server beradi, qurilmalar to'qnashmaydi."""
    with lock, store_db(a.store["id"]) as c:
        k = f"ctr_{name}"
        c.execute("INSERT OR IGNORE INTO meta VALUES(?,0)", (k,))
        c.execute("UPDATE meta SET v=v+1 WHERE k=?", (k,))
        return {"n": c.execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()[0]}

# ---------- xodimlar (ega) ----------
class NewUser(BaseModel):
    login: str
    name: str
    role: str
    password: str

@app.get("/api/users")
def users(a: Auth = Depends(need_owner)):
    with central() as c:
        return [user_dict(u) for u in c.execute("SELECT * FROM users WHERE store_id=?", (a.store["id"],))]

@app.post("/api/users")
def add_user(b: NewUser, a: Auth = Depends(need_owner)):
    allowed = {"manager", "cashier"} if a.store["type"] == "dokon" else {"cashier", "waiter", "chef", "agent"}
    if b.role not in allowed: raise HTTPException(400, "bunday lavozim yo'q")
    if len(b.password) < 6: raise HTTPException(400, "Parol kamida 6 belgi")
    with central() as c:
        if c.execute("SELECT 1 FROM users WHERE login=?", (b.login.lower().strip(),)).fetchone(): raise HTTPException(409, "Bu login band")
        new_user(c, b.login, b.name, b.role, a.store["id"], b.password)
    return {"ok": True}

@app.delete("/api/users/{uid}")
def del_user(uid: str, a: Auth = Depends(need_owner)):
    if uid == a.user["id"]: raise HTTPException(400, "o'zingizni o'chira olmaysiz")
    with central() as c:
        c.execute("DELETE FROM users WHERE id=? AND store_id=? AND role!='owner'", (uid, a.store["id"]))
    return {"ok": True}

# ---------- do'konlar (super-admin) ----------
class NewStore(BaseModel):
    name: str
    type: str = "dokon"
    address: str = ""
    owner_name: str
    login: str
    password: str

@app.get("/api/stores")
def stores(a: Auth = Depends(need_super)):
    with central() as c:
        out = []
        for s in c.execute("SELECT * FROM stores ORDER BY created"):
            o = c.execute("SELECT * FROM users WHERE store_id=? AND role='owner'", (s["id"],)).fetchone()
            f = app_data_dir() / "stores" / f"{s['id']}.db"
            out.append({**dict(s), "owner": user_dict(o) if o else None, "bytes": f.stat().st_size if f.exists() else 0})
        return out

@app.post("/api/stores")
def add_store(b: NewStore, a: Auth = Depends(need_super)):
    if b.type not in ALLOWED_TYPES: raise HTTPException(400, "bu o'rnatishda bunday tur yo'q")
    if len(b.password) < 6: raise HTTPException(400, "Parol kamida 6 belgi")
    sid = "st_" + secrets.token_hex(4)
    with central() as c:
        if c.execute("SELECT 1 FROM users WHERE login=?", (b.login.lower().strip(),)).fetchone(): raise HTTPException(409, "Bu login band")
        c.execute("INSERT INTO stores VALUES(?,?,?,?,?,?)", (sid, b.name, b.type, b.address, "active", time.time()))
        new_user(c, b.login, b.owner_name, "owner", sid, b.password)
    with store_db(sid): pass
    return {"id": sid}

class Status(BaseModel):
    status: str

class Rename(BaseModel):
    name: str

@app.put("/api/store")
def rename_store(b: Rename, a: Auth = Depends(need_owner)):
    if not b.name.strip(): raise HTTPException(400, "nom kerak")
    with central() as c: c.execute("UPDATE stores SET name=? WHERE id=?", (b.name.strip(), a.store["id"]))
    return {"ok": True}

@app.patch("/api/stores/{sid}")
def set_status(sid: str, b: Status, a: Auth = Depends(need_super)):
    if b.status not in ("active", "blocked"): raise HTTPException(400, "holat noto'g'ri")
    with central() as c: c.execute("UPDATE stores SET status=? WHERE id=?", (b.status, sid))
    return {"ok": True}

# ---------- Printer navbati (Windows print-agent shu navbatdan oladi) ----------
class PrintJob(BaseModel):
    kind: str            # kitchen | receipt
    width: int = 80      # 58 yoki 80 mm
    copies: int = 1
    payload: dict

class PrintDone(BaseModel):
    ids: list[int] = []
    errors: dict[str, str] = {}

def need_agent(a: Auth = Depends(need_store)) -> Auth:
    if a.user["role"] not in ("agent", "owner"): raise HTTPException(403, "faqat print-agent")
    return a

@app.post("/api/print")
def print_enqueue(b: PrintJob, a: Auth = Depends(need_store)):
    if a.user["role"] not in ("owner", "cashier", "waiter", "chef"): raise HTTPException(403, "ruxsat yo'q")
    if b.kind not in ("kitchen", "receipt"): raise HTTPException(400, "chek turi noto'g'ri")
    width = 58 if b.width < 70 else 80
    text = printfmt.render(b.kind, b.payload, width)
    with lock, store_db(a.store["id"]) as c:
        c.execute("DELETE FROM print_jobs WHERE status!='new' AND ts<?", (time.time() - 3 * 86400,))
        cur = c.execute("INSERT INTO print_jobs(kind,width,copies,text,status,ts) VALUES(?,?,?,?, 'new', ?)", (b.kind, width, max(1, min(b.copies, 5)), text, time.time()))
        return {"id": cur.lastrowid}

@app.get("/api/print/pending")
def print_pending(a: Auth = Depends(need_agent)):
    with lock, store_db(a.store["id"]) as c:
        if a.user["role"] == "agent":
            c.execute("INSERT INTO meta VALUES('agent_seen',?) ON CONFLICT(k) DO UPDATE SET v=?", (int(time.time()), int(time.time())))
        rows = c.execute("SELECT id,kind,width,copies,text FROM print_jobs WHERE status='new' ORDER BY id LIMIT 20").fetchall()
        return [dict(r) for r in rows]

@app.post("/api/print/done")
def print_done(b: PrintDone, a: Auth = Depends(need_agent)):
    with lock, store_db(a.store["id"]) as c:
        for i in b.ids:
            c.execute("UPDATE print_jobs SET status='done' WHERE id=?", (i,))
        for k, msg in b.errors.items():
            c.execute("UPDATE print_jobs SET attempts=attempts+1, err=?, status=CASE WHEN attempts+1>=3 THEN 'failed' ELSE 'new' END WHERE id=?", (msg[:200], int(k)))
    return {"ok": True}

@app.get("/api/print/status")
def print_status(a: Auth = Depends(need_store)):
    with store_db(a.store["id"]) as c:
        seen = c.execute("SELECT v FROM meta WHERE k='agent_seen'").fetchone()
        n = lambda st: c.execute("SELECT COUNT(*) FROM print_jobs WHERE status=?", (st,)).fetchone()[0]
        return {"agentSeenAgo": int(time.time() - seen[0]) if seen else None, "pending": n("new"), "failed": n("failed")}

@app.post("/api/print/retry")
def print_retry(a: Auth = Depends(need_owner)):
    with store_db(a.store["id"]) as c:
        c.execute("UPDATE print_jobs SET status='new', attempts=0 WHERE status='failed'")
    return {"ok": True}

# ---------- Telegram xabarnoma ----------
def send_telegram(token: str, chat_id: str, text: str) -> bool:
    try:
        data = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode()
        urllib.request.urlopen(urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=data), timeout=8)
        return True
    except Exception:
        return False

class Tg(BaseModel):
    token: str
    chat_id: str

class Notify(BaseModel):
    text: str

def tg_conf(store_id):
    with central() as c:
        r = {x["k"]: x["v"] for x in c.execute("SELECT k,v FROM secrets WHERE store_id=?", (store_id,))}
    return r.get("tg_token"), r.get("tg_chat")

@app.get("/api/telegram")
def tg_get(a: Auth = Depends(need_owner)):
    t, ch = tg_conf(a.store["id"]); return {"configured": bool(t and ch), "chat_id": ch or ""}

@app.put("/api/telegram")
def tg_put(b: Tg, a: Auth = Depends(need_owner)):
    with central() as c:
        for k, v in (("tg_token", b.token.strip()), ("tg_chat", b.chat_id.strip())):
            c.execute("INSERT INTO secrets VALUES(?,?,?) ON CONFLICT(store_id,k) DO UPDATE SET v=?", (a.store["id"], k, v, v))
    ok = send_telegram(b.token.strip(), b.chat_id.strip(), f"✅ {a.store['name']}: Telegram xabarnomalari ulandi")
    return {"ok": ok}

@app.post("/api/notify")
def notify(b: Notify, a: Auth = Depends(need_store)):
    t, ch = tg_conf(a.store["id"])
    if not (t and ch): return {"sent": False}
    return {"sent": send_telegram(t, ch, b.text[:3500])}

def bootstrap():
    """Birinchi ishga tushishda super-admin yaratadi (parol env orqali)."""
    with central() as c:
        if not c.execute("SELECT 1 FROM users WHERE role='super'").fetchone():
            pw = os.environ.get("BPOS_ADMIN_PASSWORD") or secrets.token_urlsafe(9)
            new_user(c, os.environ.get("BPOS_ADMIN_LOGIN", "admin"), "Tizim administratori", "super", None, pw, "u_admin")
            print(f"[BozorPOS] super-admin yaratildi: login={os.environ.get('BPOS_ADMIN_LOGIN','admin')} parol={pw}")

bootstrap()

if len(APPS) == 1:
    from fastapi.responses import RedirectResponse
    @app.get("/", include_in_schema=False)
    def root(): return RedirectResponse(f"/{APPS[0]}/")

# Ilovalar shu serverdan beriladi (CORS kerak emas)
for name in ("dokon", "choyxona", "shared"):
    d = ROOT / name
    if d.exists():
        app.mount(f"/{name}", StaticFiles(directory=d, html=True), name=name)
