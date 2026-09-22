#!/usr/bin/env python3
# Generates the Envicron adaptive launcher icons from brand/logo.svg on the CI
# runner. No binary assets committed; the SVG is the single source of truth.
import cairosvg, io, os, sys
from PIL import Image

SVG = "brand/logo.svg"
RES = "android/app/src/main/res"
if not os.path.exists(SVG):
    print("brand/logo.svg missing", file=sys.stderr); sys.exit(1)

svg = open(SVG,"rb").read()
def render(px):
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg,
        output_width=px, output_height=px))).convert("RGBA")

dens = {"mdpi":1,"hdpi":1.5,"xhdpi":2,"xxhdpi":3,"xxxhdpi":4}
for d,scale in dens.items():
    os.makedirs(f"{RES}/mipmap-{d}", exist_ok=True)
    c=int(108*scale); fg=Image.new("RGBA",(c,c),(0,0,0,0))
    dp=int(c*0.62); drop=render(dp); o=(c-dp)//2; fg.alpha_composite(drop,(o,o))
    fg.save(f"{RES}/mipmap-{d}/ic_launcher_foreground.png")
    lc=int(48*scale); bg=Image.new("RGBA",(lc,lc),(255,255,255,255))
    d2=int(lc*0.70); dr=render(d2); o2=(lc-d2)//2; bg.alpha_composite(dr,(o2,o2))
    bg.save(f"{RES}/mipmap-{d}/ic_launcher.png")
    bg.save(f"{RES}/mipmap-{d}/ic_launcher_round.png")

os.makedirs(f"{RES}/mipmap-anydpi-v26", exist_ok=True)
xml=('<?xml version="1.0" encoding="utf-8"?>\n'
'<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
'  <background android:drawable="@color/ic_launcher_background"/>\n'
'  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
'</adaptive-icon>\n')
open(f"{RES}/mipmap-anydpi-v26/ic_launcher.xml","w").write(xml)
open(f"{RES}/mipmap-anydpi-v26/ic_launcher_round.xml","w").write(xml)
os.makedirs(f"{RES}/values",exist_ok=True)
open(f"{RES}/values/ic_launcher_background.xml","w").write(
'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
'  <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n')
print("Envicron launcher icons generated")
