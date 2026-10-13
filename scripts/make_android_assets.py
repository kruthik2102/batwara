"""Build Android launcher icons and splash images from the rendered 1024px masters.

Usage: python3 scripts/make_android_assets.py <masters-dir>
Masters (rendered from src/brand.js): full-square.png, full-rounded.png, foreground.png, monochrome.png
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

src = Path(sys.argv[1])
res = Path(__file__).resolve().parent.parent / 'android/app/src/main/res'
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

square = Image.open(src / 'full-square.png').convert('RGBA')
rounded = Image.open(src / 'full-rounded.png').convert('RGBA')
fore = Image.open(src / 'foreground.png').convert('RGBA')
mono = Image.open(src / 'monochrome.png').convert('RGBA')

def circle(img):
    size = img.size[0]
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

for name, k in DENS.items():
    d = res / f'mipmap-{name}'
    d.mkdir(exist_ok=True)
    legacy = round(48 * k)
    inner = round(legacy * 0.92)
    canvas = Image.new('RGBA', (legacy, legacy), (0, 0, 0, 0))
    canvas.paste(rounded.resize((inner, inner), Image.LANCZOS), ((legacy - inner) // 2, (legacy - inner) // 2))
    canvas.save(d / 'ic_launcher.png')
    circ = circle(square.resize((inner, inner), Image.LANCZOS))
    canvas = Image.new('RGBA', (legacy, legacy), (0, 0, 0, 0))
    canvas.paste(circ, ((legacy - inner) // 2, (legacy - inner) // 2), circ)
    canvas.save(d / 'ic_launcher_round.png')
    adaptive = round(108 * k)
    fore.resize((adaptive, adaptive), Image.LANCZOS).save(d / 'ic_launcher_foreground.png')
    mono.resize((adaptive, adaptive), Image.LANCZOS).save(d / 'ic_launcher_monochrome.png')

# Splash images: the icon centred on the app background, light and dark.
def splash(size, bg):
    w, h = size
    img = Image.new('RGBA', (w, h), bg)
    s = round(min(w, h) * 0.26)
    icon = rounded.resize((s, s), Image.LANCZOS)
    img.paste(icon, ((w - s) // 2, (h - s) // 2), icon)
    return img.convert('RGB')

for f in sorted(res.glob('drawable*/splash.png')):
    size = Image.open(f).size
    folder = f.parent.name
    splash(size, (242, 242, 247, 255)).save(f)
    if folder.startswith('drawable-port') or folder.startswith('drawable-land'):
        orient, dens = folder.split('-')[1], folder.split('-')[2]
        night = res / f'drawable-{orient}-night-{dens}'
    else:
        night = res / 'drawable-night'
    night.mkdir(exist_ok=True)
    splash(size, (0, 0, 0, 255)).save(night / 'splash.png')
print('android assets written')
