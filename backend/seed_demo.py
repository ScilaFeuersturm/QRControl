"""Crea diez compras pagadas solo en un evento PRUEBA. Nunca toca el cupo real."""
import argparse
import json
import secrets
from pathlib import Path
from sqlalchemy import select
from database import events, orders, transaction, initialize
from main import engine, CAPACITY, now, require_event_slot
from ticket_design import render_ticket

DEMO_NAME='PRUEBA · QRControl'
NAMES=['Ana García','Bruno López','Carla Pérez','Diego Ruiz','Elena Díaz','Facundo Soto','Gabriela Ríos','Hugo Torres','Inés Molina','Julián Costa']

def seed(output, reset=False):
    initialize(engine,CAPACITY)
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    with transaction(engine, quota=True) as db:
        event=db.execute(select(events).where(events.c.name==DEMO_NAME)).mappings().first()
        if event is None:
            require_event_slot(db)
            result=db.execute(events.insert().values(name=DEMO_NAME,date_label='ENSAYO · Datos ficticios',venue='Evento de prueba · Sin acceso real',capacity=30))
            event=db.execute(select(events).where(events.c.id==result.inserted_primary_key[0])).mappings().one()
    with transaction(engine,event['id']) as db:
        existing=list(db.execute(select(orders).where(orders.c.event_id==event['id']).order_by(orders.c.id)).mappings())
        if not existing:
            for i,name in enumerate(NAMES):
                db.execute(orders.insert().values(event_id=event['id'],name=name,phone='',table_name=str(i//2+1),quantity=(i%3)+1,paid=True,token=secrets.token_urlsafe(32),admitted_count=0,created_at=now()))
        elif reset:
            # Rotar tokens evita que las capturas del ensayo anterior sigan siendo válidas.
            for row in existing:
                db.execute(orders.update().where(orders.c.id==row['id']).values(token=secrets.token_urlsafe(32),admitted_count=0,used_at=None))
        rows=list(db.execute(select(orders).where(orders.c.event_id==event['id']).order_by(orders.c.id)).mappings())
        manifest={'event_id':event['id'],'event_name':DEMO_NAME,'tickets':[]}
        for i,row in enumerate(rows,1):
            filename=f'{i:02d}-entrada-prueba.png'
            (output/filename).write_bytes(render_ticket(event,row,demo=True))
            manifest['tickets'].append({'id':row['id'],'name':row['name'],'quantity':row['quantity'],'code':'QRCONTROL:'+row['token'],'file':filename})
        (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
        (output/'LEEME.txt').write_text(f'Seleccionar el evento {DEMO_NAME} (ID {event["id"]}) en la app. Son 10 QR y 19 plazas. No sirven para el evento real. Usar la misma base de datos con la que se generaron. Para repetir: ejecutar seed_demo.py --reset --output RUTA y reemplazar las imágenes anteriores.\n')
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='demo-qr');parser.add_argument('--reset',action='store_true');args=parser.parse_args()
    result=seed(args.output,args.reset)
    print(f'Generados {len(result["tickets"])} QR para evento de prueba ID {result["event_id"]}.')
