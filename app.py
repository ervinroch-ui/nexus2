from __future__ import annotations
import json
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from xlsx_reader import analyze_workbook
from native_metrics import calculate_daily

BASE = Path(__file__).resolve().parent
INSTANCE = BASE / "instance"
# Set NEXUS_DB_PATH=/var/data/nexus.sqlite3 when using a Render Persistent Disk.
DB_PATH = Path(os.environ.get("NEXUS_DB_PATH", str(INSTANCE / "nexus.sqlite3"))).expanduser()
DATA_DIR = BASE / "data"
INSTANCE.mkdir(parents=True, exist_ok=True)
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY", "CAMBIAR-ESTA-CLAVE-ANTES-DE-PUBLICAR"),
    MAX_CONTENT_LENGTH=25 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "0") == "1",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 8,
)


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def load_sample_imports():
    path = DATA_DIR / "sample_imports.json"
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def seed_state():
    return {
        "period": {"label": "Noviembre 2026", "start": "2026-11-01", "end": "2026-11-22", "management": "Pacífico"},
        "overview": {
            "dailyChallenge": 234,
            "incomeCurrent": 18539,
            "incomePrevious": 19808,
            "highsCurrent": 1113,
            "highsPrevious": 1163,
            "priorYearHighs": 1068,
            "priorYearIncome": 18261,
        },
        "multimedia": {
            "monthLabel": "Noviembre 2026 · corte al 22",
            "daysElapsed": 22,
            "daysInMonth": 30,
            "real": 1490,
            "goal": 1771,
            "projection": 2032,
            "income": 24601.10,
            "effectiveness": 22.83,
            "monthIncomeChange": 6.20,
            "monthIncomeChangeValue": 1437.28,
            "yearIncomeChange": 13.63,
            "yearIncomeChangeValue": 2950.19,
            "zones": [
                {"name":"Managua-Este","goal":461,"actual":205,"projection":280,"vsM2M":18,"vsM2MPct":9.63,"vsY2Y":10,"vsY2YPct":5.13,"executives":17,"executiveRoster":20,"highsPerExecutive":16.47},
                {"name":"Managua-Oeste","goal":527,"actual":396,"projection":540,"vsM2M":-138,"vsM2MPct":-25.84,"vsY2Y":46,"vsY2YPct":13.14,"executives":21,"executiveRoster":23,"highsPerExecutive":25.71},
                {"name":"Suroriente","goal":434,"actual":512,"projection":698,"vsM2M":70,"vsM2MPct":15.84,"vsY2Y":-11,"vsY2YPct":-2.10,"executives":27,"executiveRoster":31,"highsPerExecutive":25.85},
                {"name":"Norte","goal":349,"actual":377,"projection":514,"vsM2M":181,"vsM2MPct":92.35,"vsY2Y":159,"vsY2YPct":72.94,"executives":24,"executiveRoster":22,"highsPerExecutive":21.42},
            ],
            "supervisors": [
                {"name":"MANFREDO ANTONIO RIVERA SABALLO","dth":3,"intHfc":31,"tvHfc":27,"lda":73,"ifi":0,"intGpon":46,"tvGpon":45,"total":225,"projection":293,"goalPct":90},
                {"name":"Johny Enrique Gutierrez Morales","dth":3,"intHfc":32,"tvHfc":32,"lda":68,"ifi":0,"intGpon":36,"tvGpon":34,"total":205,"projection":267,"goalPct":82},
                {"name":"Jose Felix Vega Garcia","dth":1,"intHfc":7,"tvHfc":7,"lda":50,"ifi":0,"intGpon":43,"tvGpon":42,"total":150,"projection":196,"goalPct":60},
                {"name":"URIEL ANTONIO OBANDO GOMEZ.","dth":1,"intHfc":11,"tvHfc":10,"lda":47,"ifi":0,"intGpon":39,"tvGpon":38,"total":146,"projection":190,"goalPct":58},
                {"name":"IAN ALEXANDER BETETA REYES","dth":0,"intHfc":7,"tvHfc":7,"lda":39,"ifi":0,"intGpon":31,"tvGpon":31,"total":115,"projection":150,"goalPct":46},
                {"name":"RAMON HERIBERTO GONZALEZ CAMPBELL","dth":1,"intHfc":6,"tvHfc":6,"lda":27,"ifi":0,"intGpon":21,"tvGpon":21,"total":82,"projection":107,"goalPct":33},
                {"name":"MARIELA ALEJANDRA DIAZ VALLEJOS","dth":1,"intHfc":8,"tvHfc":8,"lda":25,"ifi":0,"intGpon":16,"tvGpon":16,"total":74,"projection":97,"goalPct":30},
                {"name":"ENMANUEL IGNACIO LARIOS REYES","dth":0,"intHfc":7,"tvHfc":6,"lda":15,"ifi":0,"intGpon":10,"tvGpon":8,"total":46,"projection":60,"goalPct":18},
                {"name":"ERVIN ANTONIO ROCHA GUZMAN","dth":0,"intHfc":6,"tvHfc":6,"lda":13,"ifi":0,"intGpon":9,"tvGpon":7,"total":41,"projection":53,"goalPct":16},
                {"name":"ELYIN ALBERTO MAYORGA VEGA","dth":0,"intHfc":4,"tvHfc":4,"lda":8,"ifi":0,"intGpon":5,"tvGpon":5,"total":26,"projection":34,"goalPct":10},
                {"name":"MOISES DAVID SIRIAS RIOS","dth":0,"intHfc":0,"tvHfc":0,"lda":1,"ifi":0,"intGpon":1,"tvGpon":1,"total":3,"projection":4,"goalPct":1},
            ],
            "sourceNote": "Los KPI 1,490 / 1,771 y 2,032, así como la tabla por gerencia y supervisor, se capturaron de las imágenes de referencia. La hoja 'meta nov' del Excel define además una meta mensual de 2,000 altas y 75 plazas. Se muestran separadas para evitar mezclar bases distintas.",
        },
        "fuelRows": [
            {"plate":"M429517","manager":"Ervin Rocha","management":"Gerencia Multimedia","vehicle":"Chevrolet Microbus N400 (2025)","driver":"Ramon Heriberto Gonzalez Campbell","loads":2,"liters":69.97,"spent":3482.30,"budget":2800.00},
            {"plate":"M462688","manager":"Ervin Rocha","management":"Gerencia Multimedia","vehicle":"Microbus Toyota Liteace (2026)","driver":"Jose Felix Vega Garcia","loads":2,"liters":66.75,"spent":3192.35,"budget":2500.00},
            {"plate":"M370555","manager":"Ervin Rocha","management":"Gerencia Multimedia","vehicle":"Chevrolet Microbus N400 (2023)","driver":"Johny Enrique Gutierrez Morales","loads":3,"liters":65.59,"spent":3192.27,"budget":3000.00},
            {"plate":"M370553","manager":"Ervin Rocha","management":"Gerencia Multimedia","vehicle":"Chevrolet Microbus N400 (2023)","driver":"Manfredo Antonio Rivera Saballo","loads":2,"liters":60.85,"spent":2988.79,"budget":3000.00},
            {"plate":"M429518","manager":"Ervin Rocha","management":"Gerencia Multimedia","vehicle":"Chevrolet Microbus N400 (2025)","driver":"Ian Alexander Beteta Reyes","loads":2,"liters":61.56,"spent":2985.67,"budget":2500.00},
            {"plate":"M466236","manager":"Ervin Rocha","management":"Gerencia Multimedia","vehicle":"Suzuki Apv Furgoneta (2026)","driver":"Enmanuel Larios","loads":2,"liters":56.80,"spent":2687.10,"budget":2700.00},
            {"plate":"M467372","manager":"Ervin Rocha","management":"Gerencia Multimedia","vehicle":"Toyota Lite Ace (2026)","driver":"Uriel Antonio Obando Gomez","loads":2,"liters":52.64,"spent":2490.20,"budget":2500.00},
            {"plate":"M118219","manager":"Ervin Rocha","management":"Gerencia Multimedia","vehicle":"Motocicleta","driver":"Abel Molina","loads":1,"liters":10.20,"spent":494.46,"budget":500.00},
            {"plate":"M210090","manager":"Ervin Rocha","management":"Gerencia Multimedia","vehicle":"Motocicleta","driver":"Junior Flores","loads":2,"liters":10.45,"spent":494.46,"budget":500.00},
            {"plate":"M94138","manager":"Ervin Rocha","management":"Gerencia Multimedia","vehicle":"Motocicleta","driver":"Mariela Diaz","loads":2,"liters":10.45,"spent":494.46,"budget":500.00},
        ],
        "fuelPlan": [],
        "imports": load_sample_imports(),
    }


