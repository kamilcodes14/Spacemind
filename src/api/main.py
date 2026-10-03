"""SpaceMind API and same-origin web app. Run: uvicorn src.api.main:app --reload"""
import json
import logging
import os
import re
import sqlite3
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from src.config import BASE_DIR, RATE_LIMIT_PER_HOUR, TAVILY_API_KEY, WEB_SEARCH_ENABLED
from src.storage import workspace_db as db

logger = logging.getLogger(__name__)
COOKIE = 'spacemind_session'
ALLOWED_ORIGINS = [s.strip().rstrip('/') for s in os.getenv('ALLOWED_ORIGINS', '').split(',') if s.strip()]
limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app):
    db.init_db()
    # Keep account routes available even when optional AI dependencies fail.
    try:
        from src.ingestion import bootstrap
        bootstrap.ensure_index(background=True)
    except Exception:
        logger.exception('Research index startup failed; accounts remain available')
    yield

app = FastAPI(title='SpaceMind', version='0.3.0', lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
if ALLOWED_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True,
                       allow_methods=['GET','POST','PATCH','DELETE'], allow_headers=['Content-Type','X-SpaceMind'])

@app.middleware('http')
async def security_headers(request: Request, call_next):
    if request.method in {'POST','PATCH','DELETE','PUT'}:
        # A required custom header prevents cross-origin HTML form submissions.
        # Cross-origin JS must also pass the explicit CORS allowlist.
        origin = request.headers.get('origin')
        same_origin = str(request.base_url).rstrip('/')
        if request.headers.get('x-spacemind') != '1' or (origin and origin != same_origin and origin not in ALLOWED_ORIGINS):
            return JSONResponse({'detail': 'Request origin not allowed.'}, status_code=403)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['X-Frame-Options'] = 'DENY'
    if not request.url.path.startswith('/assets/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


def current_user(request: Request):
    user = db.session_user(request.cookies.get(COOKIE))
    if not user:
        raise HTTPException(401, 'Please sign in to continue.')
    return user


def set_session(response, request, user_id):
    secure = os.getenv('COOKIE_SECURE', 'false').lower() == 'true' or request.url.scheme == 'https'
    response.set_cookie(COOKIE, db.new_session(user_id), max_age=db.SESSION_SECONDS,
                        httponly=True, secure=secure, samesite='lax', path='/')


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=128)

class Registration(Credentials):
    name: str = Field(min_length=1, max_length=80)


def clean_email(email):
    email = email.strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise HTTPException(422, 'Enter a valid email address.')
    return email

@app.post('/auth/signup')
@limiter.limit('5/hour')
def signup(request: Request, body: Registration, response: Response):
    if not body.name.strip():
        raise HTTPException(422, 'Enter your name.')
    try:
        user = db.create_user(clean_email(body.email), body.name.strip(), body.password)
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'Unable to create this account. Try signing in.')
    set_session(response, request, user['id'])
    return user

@app.post('/auth/login')
@limiter.limit('10/minute')
def login(request: Request, body: Credentials, response: Response):
    user = db.authenticate(clean_email(body.email), body.password)
    if not user:
        raise HTTPException(401, 'Email or password is incorrect.')
    set_session(response, request, user['id'])
    return user

@app.post('/auth/logout')
def logout(request: Request, response: Response):
    db.logout(request.cookies.get(COOKIE, ''))
    response.delete_cookie(COOKIE, path='/')
    return {'ok': True}

@app.get('/auth/me')
def me(user=Depends(current_user)):
    return user

class Preferences(BaseModel):
    depth: Literal['simple','technical'] = 'technical'
    mode: Literal['auto','web','papers'] = 'auto'
    scene: Literal['universe','solar','galaxy','nebula'] = 'universe'
    motion: bool = True
    speed: float = Field(default=0.5, ge=0, le=1)
    brightness: float = Field(default=0.65, ge=0.15, le=1)
    quality: Literal['auto','low','high'] = 'auto'
    font_size: Literal['small','medium','large'] = 'medium'

class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    settings: Preferences

@app.patch('/auth/me')
def update_profile(body: ProfileUpdate, user=Depends(current_user)):
    if not body.name.strip():
        raise HTTPException(422, 'Enter your name.')
    return db.update_user(user['id'], body.name.strip(), body.settings.model_dump())

