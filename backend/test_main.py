import sqlite3
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
import main
from database import build_engine, orders

@pytest.fixture
def client(tmp_path, monkeypatch):
    engine=build_engine('sqlite:///'+str(tmp_path/'test.sqlite3'))
    monkeypatch.setattr(main,'engine',engine)
    monkeypatch.setattr(main,'ADMIN_KEY','a'*32)
    monkeypatch.setattr(main,'SCANNER_KEY','s'*32)
    with TestClient(main.app) as c:
        c.headers['Authorization']='Bearer '+'a'*32
        yield c
    engine.dispose()

def issue(c, quantity=1, paid=True, event_id=1):
    r=c.post(f'/tickets?event_id={event_id}',json={'name':'Invitada','quantity':quantity,'table_name':'4'})
    assert r.status_code==201, r.text
    ticket=r.json()
    if paid:
        r=c.patch(f"/tickets/{ticket['id']}/payment?event_id={event_id}",json={'paid':True})
        assert r.status_code==200,r.text
    with main.engine.connect() as db:
        token=db.scalar(select(orders.c.token).where(orders.c.id==ticket['id']))
    return ticket['id'], 'ZENIT:'+token if token else None

def scan(c, token, quantity=1, request_id=None, event_id=1):
    return c.post(f'/check-in?event_id={event_id}',json={'token':token,'quantity':quantity,'request_id':request_id or str(uuid4())})

def test_partial_group_and_retry(client):
    ticket_id,token=issue(client,4)
    preview=client.post('/lookup',json={'token':token}).json()
    assert preview['ticket']['remaining']==4
    assert client.get('/summary').json()['admitted']==0
    request_id=str(uuid4())
    first=scan(client,token,2,request_id).json()
    assert first['status']=='accepted' and first['ticket']['remaining']==2
    assert scan(client,token,2,request_id).json()==first
    assert client.get('/summary').json()['admitted']==2
    assert scan(client,token,1,request_id).status_code==409
    assert scan(client,token,3).json()['status']=='insufficient'
    assert scan(client,token,2).json()['ticket']['remaining']==0
    assert scan(client,token).json()['status']=='used'
    assert client.patch(f'/tickets/{ticket_id}/payment',json={'paid':False}).status_code==409

def test_concurrent_counts_and_idempotency(client):
    _,token=issue(client,4)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(lambda _:scan(client,token).json()['status'],range(8)))
    assert results.count('accepted')==4
    assert results.count('used')==4
    assert client.get('/summary').json()['admitted']==4
    _,other=issue(client,3)
    request_id=str(uuid4())
    with ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(lambda _:scan(client,other,2,request_id).json(),range(8)))
    assert all(r==results[0] for r in results)
    assert client.get('/summary').json()['admitted']==6

def test_payment_generation_revocation(client):
    ticket_id,token=issue(client,3,False)
    assert token is None
    assert client.get(f'/tickets/{ticket_id}/invitation').status_code==409
    client.patch(f'/tickets/{ticket_id}/payment',json={'paid':True})
    with main.engine.connect() as db:token='ZENIT:'+db.scalar(select(orders.c.token).where(orders.c.id==ticket_id))
    assert client.get(f'/tickets/{ticket_id}/invitation').content.startswith(b'\x89PNG')
    client.patch(f'/tickets/{ticket_id}/payment',json={'paid':True})
    assert client.post('/lookup',json={'token':token}).json()['status']=='available'
    client.patch(f'/tickets/{ticket_id}/payment',json={'paid':False})
    assert scan(client,token).json()['status']=='unknown'
    assert client.get('/summary').json()['available']==84
    assert scan(client,'ZENIT:inventado').json()['status']=='unknown'

def test_capacity_concurrent_payments(client):
    issue(client,82)
    first,_=issue(client,2,False);second,_=issue(client,2,False)
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses=list(pool.map(lambda id:client.patch(f'/tickets/{id}/payment',json={'paid':True}).status_code,[first,second]))
    assert sorted(statuses)==[200,409]
    summary=client.get('/summary').json()
    assert summary['paid']==84 and summary['available']==0

def test_event_isolation_permissions_pagination(client):
    r=client.post('/events',json={'name':'Otro evento','date_label':'2027','venue':'Lugar','capacity':500})
    event_id=r.json()['id']
    ticket_id,token=issue(client,4)
    assert scan(client,token,event_id=event_id).json()['status']=='unknown'
    assert client.get(f'/tickets/{ticket_id}/qr?event_id={event_id}').status_code==404
    assert client.get(f'/summary?event_id={event_id}').json()['available']==500
    issue(client,2)
    page=client.get('/tickets?limit=1').json()
    assert len(page)==1
    assert client.get(f"/tickets?before_id={page[0]['id']}").json()[0]['id']==ticket_id
    client.headers['Authorization']='Bearer '+'s'*32
    assert 'phone' not in client.get('/tickets').json()[0]
    assert client.post('/tickets',json={'name':'Otra'}).status_code==403
    assert client.get(f'/tickets/{ticket_id}/invitation').status_code==403
    client.headers['Authorization']='Bearer wrong'
    assert client.get('/summary').status_code==401