def init_db():
    conn = db_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS uploads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            data_type TEXT NOT NULL,
            row_count INTEGER NOT NULL,
            summary TEXT NOT NULL,
            notes TEXT NOT NULL,
            imported_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            created_at TEXT NOT NULL
        );
    """)
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        admin_user = os.environ.get("ADMIN_USER", "ervinroch").strip() or "ervinroch"
        admin_password = os.environ.get("ADMIN_PASSWORD", "2008")
        conn.execute(
            "INSERT INTO users(username,password_hash,role,active,created_at) VALUES(?,?,?,?,?)",
            (admin_user, generate_password_hash(admin_password), "admin", 1, utc_now()),
        )
    if conn.execute("SELECT COUNT(*) FROM app_state").fetchone()[0] == 0:
        state = seed_state()
        multimedia_seed = next((x for x in state.get("imports", []) if x.get("type") == "multimedia"), None)
        if multimedia_seed:
            state["fuelPlan"] = multimedia_seed.get("summary", {}).get("fuelPlan", [])
        conn.execute("INSERT INTO app_state(id,payload,updated_at) VALUES(1,?,?)", (json.dumps(state, ensure_ascii=False), utc_now()))
        for item in state.get("imports", []):
            conn.execute(
                "INSERT INTO uploads(filename,data_type,row_count,summary,notes,imported_at) VALUES(?,?,?,?,?,?)",
                (item.get("filename", "Libro de ejemplo"), item.get("type", "general"), item.get("rows", 0), json.dumps(item.get("summary", {}), ensure_ascii=False), " | ".join(item.get("notes", [])), utc_now()),
            )
    conn.commit()
    conn.close()


def get_state():
    conn = db_conn()
    row = conn.execute("SELECT payload FROM app_state WHERE id=1").fetchone()
    conn.close()
    if not row:
        return seed_state()
    try:
        return json.loads(row["payload"])
    except Exception:
        return seed_state()


def put_state(state):
    conn = db_conn()
    conn.execute("UPDATE app_state SET payload=?,updated_at=? WHERE id=1", (json.dumps(state, ensure_ascii=False), utc_now()))
    conn.commit()
    conn.close()


def audit(username, action, details=""):
    conn = db_conn()
    conn.execute("INSERT INTO audit_log(username,action,details,created_at) VALUES(?,?,?,?)", (username, action, details[:1000], utc_now()))
    conn.commit()
    conn.close()


def current_user():
    username = session.get("username")
    if not username:
        return None
    conn = db_conn()
    row = conn.execute("SELECT username,role,active FROM users WHERE username=?", (username,)).fetchone()
    conn.close()
    if not row or not row["active"]:
        session.clear()
        return None
    return {"username": row["username"], "role": row["role"]}


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return jsonify({"error": "Sesión requerida"}), 401
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "Sesión requerida"}), 401
        if user["role"] != "admin":
            return jsonify({"error": "Se requiere rol administrador"}), 403
        return fn(*args, **kwargs)
    return wrapper


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/login")
def api_login():
    body = request.get_json(silent=True) or {}
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    conn = db_conn()
    row = conn.execute("SELECT username,password_hash,role,active FROM users WHERE username=?", (username,)).fetchone()
    conn.close()
    if not row or not row["active"] or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Usuario o contraseña incorrectos"}), 401
    session.clear()
    session.permanent = True
    session["username"] = row["username"]
    audit(username, "Inicio de sesión")
    return jsonify({"user": {"username": row["username"], "role": row["role"]}})


@app.post("/api/logout")
@login_required
def api_logout():
    user = current_user()
    audit(user["username"], "Cierre de sesión")
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/state")
@login_required
def api_state():
    return jsonify({"state": get_state(), "user": current_user()})


@app.post("/api/admin/state")
@admin_required
def api_update_state():
    incoming = request.get_json(silent=True)
    if not isinstance(incoming, dict):
        return jsonify({"error": "El contenido enviado no es válido"}), 400
    state = get_state()
    allowed = {"period", "overview", "multimedia", "fuelRows", "fuelPlan", "imports"}
    for key in allowed:
        if key in incoming:
            state[key] = incoming[key]
    if not isinstance(state.get("overview"), dict) or not isinstance(state.get("multimedia"), dict):
        return jsonify({"error": "Estructura de indicadores inválida"}), 400
    if len(json.dumps(state, ensure_ascii=False)) > 3_000_000:
        return jsonify({"error": "El conjunto de datos excede el tamaño permitido"}), 413
    put_state(state)
    audit(current_user()["username"], "Edición de indicadores", "Se actualizaron indicadores y tablas de gestión")
    return jsonify({"ok": True, "state": state})


@app.post("/api/admin/upload")
@admin_required
def api_upload():
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "Seleccioná al menos un archivo .xlsx"}), 400
    state = get_state()
    imported = []
    for file in files:
        filename = (file.filename or "").strip()
        if not filename:
            continue
        if not filename.lower().endswith(".xlsx"):
            return jsonify({"error": f"{filename}: formato no admitido. Usá .xlsx"}), 400
        suffix = Path(filename).suffix
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(prefix="nexus_", suffix=suffix, dir=INSTANCE, delete=False) as tmp:
                temp_path = tmp.name
                file.save(temp_path)
            analysis = analyze_workbook(temp_path, Path(filename).name)
            analysis["sample"] = False
            analysis["importedAt"] = utc_now()
            # Keep only aggregate results. The uploaded XLSX is deleted immediately after analysis.
            imported.append(analysis)
        except Exception as exc:
            return jsonify({"error": f"No se pudo analizar {filename}: {str(exc)[:240]}"}), 400
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
    for item in imported:
        item_type = item.get("type", "general")
        state["imports"] = [old for old in state.get("imports", []) if old.get("type") != item_type]
        state["imports"].append(item)
        if item_type == "multimedia":
            state["fuelPlan"] = item.get("summary", {}).get("fuelPlan", [])
        conn = db_conn()
        conn.execute(
            "INSERT INTO uploads(filename,data_type,row_count,summary,notes,imported_at) VALUES(?,?,?,?,?,?)",
            (item.get("filename", "Archivo"), item_type, item.get("rows", 0), json.dumps(item.get("summary", {}), ensure_ascii=False), " | ".join(item.get("notes", [])), item.get("importedAt", utc_now())),
        )
        conn.commit()
        conn.close()
    put_state(state)
    audit(current_user()["username"], "Carga de Excel", ", ".join(x.get("filename", "") for x in imported))
    return jsonify({"ok": True, "imported": imported, "state": state})


@app.get("/api/admin/history")
@admin_required
def api_history():
    conn = db_conn()
    rows = conn.execute("SELECT id,filename,data_type,row_count,notes,imported_at FROM uploads ORDER BY id DESC LIMIT 60").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.get("/api/admin/users")
@admin_required
def api_users():
    conn = db_conn()
    rows = conn.execute("SELECT username,role,active,created_at FROM users ORDER BY username").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.post("/api/admin/users")
@admin_required
def api_create_user():
    body = request.get_json(silent=True) or {}
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    role = str(body.get("role", "viewer"))
    if len(username) < 3 or len(username) > 40:
        return jsonify({"error": "El usuario debe tener entre 3 y 40 caracteres"}), 400
    if len(password) < 8:
        return jsonify({"error": "Para usuarios nuevos usá una contraseña de al menos 8 caracteres"}), 400
    if role not in ("admin", "viewer"):
        return jsonify({"error": "Rol inválido"}), 400
    conn = db_conn()
    try:
        conn.execute("INSERT INTO users(username,password_hash,role,active,created_at) VALUES(?,?,?,?,?)", (username, generate_password_hash(password), role, 1, utc_now()))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Ese usuario ya existe"}), 409
    conn.close()
    audit(current_user()["username"], "Creación de usuario", f"{username} ({role})")
    return jsonify({"ok": True})


@app.patch("/api/admin/users/<username>")
@admin_required
def api_update_user(username):
    body = request.get_json(silent=True) or {}
    role = body.get("role")
    active = body.get("active")
    if role is not None and role not in ("admin", "viewer"):
        return jsonify({"error": "Rol inválido"}), 400
    if active is not None and not isinstance(active, bool):
        return jsonify({"error": "Estado inválido"}), 400
    actor = current_user()["username"]
    if username == actor and active is False:
        return jsonify({"error": "No podés desactivar tu propia cuenta"}), 400
    conn = db_conn()
    row = conn.execute("SELECT username FROM users WHERE username=?", (username,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Usuario no encontrado"}), 404
    if role is not None:
        conn.execute("UPDATE users SET role=? WHERE username=?", (role, username))
    if active is not None:
        conn.execute("UPDATE users SET active=? WHERE username=?", (1 if active else 0, username))
    conn.commit()
    conn.close()
    audit(actor, "Actualización de permisos", f"{username}: role={role}, active={active}")
    return jsonify({"ok": True})


@app.post("/api/admin/change-password")
@login_required
def api_change_password():
    body = request.get_json(silent=True) or {}
    old = str(body.get("oldPassword", ""))
    new = str(body.get("newPassword", ""))
    if len(new) < 8:
        return jsonify({"error": "La nueva contraseña debe tener al menos 8 caracteres"}), 400
    user = current_user()
    conn = db_conn()
    row = conn.execute("SELECT password_hash FROM users WHERE username=?", (user["username"],)).fetchone()
    if not row or not check_password_hash(row["password_hash"], old):
        conn.close()
        return jsonify({"error": "La contraseña actual no coincide"}), 400
    conn.execute("UPDATE users SET password_hash=? WHERE username=?", (generate_password_hash(new), user["username"]))
    conn.commit()
    conn.close()
    audit(user["username"], "Cambio de contraseña")
    return jsonify({"ok": True})


@app.post("/api/formulas/daily")
@login_required
def api_daily_formula():
    body = request.get_json(silent=True) or {}
    fields = ["cct", "ccd", "indv", "ifi", "dth", "challenge"]
    try:
        values = {k: float(body.get(k, 0) or 0) for k in fields}
    except (TypeError, ValueError):
        return jsonify({"error": "Ingresá solamente valores numéricos"}), 400
    if any(v < 0 for v in values.values()):
        return jsonify({"error": "Los valores no pueden ser negativos"}), 400
    return jsonify(calculate_daily(**values))


@app.get("/api/admin/audit")
@admin_required
def api_audit():
    conn = db_conn()
    rows = conn.execute("SELECT username,action,details,created_at FROM audit_log ORDER BY id DESC LIMIT 80").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=os.environ.get("FLASK_DEBUG", "0") == "1")