class PasswordChange(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(min_length=10, max_length=128)

@app.post('/auth/password')
@limiter.limit('5/minute')
def password(request: Request, body: PasswordChange, response: Response, user=Depends(current_user)):
    if not db.authenticate(user['email'], body.current_password):
        raise HTTPException(400, 'Current password is incorrect.')
    db.change_password(user['id'], body.new_password)
    set_session(response, request, user['id'])
    return {'ok': True}

class DeleteAccount(BaseModel):
    password: str = Field(max_length=128)

@app.delete('/auth/me')
@limiter.limit('5/minute')
def delete_account(request: Request, body: DeleteAccount, response: Response, user=Depends(current_user)):
    if not db.authenticate(user['email'], body.password):
        raise HTTPException(400, 'Password is incorrect.')
    db.delete_user(user['id'])
    response.delete_cookie(COOKIE, path='/')
    return {'ok': True}

@app.get('/chats')
def chats(user=Depends(current_user)):
    return db.list_chats(user['id'])

@app.post('/chats')
def create_chat(user=Depends(current_user)):
    return db.new_chat(user['id'])

@app.get('/chats/{chat_id}')
def chat(chat_id: str, user=Depends(current_user)):
    result = db.get_chat(user['id'], chat_id)
    if result is None:
        raise HTTPException(404, 'Conversation not found.')
    return result

class ChatUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    pinned: bool = False

@app.patch('/chats/{chat_id}')
def edit_chat(chat_id: str, body: ChatUpdate, user=Depends(current_user)):
    if not body.title.strip():
        raise HTTPException(422, 'Enter a conversation title.')
    if not db.update_chat(user['id'], chat_id, body.title.strip(), body.pinned):
        raise HTTPException(404, 'Conversation not found.')
    return {'ok': True}

@app.delete('/chats/{chat_id}')
def delete_chat(chat_id: str, user=Depends(current_user)):
    if not db.delete_chat(user['id'], chat_id):
        raise HTTPException(404, 'Conversation not found.')
    return {'ok': True}

@app.delete('/chats')
def delete_chats(user=Depends(current_user)):
    db.delete_chat(user['id'])
    return {'ok': True}

@app.get('/export')
def export(user=Depends(current_user)):
    return {'profile': user, 'chats': [db.get_chat(user['id'], c['id']) for c in db.list_chats(user['id'])]}

class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=12000)
    chat_id: str
    top_k: int = Field(default=5, ge=1, le=12)
    depth: Literal['simple','technical'] = 'technical'
    use_web: bool | None = None


def ask_assistant(*args, **kwargs):
    from src.query.query_engine import ask
    return ask(*args, **kwargs)

@app.post('/ask')
@limiter.limit(f'{RATE_LIMIT_PER_HOUR}/hour')
def ask(request: Request, body: QuestionRequest, user=Depends(current_user)):
    question = body.question.strip()
    if not question:
        raise HTTPException(422, 'Enter a question.')
    conversation = chat(body.chat_id, user)
    if body.use_web is True and not (TAVILY_API_KEY and WEB_SEARCH_ENABLED):
        raise HTTPException(503, 'Web research is unavailable. Configure TAVILY_API_KEY on the server, or choose Papers only.')
    history = [(m['question'], m['answer']) for m in conversation['messages'][-10:]]
    try:
        result = ask_assistant(question, top_k=body.top_k, depth=body.depth, history=history, use_web=body.use_web)
    except RuntimeError as exc:
        logger.warning('Research unavailable: %s', exc)
        raise HTTPException(503, 'Research is not ready. Check the model configuration and paper index on the server, then retry.')
    except Exception:
        logger.exception('Research request failed')
        raise HTTPException(503, 'Research could not complete. Please try again in a moment.')
    payload = {'answer': result.text, 'citations': [vars(c) for c in result.citations],
               'follow_up_questions': result.follow_up_questions, 'confident': result.confident, 'used_web': result.used_web}
    if not db.save_turn(user['id'], body.chat_id, question, payload):
        raise HTTPException(409, 'This conversation was deleted while the answer was being prepared.')
    return payload

@app.get('/health')
def health():
    return {'status': 'ok'}

@app.get('/capabilities')
def capabilities(user=Depends(current_user)):
    return {'web_search': bool(TAVILY_API_KEY and WEB_SEARCH_ENABLED)}

@app.get('/library')
def library(user=Depends(current_user)):
    try:
        from src.library import list_papers
        return list_papers()
    except Exception:
        logger.exception('Paper library unavailable')
        raise HTTPException(503, 'The paper library is not available yet.')

@app.get('/learning-paths')
def paths(user=Depends(current_user)):
    path = BASE_DIR / 'data/learning_paths.json'
    return json.loads(path.read_text()) if path.exists() else []

@app.get('/', include_in_schema=False)
def index():
    return FileResponse(BASE_DIR / 'frontend/index.html')

app.mount('/assets', StaticFiles(directory=str(BASE_DIR / 'frontend')), name='assets')