def test_validation_and_attendance_filters(client):
    assert client.post('/tickets',json={'name':'  '}).status_code==422
    assert client.post('/tickets',json={'name':'Ana','quantity':0}).status_code==422
    _,token=issue(client,3)
    scan(client,token,1)
    assert len(client.get('/tickets?attendance=present').json())==1
    assert len(client.get('/tickets?attendance=absent').json())==1
    assert client.get('/summary').json()['admitted']==1

def test_demo_pack_separate_and_reset(client, tmp_path, monkeypatch):
    import seed_demo
    monkeypatch.setattr(seed_demo, 'engine', main.engine)
    before=client.get('/summary').json()
    manifest=seed_demo.seed(tmp_path/'qr')
    assert len(manifest['tickets'])==10
    assert len({t['code'] for t in manifest['tickets']})==10
    assert sum(t['quantity'] for t in manifest['tickets'])==19
    assert client.get('/summary').json()==before
    demo_event=manifest['event_id']
    token=manifest['tickets'][0]['code']
    assert scan(client,token).json()['status']=='unknown'
    assert scan(client,token,event_id=demo_event).json()['status']=='accepted'
    second=seed_demo.seed(tmp_path/'qr')
    assert second['tickets'][0]['code']==token
    reset=seed_demo.seed(tmp_path/'qr',reset=True)
    assert reset['tickets'][0]['code']!=token
    assert scan(client,token,event_id=demo_event).json()['status']=='unknown'
    assert client.get(f'/summary?event_id={demo_event}').json()['admitted']==0

def test_migrate_original_database(tmp_path):
    from database import initialize
    path=tmp_path/'old.sqlite3'
    db=sqlite3.connect(path)
    db.executescript('''CREATE TABLE tickets(id INTEGER PRIMARY KEY,name TEXT,phone TEXT,table_name TEXT,paid INTEGER,token TEXT,used_at TEXT,created_at TEXT);
    INSERT INTO tickets VALUES(1,'Titular','','1',1,'token-legacy','2026-11-01','2026-10-01');
    INSERT INTO tickets VALUES(2,'Reserva','','1',0,'no-issued',NULL,'2026-10-01');''')
    db.commit();db.close()
    engine=build_engine('sqlite:///'+str(path))
    initialize(engine,84);initialize(engine,84)
    with engine.connect() as db:
        rows=list(db.execute(select(orders).order_by(orders.c.id)).mappings())
        assert len(rows)==2
        assert rows[0]['token']=='token-legacy' and rows[0]['admitted_count']==1
        assert rows[1]['token'] is None
    engine.dispose()

def test_two_active_events_concurrency_and_archive(client):
    payload={'name':'Nuevo evento','date_label':'2027','venue':'Lugar','capacity':100}
    with ThreadPoolExecutor(max_workers=3) as pool:
        responses=list(pool.map(lambda _:client.post('/events',json=payload),range(3)))
    assert sorted(r.status_code for r in responses)==[201,409,409]
    second=next(r.json() for r in responses if r.status_code==201)
    ticket_id,token=issue(client,2)
    assert client.patch('/events/1/status',json={'active':False}).status_code==200
    assert scan(client,token).status_code==409
    assert client.get(f'/tickets/{ticket_id}/invitation').status_code==409
    assert client.post('/tickets',json={'name':'Persona'}).status_code==409
    assert len(client.get('/tickets').json())==1
    third=client.post('/events',json=payload)
    assert third.status_code==201
    assert client.patch('/events/1/status',json={'active':True}).status_code==409
    client.patch(f"/events/{second['id']}/status",json={'active':False})
    assert client.patch('/events/1/status',json={'active':True}).status_code==200
    assert scan(client,token).json()['status']=='accepted'
    client.headers['Authorization']='Bearer '+'s'*32
    assert client.patch('/events/1/status',json={'active':False}).status_code==403


def test_rejects_example_and_invalid_access_keys(client, monkeypatch):
    for value in ['corta', 'generar-una-clave-larga-y-aleatoria', 'a' * 25 + ' ', 'a' * 25 + 'ñ']:
        monkeypatch.setattr(main, 'ADMIN_KEY', value)
        with pytest.raises(RuntimeError): main.validate_access_keys()
    monkeypatch.setattr(main, 'ADMIN_KEY', 's' * 32)
    with pytest.raises(RuntimeError): main.validate_access_keys()
    monkeypatch.setattr(main, 'ADMIN_KEY', 'a' * 32)
    monkeypatch.setattr(main, 'SCANNER_KEY', '')
    main.validate_access_keys()

