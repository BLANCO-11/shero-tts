import os
import sqlite3
import hashlib
import secrets
from datetime import datetime

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "shero_tts.db"))

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the SQLite tables if they do not exist and registers default admin credentials."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. API Tokens Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS api_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
    )
    """)
    
    # 2. Admin Credentials Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_users (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL
    )
    """)
    
    # Insert default demo token if no keys exist
    cursor.execute("SELECT COUNT(*) as count FROM api_tokens")
    token_row = cursor.fetchone()
    if token_row["count"] == 0:
        created_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "INSERT INTO api_tokens (token, name, created_at, status) VALUES ('sh_demo_key_unlimited', 'Default Demo Key', ?, 'active')",
            (created_at,)
        )
        print("Registered default demo token: 'sh_demo_key_unlimited'")
    
    # Insert default admin if no users exist
    cursor.execute("SELECT COUNT(*) as count FROM admin_users")
    row = cursor.fetchone()
    if row["count"] == 0:
        # Default credentials. Can be overridden via .env
        admin_user = os.environ.get("ADMIN_USERNAME", "admin")
        admin_pass = os.environ.get("ADMIN_PASSWORD", "shero-admin-2026")
        pass_hash = hashlib.sha256(admin_pass.encode("utf-8")).hexdigest()
        
        cursor.execute(
            "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)",
            (admin_user, pass_hash)
        )
        print(f"Registered default admin user: '{admin_user}' (Default password: '{admin_pass}')")
        
    conn.commit()
    conn.close()

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def verify_admin(username: str, password: str) -> bool:
    """Verifies username and password against the SQLite database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    pass_hash = hash_password(password)
    
    cursor.execute(
        "SELECT * FROM admin_users WHERE username = ? AND password_hash = ?",
        (username, pass_hash)
    )
    user = cursor.fetchone()
    conn.close()
    return user is not None

def create_api_token(name: str) -> str:
    """Generates a secure API key prefix 'sh_' and saves it in the database."""
    raw_token = "sh_" + secrets.token_hex(24)
    created_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO api_tokens (token, name, created_at, status) VALUES (?, ?, ?, 'active')",
        (raw_token, name, created_at)
    )
    conn.commit()
    conn.close()
    return raw_token

def verify_api_token(token: str) -> bool:
    """Checks if a given API token exists and is active."""
    if not token:
        return False
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM api_tokens WHERE token = ? AND status = 'active'",
        (token,)
    )
    row = cursor.fetchone()
    conn.close()
    return row is not None

def list_api_tokens() -> list:
    """Lists all registered API tokens (masking token values for security)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, token, name, created_at, status FROM api_tokens ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    
    result = []
    for r in rows:
        raw_tok = r["token"]
        masked_tok = raw_tok[:7] + "..." + raw_tok[-4:] if len(raw_tok) > 12 else raw_tok
        result.append({
            "id": r["id"],
            "name": r["name"],
            "created_at": r["created_at"],
            "status": r["status"]
        })
    return result

def revoke_api_token(token_id: int):
    """Deletes or revokes a token by id."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM api_tokens WHERE id = ?", (token_id,))
    conn.commit()
    conn.close()
