"""Inicialización idempotente para el ensayo público. No reinicia asistencias."""
from sqlalchemy import func, select
from database import events, initialize
from main import CAPACITY, engine
from seed_demo import DEMO_NAME, seed

initialize(engine, CAPACITY)
with engine.connect() as db:
    exists=db.execute(select(events.c.id).where(events.c.name == DEMO_NAME)).first()
    active=db.scalar(select(func.count()).select_from(events).where(events.c.active.is_(True)))
if not exists and active < 2:
    seed('/tmp/zenit-demo-qr')
print('Base de QRControl preparada. Se conserva la asistencia existente.')
