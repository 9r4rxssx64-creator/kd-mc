#!/usr/bin/env python3
# Génère une icône d'app iOS 1024x1024 OPAQUE (pas d'alpha — exigence App Store)
# à partir d'une couleur de fond. Fond = couleur de l'app, anneau + point dorés
# (identité kd-mc). Aucune dépendance (PNG écrit à la main via zlib).
# Usage : python3 make-icon.py <sortie.png> <#rrggbb>
import sys, struct, zlib

def hex2rgb(h):
    h = (h or '').lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    if len(h) != 6:
        return (11, 16, 32)
    try:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except ValueError:
        return (11, 16, 32)

out = sys.argv[1] if len(sys.argv) > 1 else 'icon.png'
bg = hex2rgb(sys.argv[2] if len(sys.argv) > 2 else '#0b1020')
gold = (232, 184, 48)
gold2 = (255, 207, 107)
W = H = 1024
cx = cy = 512

def px(x, y):
    dx, dy = x - cx, y - cy
    r = (dx * dx + dy * dy) ** 0.5
    if 296 <= r <= 384:
        return gold
    if r <= 118:
        return gold
    if 150 <= r <= 176:
        return gold2
    return bg

rows = bytearray()
for y in range(H):
    rows.append(0)  # filtre 0
    for x in range(W):
        rows += bytes(px(x, y))

def chunk(typ, data):
    return (struct.pack(">I", len(data)) + typ + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff))

png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))  # RGB 8-bit, no alpha
png += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
png += chunk(b"IEND", b"")
open(out, "wb").write(png)
print("icone ecrite:", out, "fond", bg)
