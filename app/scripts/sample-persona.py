"""Bake approved artwork to XYZ/RGB/seed points. Runtime needs no image or texture.
Usage: python3 scripts/sample-persona.py /absolute/path/reference.ppm
Depth is an artistic relief estimate, not recovered rear-side geometry.
"""
import sys, math, random, struct
from pathlib import Path
raw=Path(sys.argv[1]).read_bytes()
magic, dimensions, maximum, pixels=raw.split(b'\n',3)
assert magic==b'P6' and maximum==b'255'
w,h=map(int,dimensions.split())
rng=random.Random(42)
points=[]
# Dense, jittered grid preserves facial features and original colors.
step=2.1
for j in range(int(h/step)):
    for i in range(int(w/step)):
        py=(j+rng.random())*step
        v=py/h
        px=(i+rng.random())*step
        u=px/w
        offset=(min(h-1,int(py))*w+min(w-1,int(px)))*3
        r,g,b=pixels[offset:offset+3]
        light=max(r,g,b)/255
        # Exclude black backdrop; retain hair, shoulders, scattered light and reflection.
        if light<.105 or v>.875 or abs(u-.5)>.39: continue
        # Keep the character silhouette, not the top-left beam or floor reflection.
        head=((u-.51)/.19)**2+((v-.29)/.30)**2 < 1
        hair=.30<v<.64 and abs(u-.51)<.205
        shoulders=.49<v<.76 and abs(u-.51)<(.17+(v-.49)*.73)
        if not (head or hair or shoulders): continue
        edge=max(0,min(1,(light-.105)/.12))
        if rng.random()>edge: continue
        x=(u-.5)*3.2
        y=(.45-v)*2.0
        face=math.exp(-((u-.51)/.135)**4-((v-.32)/.25)**4)
        nose=math.exp(-((u-.51)/.025)**2-((v-.32)/.065)**2)
        z=.24*face+.095*nose+.025*light
        if v>.72: z=-.08
        # Orthographic projection keeps front view exactly aligned with reference pixels.
        points.extend((x,y,z,r/255,g/255,b/255,rng.random(),.55+rng.random()**3*2.6,0.0))
# Independent volume of sparks above the floor, not sampled reflection pixels.
for i in range(3200):
    a=rng.random()*math.tau; radius=math.sqrt(rng.random())*1.12
    x=math.cos(a)*radius; z=math.sin(a)*radius*.38
    y=-.68+rng.random()**3*.14
    warm=rng.random()>.92
    points.extend((x,y,z,.9 if warm else .43,.66 if warm else .76,.35 if warm else .86,rng.random(),.65+rng.random()**4*3.2,1.0))
out=Path('public/persona/quiet-contact.points')
out.write_bytes(struct.pack('<'+'f'*len(points),*points))
print(f'{len(points)//9:,} particles; {out.stat().st_size:,} bytes')
