"""Private accounts, opaque sessions and durable conversations (SQLite).

Use a persistent disk for WORKSPACE_DB_PATH; never put this DB in source control.
"""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(os.getenv('WORKSPACE_DB_PATH', str(Path(__file__).resolve().parents[2] / 'data/workspace.db')))
SESSION_SECONDS = 60 * 60 * 24 * 14
DEFAULT_SETTINGS = {'depth': 'technical', 'mode': 'auto', 'scene': 'universe', 'motion': True,
                    'speed': 0.5, 'brightness': 0.65, 'quality': 'auto', 'font_size': 'medium'}

@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    with connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
          password_hash TEXT NOT NULL, settings TEXT NOT NULL, created_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS chats (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
          created_at REAL NOT NULL, updated_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          question TEXT NOT NULL, answer TEXT NOT NULL, citations TEXT NOT NULL,
          follow_ups TEXT NOT NULL, confident INTEGER NOT NULL, used_web INTEGER NOT NULL,
          created_at REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS chat_owner ON chats(user_id, updated_at);
        CREATE INDEX IF NOT EXISTS message_chat ON messages(chat_id, id);
        ''')


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f'{salt}:{digest}'


def verify_password(password, stored):
    return hmac.compare_digest(password_hash(password, stored.split(':')[0]), stored)


def public_user(row):
    return {'id': row['id'], 'name': row['name'], 'email': row['email'],
            'settings': {**DEFAULT_SETTINGS, **json.loads(row['settings'])}}


def create_user(email, name, password):
    user_id = secrets.token_hex(16)
    with connect() as db:
        db.execute('INSERT INTO users VALUES (?,?,?,?,?,?)',
                   (user_id, email, name, password_hash(password), json.dumps(DEFAULT_SETTINGS), time.time()))
        return public_user(db.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone())


def authenticate(email, password):
    with connect() as db:
        row = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
    # Also perform the expensive hash for unknown accounts.
    stored = row['password_hash'] if row else '00' * 16 + ':' + '00' * 64
    valid = verify_password(password, stored)
    return public_user(row) if row and valid else None


def new_session(user_id):
    token = secrets.token_urlsafe(32)
    with connect() as db:
        db.execute('DELETE FROM sessions WHERE expires_at<?', (time.time(),))
        db.execute('INSERT INTO sessions VALUES (?,?,?)',
                   (hashlib.sha256(token.encode()).hexdigest(), user_id, time.time() + SESSION_SECONDS))
    return token


def session_user(token):
    if not token:
        return None
    with connect() as db:
        row = db.execute('''SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id
                            WHERE token_hash=? AND expires_at>?''',
                         (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
    return public_user(row) if row else None


def logout(token):
    with connect() as db:
        db.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))


def update_user(user_id, name, settings):
    with connect() as db:
        db.execute('UPDATE users SET name=?,settings=? WHERE id=?', (name, json.dumps(settings), user_id))
        return public_user(db.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone())


def change_password(user_id, password):
    with connect() as db:
        db.execute('UPDATE users SET password_hash=? WHERE id=?', (password_hash(password), user_id))
        db.execute('DELETE FROM sessions WHERE user_id=?', (user_id,))


def delete_user(user_id):
    with connect() as db:
        db.execute('DELETE FROM users WHERE id=?', (user_id,))


def new_chat(user_id):
    now = time.time()
    chat = {'id': secrets.token_hex(16), 'title': 'New chat', 'pinned': False,
            'created_at': now, 'updated_at': now}
    with connect() as db:
        db.execute('INSERT INTO chats VALUES (?,?,?,?,?,?)',
                   (chat['id'], user_id, chat['title'], 0, now, now))
    return chat


def list_chats(user_id):
    with connect() as db:
        return [dict(r) for r in db.execute(
            'SELECT id,title,pinned,created_at,updated_at FROM chats WHERE user_id=? ORDER BY pinned DESC,updated_at DESC', (user_id,))]


def get_chat(user_id, chat_id):
    with connect() as db:
        row = db.execute('SELECT id,title,pinned,created_at,updated_at FROM chats WHERE id=? AND user_id=?', (chat_id, user_id)).fetchone()
        if not row:
            return None
        result = dict(row)
        result['messages'] = []
        for m in db.execute('SELECT * FROM messages WHERE chat_id=? ORDER BY id', (chat_id,)):
            item = dict(m)
            item['citations'] = json.loads(item['citations'])
            item['follow_up_questions'] = json.loads(item.pop('follow_ups'))
            result['messages'].append(item)
        return result


def update_chat(user_id, chat_id, title, pinned):
    with connect() as db:
        return db.execute('UPDATE chats SET title=?,pinned=? WHERE id=? AND user_id=?',
                          (title, int(pinned), chat_id, user_id)).rowcount > 0


def delete_chat(user_id, chat_id=None):
    with connect() as db:
        if chat_id:
            return db.execute('DELETE FROM chats WHERE id=? AND user_id=?', (chat_id, user_id)).rowcount > 0
        db.execute('DELETE FROM chats WHERE user_id=?', (user_id,))
        return True


def save_turn(user_id, chat_id, question, result):
    with connect() as db:
        # Check ownership again in the same transaction as the write (a chat may
        # have been deleted while inference was running).
        row = db.execute('SELECT title FROM chats WHERE id=? AND user_id=?', (chat_id, user_id)).fetchone()
        if not row:
            return False
        db.execute('INSERT INTO messages (chat_id,question,answer,citations,follow_ups,confident,used_web,created_at) VALUES (?,?,?,?,?,?,?,?)',
                   (chat_id, question, result['answer'], json.dumps(result['citations']),
                    json.dumps(result['follow_up_questions']), int(result['confident']), int(result['used_web']), time.time()))
        title = question[:80] if row['title'] == 'New chat' else row['title']
        db.execute('UPDATE chats SET title=?,updated_at=? WHERE id=?', (title, time.time(), chat_id))
        return True