def login(c, username, password):
    return c.post('/login', json={'username': username, 'password': password}, headers={'Authorization': ''})

def test_scanner_users_with_password_limit_access_and_revocation(client, monkeypatch):
    monkeypatch.setattr(main,'SCANNER_KEY','')
    main.ip_failures.clear()
    created=[]
    for name in ['puerta1','puerta2','puerta3']:
        r=client.post('/scanner-users',json={'username':name,'password':'zenit2026'})
        assert r.status_code==201, r.text
        assert set(r.json())=={'id','username','created_at'}
        created.append(r.json())
    r=client.post('/scanner-users',json={'username':'puerta4','password':'zenit2026'})
    assert r.status_code==409 and '3 usuarios' in r.json()['detail']
    listing=client.get('/scanner-users').json()
    assert listing['max']==3 and [u['username'] for u in listing['users']]==['puerta1','puerta2','puerta3']
    # Inicio de sesión: insensible a mayúsculas en el usuario, sensible en la contraseña.
    assert login(client,'puerta1','ZENIT2026').status_code==401
    ok=login(client,' Puerta1 ','zenit2026')
    assert ok.status_code==200 and ok.json()['name']=='puerta1'
    scanner={'Authorization':'Bearer '+ok.json()['token']}
    assert client.get('/session',headers=scanner).json()=={'role':'scanner','name':'puerta1'}
    _,token=issue(client,2)
    r=client.post('/check-in',json={'token':token,'quantity':1,'request_id':str(uuid4())},headers=scanner)
    assert r.json()['status']=='accepted'
    assert client.get('/scanner-users',headers=scanner).status_code==403
    assert client.post('/tickets',json={'name':'X'},headers=scanner).status_code==403
    # Un token alterado no sirve.
    forged=ok.json()['token'][:-1]+('0' if ok.json()['token'][-1]!='0' else '1')
    assert client.get('/session',headers={'Authorization':'Bearer '+forged}).status_code==401
    # Cambiar la contraseña cierra la sesión anterior.
    assert client.patch(f"/scanner-users/{created[0]['id']}/password",json={'password':'nueva-clave'}).status_code==200
    assert client.get('/session',headers=scanner).status_code==401
    assert login(client,'puerta1','zenit2026').status_code==401
    assert login(client,'puerta1','nueva-clave').status_code==200
    # Eliminar el usuario revoca su acceso.
    s2={'Authorization':'Bearer '+login(client,'puerta2','zenit2026').json()['token']}
    assert client.delete(f"/scanner-users/{created[1]['id']}").status_code==204
    assert client.get('/session',headers=s2).status_code==401
    assert client.delete('/scanner-users/999').status_code==404

def test_scanner_user_validation(client):
    for body in [{'username':'pu','password':'zenit2026'},{'username':'puerta uno','password':'zenit2026'},
                 {'username':'puertaño','password':'zenit2026'},{'username':'puerta1','password':'corta'},
                 {'username':'puerta1','password':' espacios '},{'username':'puerta1','password':'PUERTA1'}]:
        assert client.post('/scanner-users',json=body).status_code==422, body
    assert client.post('/scanner-users',json={'username':'Puerta1','password':'zenit2026'}).json()['username']=='puerta1'
    assert client.post('/scanner-users',json={'username':'PUERTA1','password':'zenit2026'}).status_code==409

def test_login_lockout_after_failures(client):
    main.ip_failures.clear()
    client.post('/scanner-users',json={'username':'puerta1','password':'zenit2026'})
    for _ in range(5): assert login(client,'puerta1','mala-clave').status_code==401
    r=login(client,'puerta1','zenit2026')
    assert r.status_code==429 and 'bloqueado' in r.json()['detail']
    # El administrador lo desbloquea cambiando la contraseña.
    uid=client.get('/scanner-users').json()['users'][0]['id']
    client.patch(f'/scanner-users/{uid}/password',json={'password':'otra-clave'})
    assert login(client,'puerta1','otra-clave').status_code==200
    assert login(client,'nadie','zenit2026').status_code==401

def test_login_limit_per_device(client, monkeypatch):
    main.ip_failures.clear()
    monkeypatch.setattr(main,'IP_MAX_FAILURES',3)
    for _ in range(3): login(client,'nadie','x')
    assert login(client,'nadie','x').status_code==429
    main.ip_failures.clear()
