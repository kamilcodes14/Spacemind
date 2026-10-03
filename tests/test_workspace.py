"""Privacy and conversation integration tests; research generation is stubbed."""
import json
import sys
import types
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from src.storage import workspace_db as db
from src.api import main

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db,'DB_PATH',tmp_path/'workspace.db')
    bootstrap=types.ModuleType('src.ingestion.bootstrap')
    bootstrap.ensure_index=lambda **kwargs:None
    monkeypatch.setitem(sys.modules,'src.ingestion.bootstrap',bootstrap)
    main.limiter.reset()
    with TestClient(main.app,headers={'X-SpaceMind':'1'}) as c:
        yield c

def signup(c,email='a@example.com'):
    r=c.post('/auth/signup',json={'email':email,'name':'Kamil','password':'research-pass-123'})
    assert r.status_code==200,r.text
    return r.json()

def new_chat(c):
    r=c.post('/chats');assert r.status_code==200,r.text
    return r.json()['id']

def test_auth_and_private_routes(client):
    c=client
    assert c.get('/chats').status_code==401
    assert c.get('/library').status_code==401
    signup(c)
    assert c.get('/auth/me').json()['email']=='a@example.com'
    cookie=c.cookies.get('spacemind_session')
    assert len(cookie)>30
    with db.connect() as conn:
        assert conn.execute('SELECT password_hash FROM users').fetchone()[0]!='research-pass-123'
        assert conn.execute('SELECT token_hash FROM sessions').fetchone()[0]!=cookie
    c.post('/auth/logout')
    assert c.get('/auth/me').status_code==401
    assert c.post('/auth/login',json={'email':'a@example.com','password':'wrong-pass-123'}).status_code==401
    assert c.post('/auth/login',json={'email':'A@example.com','password':'research-pass-123'}).status_code==200

def test_two_users_cannot_access_each_others_chats(client):
    c=client;signup(c);chat_id=new_chat(c);c.post('/auth/logout');signup(c,'b@example.com')
    assert c.get('/chats').json()==[]
    assert c.get('/chats/'+chat_id).status_code==404
    assert c.patch('/chats/'+chat_id,json={'title':'hijack'}).status_code==404
    assert c.delete('/chats/'+chat_id).status_code==404
    assert c.post('/ask',json={'question':'hello','chat_id':chat_id}).status_code==404
    assert c.get('/export').json()['chats']==[]

def test_resume_export_and_delete(client,monkeypatch):
    c=client;signup(c);chat_id=new_chat(c);seen=[]
    def answer(question,**kwargs):
        seen.append(kwargs['history'])
        return SimpleNamespace(text='Evidence [1]',citations=[SimpleNamespace(source_file='Paper',origin='arxiv',snippet='An excerpt',url='https://arxiv.org')],follow_up_questions=['Why?'],confident=True,used_web=False)
    monkeypatch.setattr(main,'ask_assistant',answer)
    for q in ['What is a star?','What about its core?']:
        r=c.post('/ask',json={'question':q,'chat_id':chat_id,'use_web':False});assert r.status_code==200,r.text
    assert seen[1]==[('What is a star?','Evidence [1]')]
    db.init_db();c.post('/auth/logout');c.post('/auth/login',json={'email':'a@example.com','password':'research-pass-123'})
    saved=c.get('/chats/'+chat_id).json()
    assert len(saved['messages'])==2 and saved['title']=='What is a star?'
    assert saved['messages'][0]['citations'][0]['source_file']=='Paper'
    assert c.patch('/chats/'+chat_id,json={'title':'Stellar research','pinned':True}).status_code==200
    exported=c.get('/export').json()
    assert exported['chats'][0]['pinned']==1
    assert 'password_hash' not in json.dumps(exported) and 'token_hash' not in json.dumps(exported)
    c.delete('/chats/'+chat_id)
    assert c.get('/chats/'+chat_id).status_code==404
    with db.connect() as conn:assert conn.execute('SELECT count(*) FROM messages').fetchone()[0]==0

