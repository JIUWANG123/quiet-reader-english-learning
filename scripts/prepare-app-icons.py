"""Derive launcher assets from the approved artwork; keep Android's safe inset."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
art = Image.open(root / 'design/quiet-reader-icon-20260912.png').convert('RGB')
assets = root / 'assets'
art.resize((1024, 1024), Image.Resampling.LANCZOS).save(assets / 'icon.png')
art.resize((64, 64), Image.Resampling.LANCZOS).save(assets / 'favicon.png')
background = art.getpixel((0, 0))
canvas = Image.new('RGB', (1024, 1024), background)
# The original artwork already has margins; extra inset protects circular masks.
canvas.paste(art.resize((820, 820), Image.Resampling.LANCZOS), (102, 102))
canvas.save(assets / 'android-icon-foreground.png')
Image.new('RGB', (1024, 1024), background).save(assets / 'android-icon-background.png')
mono = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
draw = ImageDraw.Draw(mono)
draw.polygon([(245,350),(430,325),(512,370),(594,325),(779,350),(779,665),(594,640),(512,685),(430,640),(245,665)], fill='white')
draw.line([(512,385),(512,650)], fill=(0,0,0,0), width=18)
mono.save(assets / 'android-icon-monochrome.png')
for name in ['icon.png', 'favicon.png', 'android-icon-foreground.png', 'android-icon-background.png', 'android-icon-monochrome.png']:
    with Image.open(assets / name) as image:
        image.verify()
print('Verified five launcher assets')
