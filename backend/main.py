import hashlib
import json
import hmac
import io
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from uuid import UUID
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'), override=False)

import qrcode
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, func, select
from sqlalchemy.exc import SQLAlchemyError

from database import build_engine, events, initialize, orders, scanner_accounts, scans, transaction
from ticket_design import render_ticket

CAPACITY = int(os.getenv('EVENT_CAPACITY', '84'))
ADMIN_KEY = os.getenv('ADMIN_KEY', '')
SCANNER_KEY = os.getenv('SCANNER_KEY', '')
MAX_SCANNER_USERS = int(os.getenv('MAX_SCANNER_USERS', '3'))
MAX_LOGIN_FAILURES = 5
LOCK_MINUTES = 5
engine = build_engine(os.getenv('DATABASE_URL', 'sqlite:///' + os.getenv('DATABASE_PATH', 'zenit.sqlite3')))

def validate_access_keys():
    placeholders = {'generar-una-clave-larga-y-aleatoria', 'generar-otra-clave-diferente-y-aleatoria'}
    # SCANNER_KEY es opcional: si está vacía, solo ingresan los usuarios de escaneo creados por administración.
    for name, value in [('ADMIN_KEY', ADMIN_KEY), ('SCANNER_KEY', SCANNER_KEY)]:
        if name == 'SCANNER_KEY' and not value: continue
        if len(value) < 24 or value in placeholders or not all(33 <= ord(c) <= 126 for c in value):
            raise RuntimeError(f'Configurá {name} con al menos 24 caracteres ASCII sin espacios; no uses el valor de ejemplo.')
    if ADMIN_KEY == SCANNER_KEY:
        raise RuntimeError('ADMIN_KEY y SCANNER_KEY deben ser diferentes.')

@asynccontextmanager
async def lifespan(app):
    validate_access_keys()
    initialize(engine, CAPACITY)
    yield

app = FastAPI(title='Zenit Control QR', version='0.2.0', lifespan=lifespan)
# La autenticación usa el header Authorization (sin cookies), por eso permitir cualquier origen no expone sesiones.
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in os.getenv('CORS_ORIGINS', '*').split(',') if o.strip()], allow_methods=['*'], allow_headers=['Authorization', 'Content-Type', 'Accept'])
security = HTTPBearer()

def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f'scrypt${salt.hex()}${digest.hex()}'

def verify_password(password, stored):
    try:
        _, salt, _ = stored.split('$')
        return hmac.compare_digest(hash_password(password, bytes.fromhex(salt)), stored)
    except ValueError:
        return False

DUMMY_HASH = hash_password(secrets.token_urlsafe(16))

