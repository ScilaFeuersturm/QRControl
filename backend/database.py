"""Tablas compartidas por SQLite local y PostgreSQL para despliegues."""
from contextlib import contextmanager
import os
import re
from sqlalchemy import (Boolean, CheckConstraint, Column, ForeignKey, Index, Integer,
                        MetaData, String, Text, Table, create_engine, event, inspect, select, text)

DATABASE_SCHEMA = os.getenv('DATABASE_SCHEMA', '').strip()
if DATABASE_SCHEMA and not re.fullmatch(r'[a-z_][a-z0-9_]{0,62}', DATABASE_SCHEMA):
    raise ValueError('DATABASE_SCHEMA debe ser un identificador PostgreSQL simple')
metadata = MetaData()
events = Table('events', metadata,
    Column('id', Integer, primary_key=True), Column('name', String(160), nullable=False),
    Column('date_label', String(100), nullable=False), Column('venue', String(160), nullable=False),
    Column('capacity', Integer, nullable=False), Column('active', Boolean, nullable=False, default=True), CheckConstraint('capacity > 0'))
limits = Table('app_limits', metadata, Column('id', Integer, primary_key=True))
orders = Table('event_orders', metadata,
    Column('id', Integer, primary_key=True), Column('event_id', ForeignKey('events.id'), nullable=False),
    Column('name', String(120), nullable=False), Column('phone', String(40), nullable=False),
    Column('table_name', String(30), nullable=False), Column('quantity', Integer, nullable=False),
    Column('paid', Boolean, nullable=False, default=False), Column('token', String(100), unique=True),
    Column('admitted_count', Integer, nullable=False, default=0),
    Column('used_at', String(50)), Column('created_at', String(50), nullable=False),
    CheckConstraint('quantity > 0'), CheckConstraint('admitted_count >= 0 AND admitted_count <= quantity'), CheckConstraint('NOT paid OR token IS NOT NULL'),
    CheckConstraint('used_at IS NULL OR paid'))
Index('ix_orders_event_paid', orders.c.event_id, orders.c.paid)
Index('ix_orders_event_id', orders.c.event_id, orders.c.id)
scans = Table('event_scan_logs', metadata,
    Column('id', Integer, primary_key=True), Column('event_id', ForeignKey('events.id'), nullable=False),
    Column('ticket_id', ForeignKey('event_orders.id')), Column('result', String(30), nullable=False),
    Column('scanned_at', String(50), nullable=False),
    Column('request_id', String(36), unique=True), Column('fingerprint', String(64)),
    Column('response_json', Text))


def build_engine(url):
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql+psycopg://', 1)
    elif url.startswith('postgresql://'):
        url = url.replace('postgresql://', 'postgresql+psycopg://', 1)
    connect_args = {'check_same_thread': False, 'timeout': 20} if url.startswith('sqlite') else {'connect_timeout': 5}
    if DATABASE_SCHEMA and url.startswith('postgresql'):
        connect_args['options'] = '-csearch_path=' + DATABASE_SCHEMA
    engine = create_engine(url, pool_pre_ping=True, connect_args=connect_args)
    if engine.dialect.name == 'sqlite':
        @event.listens_for(engine, 'connect')
        def configure(connection, _):
            connection.execute('PRAGMA foreign_keys=ON')
            connection.execute('PRAGMA journal_mode=WAL')
    return engine


@contextmanager
def transaction(engine, event_id=None, quota=False, allow_archived=False):
    with engine.connect() as db:
        try:
            # SQLite: bloquear antes de leer. PostgreSQL: bloquear solo el evento.
            if engine.dialect.name == 'sqlite':
                db.exec_driver_sql('BEGIN IMMEDIATE')
            if quota:
                db.execute(select(limits).where(limits.c.id == 1).with_for_update()).first()
            if event_id is not None:
                row = db.execute(select(events).where(events.c.id == event_id).with_for_update()).mappings().first()
                if row is None:
                    from fastapi import HTTPException
                    raise HTTPException(404, 'Evento inexistente')
                if not row['active'] and not allow_archived:
                    from fastapi import HTTPException
                    raise HTTPException(409, 'El evento está archivado')
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise


def initialize(engine, capacity):
    if DATABASE_SCHEMA and engine.dialect.name == 'postgresql':
        with engine.begin() as db:
            db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{DATABASE_SCHEMA}"'))
    metadata.create_all(engine)
    with transaction(engine) as db:
        if 'active' not in {c['name'] for c in inspect(db).get_columns('events')}:
            db.execute(text('ALTER TABLE events ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE'))
        if db.execute(select(limits.c.id)).first() is None:
            db.execute(limits.insert().values(id=1))
        if db.execute(select(events.c.id).limit(1)).first() is None:
            db.execute(events.insert().values(id=1, name='Los Secretos del Destino',
                date_label='06 DIC 2026 · 20:00 a 01:00', venue='Maldito Tano · San Isidro', capacity=capacity))
            if engine.dialect.name == 'postgresql':
                db.execute(text("SELECT setval(pg_get_serial_sequence('events','id'), (SELECT MAX(id) FROM events))"))
            # Migración de la primera versión: preserva QR pagados y asistencia.
            if inspect(db).has_table('tickets'):
                for row in db.execute(text('SELECT * FROM tickets')).mappings():
                    db.execute(orders.insert().values(id=row['id'], event_id=1,
                        name=row['name'], phone=row['phone'], table_name=row['table_name'], quantity=1,
                        paid=bool(row['paid']), token=row['token'] if row['paid'] else None,
                        used_at=row['used_at'], admitted_count=1 if row['used_at'] else 0, created_at=row['created_at']))
                if inspect(db).has_table('scans'):
                    for row in db.execute(text('SELECT * FROM scans')).mappings():
                        db.execute(scans.insert().values(event_id=1, ticket_id=row['ticket_id'],
                            result=row['result'], scanned_at=row['scanned_at']))
                if engine.dialect.name == 'postgresql':
                    db.execute(text("SELECT setval(pg_get_serial_sequence('event_orders','id'), COALESCE((SELECT MAX(id) FROM event_orders),1), EXISTS(SELECT 1 FROM event_orders))"))
