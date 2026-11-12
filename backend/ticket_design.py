"""Entrada de composición propia; QR y datos siempre se dibujan desde el servidor."""
import io
import math
import os
import random
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont

GOLD = '#EAC780'
WHITE = '#FFF6DF'

def font(size, serif=False, italic=False):
    candidates = [os.getenv('TICKET_SERIF_FONT' if serif else 'TICKET_FONT', '')]
    if serif:
        candidates += ['/System/Library/Fonts/Supplemental/Georgia Italic.ttf' if italic else '/System/Library/Fonts/Supplemental/Georgia.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf']
    else:
        candidates += ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    for path in candidates:
        if path and Path(path).exists(): return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def render_ticket(event, ticket, demo=False):
    image = Image.new('RGB', (1000, 1600))
    draw = ImageDraw.Draw(image)
    for y in range(1600):
        glow = math.exp(-((y - 430) / 460) ** 2)
        draw.line((0, y, 1000, y), fill=(int(5+7*glow), int(15+30*glow), int(36+45*glow)))
    draw.rounded_rectangle((28, 28, 971, 1571), radius=35, outline=GOLD, width=3)
    draw.rounded_rectangle((43, 43, 956, 1556), radius=28, outline='#675638', width=1)
    rng = random.Random(42)
    for _ in range(110):
        x, y = rng.randrange(70, 930), rng.randrange(65, 650)
        draw.ellipse((x, y, x+2, y+2), fill='#B5A57F')
    for x, y, r in [(135, 365, 28), (866, 365, 28), (110, 1190, 21), (890, 1190, 21)]:
        draw.polygon([(x,y-r),(x+4,y-4),(x+r,y),(x+4,y+4),(x,y+r),(x-4,y+4),(x-r,y),(x-4,y-4)], fill=GOLD)
    # Luna y silueta de costa: fondo gráfico sin reutilizar el QR de la referencia.
    draw.ellipse((758, 132, 869, 243), fill='#EACFA0')
    draw.ellipse((783, 122, 885, 225), fill='#102B4E')
    draw.line((70, 1320, 930, 1320), fill='#445C72', width=2)
    for x in range(74, 930, 26):
        h = rng.randrange(16, 80)
        draw.rectangle((x, 1320-h, x+20, 1320), fill='#152C45')
        draw.rectangle((x+7, 1327, x+11, 1327+h//3), fill='#445266')

    def centered(text, y, size, fill=WHITE, serif=False, italic=False, max_width=820):
        f = font(size, serif, italic)
        while draw.textbbox((0,0), text, font=f)[2] > max_width and size > 16:
            size -= 1; f = font(size, serif, italic)
        draw.text((500,y), text, font=f, fill=fill, anchor='mt')
    def wrapped(text, y, size, max_width=800, line_height=None, max_height=100, **kwargs):
        while True:
            f=font(size, kwargs.get('serif',False), kwargs.get('italic',False))
            lines=[]; line=''
            for word in text.split():
                trial=(line+' '+word).strip()
                if draw.textlength(trial,font=f)>max_width and line:
                    lines.append(line);line=word
                else:line=trial
            if line:lines.append(line)
            height=size+10
            if len(lines)*height<=max_height or size<=16:break
            size-=1
        for i,line in enumerate(lines):centered(line,y+i*height,size,max_width=max_width,**kwargs)
        return y+len(lines)*height

    centered('ZENIT', 85, 50, GOLD, serif=True)
    centered('E V E N T O S', 145, 16, GOLD)
    centered('UNA NOCHE PARA DESCUBRIR', 275, 20, GOLD)
    name=event['name'].removeprefix('PRUEBA · ')
    if name == 'Los Secretos del Destino':
        centered('Los Secretos', 325, 86, GOLD, serif=True, italic=True)
        centered('del Destino', 425, 86, GOLD, serif=True, italic=True)
    else:
        wrapped(name, 335, 70, serif=True, italic=True, fill=GOLD, max_width=770, max_height=175)
    centered('Una noche. Doce puertas. Infinitas posibilidades.', 540, 23, serif=True, italic=True)
    draw.rounded_rectangle((170, 607, 830, 675), radius=10, fill=GOLD)
    qty=ticket['quantity']
    centered('ENTRADA INDIVIDUAL' if qty==1 else f'ENTRADA GRUPAL · {qty} PERSONAS', 622, 30, fill='#101E34', serif=True)
    centered('TITULAR DE LA COMPRA', 714, 18, GOLD)
    wrapped(ticket['name'], 751, 36, max_width=800, line_height=43)
    centered(f"Mesa {ticket['table_name'] or 'sin asignar'} · Válida para {qty} {'persona' if qty==1 else 'personas'}", 855, 25)
    qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=9, border=4)
    qr.add_data('ZENIT:'+ticket['token']);qr.make(fit=True)
    code=qr.make_image(fill_color='black',back_color='white').convert('RGB')
    # Módulos enteros para conservar bordes y zona de silencio.
    module_count=qr.modules_count+8
    scale=330//module_count
    code=code.resize((module_count*scale,module_count*scale),Image.Resampling.NEAREST)
    x=(1000-code.width)//2;y=920
    draw.rounded_rectangle((x-9,y-9,x+code.width+9,y+code.height+9),radius=9,fill=GOLD)
    image.paste(code,(x,y))
    centered('Presentá este QR en recepción', 1275, 23, GOLD, serif=True, italic=True)
    centered(event['date_label'], 1380, 26)
    centered(event['venue'], 1429, 23, GOLD)
    centered('Ingreso parcial habilitado · El saldo se valida en recepción', 1490, 19)
    if demo:
        draw.rectangle((180,164,820,215),fill='#EAC780')
        centered('PRUEBA · NO VÁLIDA PARA EL EVENTO REAL',176,20,fill='#091326')
    buffer=io.BytesIO();image.save(buffer,format='PNG');return buffer.getvalue()