def session_token(account_id, version):
    # Token firmado con ADMIN_KEY: no se guarda en la base y deja de valer si cambia la contraseña o se elimina el usuario.
    payload = f's1.{account_id}.{version}'
    return payload + '.' + hmac.new(ADMIN_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()

def scanner_from_token(token):
    parts = token.split('.')
    if len(parts) != 4 or parts[0] != 's1' or not parts[1].isdigit() or not parts[2].isdigit(): return None
    if not hmac.compare_digest(session_token(int(parts[1]), int(parts[2])), token): return None
    with engine.connect() as db:
        row = db.execute(select(scanner_accounts.c.username).where(
            scanner_accounts.c.id == int(parts[1]), scanner_accounts.c.password_version == int(parts[2]))).first()
    return row[0] if row else None

def identify(credentials: HTTPAuthorizationCredentials = Depends(security)):
    key = credentials.credentials
    if hmac.compare_digest(key, ADMIN_KEY): return 'admin', 'Administración'
    if SCANNER_KEY and hmac.compare_digest(key, SCANNER_KEY): return 'scanner', 'Escaneo'
    username = scanner_from_token(key)
    if username is not None: return 'scanner', username
    raise HTTPException(401, 'Credencial incorrecta')

def role(identity=Depends(identify)): return identity[0]

def admin(current=Depends(role)):
    if current != 'admin': raise HTTPException(403, 'Solo administración')

class NewTicket(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default='', max_length=40)
    table_name: str = Field(default='', max_length=30)
    quantity: int = Field(default=1, ge=1, le=10000, strict=True)
    @field_validator('name')
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError('Ingresá un nombre')
        return value.strip()

class NewEvent(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    date_label: str = Field(min_length=1, max_length=100)
    venue: str = Field(min_length=1, max_length=160)
    capacity: int = Field(ge=1, le=1000000, strict=True)
    @field_validator('name', 'date_label', 'venue')
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError('El campo no puede estar vacío')
        return value.strip()

class EventStatus(BaseModel):
    active: bool

class Payment(BaseModel):
    paid: bool
class Token(BaseModel):
    token: str = Field(min_length=1, max_length=200)

class Scan(Token):
    quantity: int = Field(ge=1, le=10000, strict=True)
    request_id: UUID

def now(): return datetime.now(timezone.utc).isoformat()

def public(row, current='admin'):
    result = dict(row)
    result.pop('token', None)
    result['paid'] = bool(result['paid'])
    result['remaining'] = result['quantity'] - result['admitted_count']
    if current != 'admin': result.pop('phone', None)
    return result

def get_event(db, event_id):
    row = db.execute(select(events).where(events.c.id == event_id)).mappings().first()
    if row is None: raise HTTPException(404, 'Evento inexistente')
    return row

def get_ticket(db, ticket_id, event_id, lock=False):
    query = select(orders).where(orders.c.id == ticket_id, orders.c.event_id == event_id)
    row = db.execute(query.with_for_update() if lock else query).mappings().first()
    if row is None: raise HTTPException(404, 'Entrada inexistente en este evento')
    return row

def paid_count(db, event_id):
    return db.scalar(select(func.coalesce(func.sum(orders.c.quantity), 0)).where(orders.c.event_id == event_id, orders.c.paid.is_(True)))

@app.get('/health')
def health():
    try:
        with engine.connect() as db: db.execute(select(1))
    except SQLAlchemyError:
        raise HTTPException(503, 'Base de datos no disponible') from None
    return {'status': 'ok'}
@app.get('/session')
def session(identity=Depends(identify)):
    return {'role': identity[0], 'name': identity[1]}

USERNAME_PATTERN = r'^[a-z0-9._-]{3,30}$'

class ScannerPassword(BaseModel):
    password: str = Field(min_length=8, max_length=128)
    @field_validator('password')
    @classmethod
    def no_blank(cls, value):
        if not value.strip(): raise ValueError('La contraseña no puede estar vacía')
        if value != value.strip(): raise ValueError('La contraseña no puede empezar ni terminar con espacios')
        return value

class NewScannerUser(ScannerPassword):
    username: str = Field(min_length=3, max_length=30)
    @field_validator('username', mode='before')
    @classmethod
    def normalize_username(cls, value):
        value = str(value).strip().lower()
        if not re.fullmatch(USERNAME_PATTERN, value):
            raise ValueError('El usuario debe tener entre 3 y 30 caracteres: letras sin acentos, números, punto, guion o guion bajo')
        return value

class Login(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=128)

def public_scanner(row): return {'id': row['id'], 'username': row['username'], 'created_at': row['created_at']}

@app.post('/login')
def login(data: Login, request: Request):
    username = data.username.strip().lower()
    client = request.client.host if request.client else 'desconocido'
    if not ip_allowed(client):
        raise HTTPException(429, 'Demasiados intentos desde este dispositivo. Esperá unos minutos y volvé a intentar.')
    with transaction(engine) as db:
        row = db.execute(select(scanner_accounts).where(scanner_accounts.c.username == username).with_for_update()).mappings().first()
        if row and row['locked_until'] and row['locked_until'] > now():
            raise HTTPException(429, f'Usuario bloqueado por intentos fallidos. Esperá {LOCK_MINUTES} minutos y volvé a intentar.')
        # Sin usuario también se calcula un hash, para no revelar por el tiempo de respuesta qué usuarios existen.
        valid = verify_password(data.password, row['password_hash'] if row else DUMMY_HASH)
        if row and valid:
            db.execute(scanner_accounts.update().where(scanner_accounts.c.id == row['id']).values(failed_attempts=0, locked_until=None))
            return {'token': session_token(row['id'], row['password_version']), 'role': 'scanner', 'name': row['username']}
        register_ip_failure(client)
        if row:
            failures = row['failed_attempts'] + 1
            locked = (datetime.now(timezone.utc) + timedelta(minutes=LOCK_MINUTES)).isoformat() if failures >= MAX_LOGIN_FAILURES else None
            db.execute(scanner_accounts.update().where(scanner_accounts.c.id == row['id']).values(
                failed_attempts=0 if locked else failures, locked_until=locked))
    raise HTTPException(401, 'Usuario o contraseña incorrectos')

# Límite por dispositivo en memoria: alcanza para una sola instancia y frena pruebas masivas contra varios usuarios.
IP_WINDOW_SECONDS, IP_MAX_FAILURES = 15 * 60, 20
ip_failures: dict[str, list[float]] = {}

def ip_allowed(client):
    recent = [t for t in ip_failures.get(client, []) if time.monotonic() - t < IP_WINDOW_SECONDS]
    ip_failures[client] = recent
    return len(recent) < IP_MAX_FAILURES

def register_ip_failure(client):
    ip_failures.setdefault(client, []).append(time.monotonic())

@app.get('/scanner-users', dependencies=[Depends(admin)])
def list_scanner_users():
    with engine.connect() as db:
        rows = db.execute(select(scanner_accounts).order_by(scanner_accounts.c.id)).mappings()
        return {'max': MAX_SCANNER_USERS, 'users': [public_scanner(r) for r in rows]}

@app.post('/scanner-users', status_code=201, dependencies=[Depends(admin)])
def create_scanner_user(data: NewScannerUser):
    if data.password.lower() == data.username: raise HTTPException(422, 'La contraseña no puede ser igual al usuario')
    with transaction(engine, quota=True) as db:
        if db.scalar(select(func.count()).select_from(scanner_accounts)) >= MAX_SCANNER_USERS:
            raise HTTPException(409, f'Ya hay {MAX_SCANNER_USERS} usuarios de escaneo. Eliminá uno para crear otro.')
        if db.scalar(select(scanner_accounts.c.id).where(scanner_accounts.c.username == data.username)) is not None:
            raise HTTPException(409, 'Ya existe un usuario con ese nombre')
        result = db.execute(scanner_accounts.insert().values(username=data.username, password_hash=hash_password(data.password),
            password_version=1, failed_attempts=0, created_at=now()))
        return public_scanner(db.execute(select(scanner_accounts).where(scanner_accounts.c.id == result.inserted_primary_key[0])).mappings().one())

@app.patch('/scanner-users/{user_id}/password', dependencies=[Depends(admin)])
def change_scanner_password(user_id: int, data: ScannerPassword):
    with transaction(engine, quota=True) as db:
        row = db.execute(select(scanner_accounts).where(scanner_accounts.c.id == user_id).with_for_update()).mappings().first()
        if row is None: raise HTTPException(404, 'Usuario inexistente')
        if data.password.lower() == row['username']: raise HTTPException(422, 'La contraseña no puede ser igual al usuario')
        # Cambiar la contraseña cierra las sesiones abiertas de ese usuario y lo desbloquea.
        db.execute(scanner_accounts.update().where(scanner_accounts.c.id == user_id).values(password_hash=hash_password(data.password),
            password_version=row['password_version'] + 1, failed_attempts=0, locked_until=None))
        return public_scanner(row)

@app.delete('/scanner-users/{user_id}', status_code=204, dependencies=[Depends(admin)])
def delete_scanner_user(user_id: int):
    with transaction(engine, quota=True) as db:
        if db.execute(scanner_accounts.delete().where(scanner_accounts.c.id == user_id)).rowcount == 0:
            raise HTTPException(404, 'Usuario inexistente')
    return Response(status_code=204)

@app.get('/events', dependencies=[Depends(role)])
def list_events():
    with engine.connect() as db: return [dict(r) for r in db.execute(select(events).order_by(events.c.id)).mappings()]

@app.post('/events', status_code=201, dependencies=[Depends(admin)])
def create_event(data: NewEvent):
    with transaction(engine, quota=True) as db:
        require_event_slot(db)
        result = db.execute(events.insert().values(**data.model_dump()))
        return dict(get_event(db, result.inserted_primary_key[0]))

def require_event_slot(db):
    if db.scalar(select(func.count()).select_from(events).where(events.c.active.is_(True))) >= 2:
        raise HTTPException(409, 'Ya hay dos eventos activos. Archivá uno antes de crear o reactivar otro.')

@app.patch('/events/{event_id}/status', dependencies=[Depends(admin)])
def event_status(event_id: int, data: EventStatus):
    with transaction(engine, event_id, quota=True, allow_archived=True) as db:
        row = get_event(db, event_id)
        if data.active and not row['active']: require_event_slot(db)
        db.execute(events.update().where(events.c.id == event_id).values(active=data.active))
        return dict(get_event(db, event_id))


@app.get('/summary', dependencies=[Depends(role)])
def summary(event_id: int = 1):
    with engine.connect() as db:
        event = get_event(db, event_id)
        row = db.execute(select(func.count().label('purchases'),
            func.coalesce(func.sum(orders.c.quantity), 0).label('reserved'),
            func.coalesce(func.sum(case((orders.c.paid.is_(True), orders.c.quantity), else_=0)), 0).label('paid'),
            func.coalesce(func.sum(orders.c.admitted_count), 0).label('admitted')
        ).where(orders.c.event_id == event_id)).mappings().one()
        return {**row, 'capacity': event['capacity'], 'available': event['capacity'] - row['paid']}

@app.get('/tickets')
def tickets(event_id: int = 1, search: str = Query('', max_length=120),
            attendance: str = Query('all', pattern='^(all|present|absent|pending)$'),
            before_id: int | None = Query(None, ge=1), offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200), current=Depends(role)):
    with engine.connect() as db:
        get_event(db, event_id)
        query = select(orders).where(orders.c.event_id == event_id)
        if search.strip():
            term = '%' + search.strip().lower().replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%'
            query = query.where(func.lower(orders.c.name).like(term, escape='!'))
        if before_id is not None: query = query.where(orders.c.id < before_id)
        if attendance == 'present': query = query.where(orders.c.admitted_count > 0)
        if attendance == 'absent': query = query.where(orders.c.paid.is_(True), orders.c.admitted_count < orders.c.quantity)
        if attendance == 'pending': query = query.where(orders.c.paid.is_(False))
        return [public(r, current) for r in db.execute(query.order_by(orders.c.id.desc()).offset(offset).limit(limit)).mappings()]

@app.post('/tickets', status_code=201, dependencies=[Depends(admin)])
def create_ticket(data: NewTicket, event_id: int = 1):
    with transaction(engine, event_id) as db:
        event = get_event(db, event_id)
        if data.quantity > event['capacity']: raise HTTPException(409, 'La compra supera la capacidad del evento')
        # Una reserva pendiente no bloquea cupo. El cupo se adjudica al confirmar el pago.
        result = db.execute(orders.insert().values(event_id=event_id, **data.model_dump(), paid=False, token=None, created_at=now()))
        return public(get_ticket(db, result.inserted_primary_key[0], event_id))

@app.patch('/tickets/{ticket_id}/payment', dependencies=[Depends(admin)])
def payment(ticket_id: int, data: Payment, event_id: int = 1):
    with transaction(engine, event_id) as db:
        row = get_ticket(db, ticket_id, event_id, lock=True)
        if row['admitted_count']: raise HTTPException(409, 'La entrada ya ingresó')
        if data.paid and not row['paid']:
            available = get_event(db, event_id)['capacity'] - paid_count(db, event_id)
            if row['quantity'] > available: raise HTTPException(409, f'Quedan {available} entradas disponibles')
            db.execute(orders.update().where(orders.c.id == ticket_id).values(paid=True, token=secrets.token_urlsafe(32)))
        elif not data.paid and row['paid']:
            # Revocar el pago invalida el QR anterior y libera las plazas.
            db.execute(orders.update().where(orders.c.id == ticket_id).values(paid=False, token=None))
        return public(get_ticket(db, ticket_id, event_id))

def paid_ticket(ticket_id, event_id):
    with engine.connect() as db:
        row = get_ticket(db, ticket_id, event_id)
        event = get_event(db, event_id)
        if not event['active']: raise HTTPException(409, 'El evento está archivado')
        if not row['paid'] or not row['token']: raise HTTPException(409, 'Confirmá el pago antes de emitir el QR')
        return dict(row), dict(event)

@app.get('/tickets/{ticket_id}/qr', dependencies=[Depends(admin)])
def ticket_qr(ticket_id: int, event_id: int = 1):
    row, _ = paid_ticket(ticket_id, event_id)
    buffer = io.BytesIO()
    qrcode.make('ZENIT:' + row['token']).save(buffer, format='PNG')
    return Response(buffer.getvalue(), media_type='image/png', headers={'Cache-Control': 'no-store'})

@app.get('/tickets/{ticket_id}/invitation', dependencies=[Depends(admin)])
def invitation(ticket_id: int, event_id: int = 1):
    row, event = paid_ticket(ticket_id, event_id)
    return Response(render_ticket(event, row, demo=event['name'].startswith('PRUEBA · ')), media_type='image/png', headers={'Cache-Control': 'no-store'})

def find_token(db, token, event_id):
    value = token.strip()
    value = value[6:] if value.startswith('ZENIT:') else ''
    return db.execute(select(orders).where(orders.c.token == value, orders.c.event_id == event_id)).mappings().first()

@app.post('/lookup', dependencies=[Depends(role)])
def lookup(data: Token, event_id: int = 1):
    with engine.connect() as db:
        get_event(db, event_id)
        row = find_token(db, data.token, event_id)
        status = 'unknown' if row is None else ('used' if row['admitted_count'] == row['quantity'] else ('available' if row['paid'] else 'unpaid'))
        return {'status': status, 'ticket': public(row, 'scanner') if row else None}

@app.post('/check-in', dependencies=[Depends(role)])
def check_in(data: Scan, event_id: int = 1):
    fingerprint = hashlib.sha256(f'{event_id}|{data.token.strip()}|{data.quantity}'.encode()).hexdigest()
    with transaction(engine, event_id) as db:
        previous = db.execute(select(scans).where(scans.c.request_id == str(data.request_id))).mappings().first()
        if previous:
            if previous['fingerprint'] != fingerprint:
                raise HTTPException(409, 'Esta operación ya fue usada con otros datos')
            return json.loads(previous['response_json'])
        row = find_token(db, data.token, event_id)
        status = 'unknown'
        if row:
            remaining = row['quantity'] - row['admitted_count']
            status = 'used' if remaining == 0 else ('unpaid' if not row['paid'] else ('insufficient' if data.quantity > remaining else 'accepted'))
            if status == 'accepted':
                db.execute(orders.update().where(orders.c.id == row['id']).values(
                    admitted_count=row['admitted_count'] + data.quantity, used_at=now()))
                row = get_ticket(db, row['id'], event_id)
        response = {'status': status, 'ticket': public(row, 'scanner') if row else None,
                    'admitted_now': data.quantity if status == 'accepted' else 0}
        db.execute(scans.insert().values(event_id=event_id, ticket_id=row['id'] if row else None,
            result=status, scanned_at=now(), request_id=str(data.request_id), fingerprint=fingerprint,
            response_json=json.dumps(response)))
        return response

@app.get('/attendance', dependencies=[Depends(role)])
def attendance(event_id: int = 1, ids: list[int] = Query(default=[], max_length=200)):
    with engine.connect() as db:
        get_event(db, event_id)
        rows=db.execute(select(orders.c.id, orders.c.paid, orders.c.quantity, orders.c.admitted_count, orders.c.used_at)
            .where(orders.c.event_id == event_id, orders.c.id.in_(ids))).mappings()
        return [{**r, 'remaining': r['quantity'] - r['admitted_count']} for r in rows]
