"""Banding meter: finds slow gradients whose 8-bit steps are wide enough to see.
A band edge = neighbouring runs of identical colour, both at least MIN_RUN px long, that differ by at most
2 levels in every channel. Reports per region the number of such edges and the widest run involved."""
import sys
from PIL import Image

MIN_RUN = 12
SPAN = 1.5  # luma levels across the staircase


def runs(line):
    out, start = [], 0
    for i in range(1, len(line) + 1):
        if i == len(line) or line[i] != line[start]:
            out.append((line[start], i - start, start))
            start = i
    return out


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def edges(line):
    """Staircases: at least 3 consecutive wide runs stepping the same way by <= 2 levels."""
    found = []
    r = runs(line)
    i = 0
    while i < len(r) - 2:
        j = i
        direction = 0
        while j + 1 < len(r):
            (a, la, _), (b, lb, sb) = r[j], r[j + 1]
            d = max(abs(x - y) for x, y in zip(a, b))
            s = 1 if lum(b) > lum(a) else -1
            if not (0 < d <= 2 and la >= MIN_RUN and lb >= MIN_RUN) or (direction and s != direction):
                break
            direction = s
            j += 1
        span = abs(lum(r[i][0]) - lum(r[j][0]))
        if j - i >= 2 and span >= SPAN:
            found.append((r[i][2], max(x[1] for x in r[i : j + 1])))
            i = j
        else:
            i += 1
    return found


def scan(im, box, step=6):
    x0, y0, x1, y1 = box
    count, widest, where = 0, 0, None
    for x in range(x0, x1, step):
        col = [im.getpixel((x, y)) for y in range(y0, y1)]
        for pos, w in edges(col):
            count += 1
            if w > widest:
                widest, where = w, (x, y0 + pos)
    for y in range(y0, y1, step):
        row = [im.getpixel((x, y)) for x in range(x0, x1)]
        for pos, w in edges(row):
            count += 1
            if w > widest:
                widest, where = w, (x0 + pos, y)
    return count, widest, where


if __name__ == '__main__':
    im = Image.open(sys.argv[1]).convert('RGB')
    w, h = im.size
    boxes = sys.argv[2:] or ['0,0,%d,%d' % (w, h)]
    for b in boxes:
        box = tuple(int(v) for v in b.split(','))
        c, wd, where = scan(im, box)
        print(f'{b}: band edges {c}, widest step {wd}px at {where}')