def test_settings_password_rotation_and_account_deletion(client):
    c=client;user=signup(c);prefs={**user['settings'],'motion':False,'scene':'galaxy','font_size':'large'}
    assert c.patch('/auth/me',json={'name':'Researcher','settings':prefs}).json()['settings']==prefs
    old=c.cookies.get('spacemind_session')
    assert c.post('/auth/password',json={'current_password':'wrong','new_password':'new-password-123'}).status_code==400
    assert c.post('/auth/password',json={'current_password':'research-pass-123','new_password':'new-password-123'}).status_code==200
    assert db.session_user(old) is None and c.get('/auth/me').status_code==200
    chat_id=new_chat(c)
    assert c.request('DELETE','/auth/me',json={'password':'wrong'}).status_code==400
    assert c.request('DELETE','/auth/me',json={'password':'new-password-123'}).status_code==200
    assert c.get('/auth/me').status_code==401 and db.get_chat(user['id'],chat_id) is None

def test_csrf_validation_and_legacy_share_removed(client):
    c=client;signup(c)
    assert c.post('/chats',headers={'Origin':'https://evil.example'}).status_code==403
    assert c.post('/chats',headers={'X-SpaceMind':''}).status_code==403
    assert c.get('/share/old-id').status_code==404
    assert c.get('/assets/../data/workspace.db').status_code==404
    assert c.post('/ask',json={'question':'test','chat_id':new_chat(c),'top_k':100}).status_code==422

def test_expired_session_and_rate_limit(client):
    c=client;signup(c)
    with db.connect() as conn:conn.execute('UPDATE sessions SET expires_at=0')
    assert c.get('/auth/me').status_code==401
    statuses=[c.post('/auth/login',json={'email':'missing@example.com','password':'wrong-password'}).status_code for _ in range(11)]
    assert 429 in statuses

def test_web_unavailable_and_no_fake_answer_saved(client,monkeypatch):
    c=client;signup(c);chat_id=new_chat(c);monkeypatch.setattr(main,'TAVILY_API_KEY','')
    assert c.post('/ask',json={'question':'latest news','chat_id':chat_id,'use_web':True}).status_code==503
    def failure(*args,**kwargs):raise RuntimeError('private configuration detail')
    monkeypatch.setattr(main,'ask_assistant',failure)
    r=c.post('/ask',json={'question':'stars','chat_id':chat_id,'use_web':False})
    assert r.status_code==503 and 'private configuration detail' not in r.text
    assert c.get('/chats/'+chat_id).json()['messages']==[]

def test_explicit_web_bypasses_paper_index_and_never_silently_falls_back():
    # Exercise the actual ask() body with isolated dependencies, without
    # downloading embedding models or making paid/provider requests.
    import ast
    from pathlib import Path
    source=Path('src/query/query_engine.py').read_text()
    tree=ast.parse(source)
    function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='ask')
    events=[]
    def no_index():
        raise AssertionError('Web mode must not load the paper index')
    scope={'TOP_K':5,'Optional':__import__('typing').Optional,'List':list,'Tuple':tuple,
           'Answer':lambda **kw:SimpleNamespace(**kw),'get_llm':lambda:object(),
           'Settings':SimpleNamespace(),'_is_casual':lambda q:False,
           'condense_question':lambda h,q,llm:q,'load_index':no_index,
           'WEB_SEARCH_ENABLED':True,'TAVILY_API_KEY':'test-only',
           'search_web':lambda q: ['evidence'],
           '_answer_from_web':lambda *a:events.append(a) or 'web answer'}
    exec(compile(ast.Module(body=[function],type_ignores=[]),'query_engine.py','exec'),scope)
    assert scope['ask']('latest discoveries',use_web=True)=='web answer'
    assert len(events)==1
    scope['search_web']=lambda q:[]
    assert scope['ask']('latest discoveries',use_web=True).confident is False

def test_short_astronomy_terms_are_not_small_talk():
    import ast
    from pathlib import Path
    tree=ast.parse(Path('src/query/query_engine.py').read_text())
    function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_is_casual')
    scope={'CASUAL_PATTERNS':{'hi','hello','thanks'}}
    exec(compile(ast.Module(body=[function],type_ignores=[]),'query_engine.py','exec'),scope)
    for term in ['Mars','Sun','stars','moon']:
        assert not scope['_is_casual'](term)
    assert scope['_is_casual']('hello!')
