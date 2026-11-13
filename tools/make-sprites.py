"""បង្កើតរូប sprite តួអង្គ ពីស្រទាប់ LPC (Liberated Pixel Cup)
ប្រភព៖ https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
អាជ្ញាប័ណ្ណ៖ CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 — សូមមើល assets/sprites/CREDITS.csv
របៀបប្រើ៖ python3 tools/make-sprites.py /path/to/lpc/spritesheets"""
import sys, os, csv
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/lpc/spritesheets"
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "sprites")
SKIN = {"tan": (0.84, 0.66, 0.50), "med": (0.95, 0.80, 0.66), "light": (1, 0.96, 0.92)}
HAIR = {"black": (30, 24, 20), "dark": (60, 42, 30), "brown": (110, 70, 40), "red": (140, 70, 35), "grey": (150, 150, 150), "white": (232, 232, 228)}
def hx(h): h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def L(p): return Image.open(os.path.join(SRC, p)).convert("RGBA")
def mul(im, f):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a: px[x, y] = (int(r*f[0]), int(g*f[1]), int(b*f[2]), a)
    return im
def tint(im, rgb, lift=1.15):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a:
                l = min(1, (0.3*r + 0.59*g + 0.11*b) / 255 * lift)
                px[x, y] = (int(rgb[0]*l), int(rgb[1]*l), int(rgb[2]*l), a)
    return im
def hair(im, rgb):
    px = im.load(); lum = []
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a: lum.append(0.3*r + 0.59*g + 0.11*b)
    mx = max(lum) if lum else 255
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a:
                k = 0.55 + 0.6 * (0.3*r + 0.59*g + 0.11*b) / mx
                px[x, y] = tuple(min(255, int(c*k)) for c in rgb) + (a,)
    return im
def eyes(im):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and b > r + 20 and g > r: px[x, y] = (45, 30, 22, a)
    return im
def build(c):
    out = Image.new("RGBA", (576, 256))
    out.alpha_composite(mul(L("body/bodies/male/walk.png"), SKIN[c["skin"]]))
    out.alpha_composite(L("feet/sandals/male/walk.png"))
    rgb = hx(c["robe"])
    if c["outfit"] == "robe":
        out.alpha_composite(tint(L("torso/clothes/longsleeve/longsleeve/male/walk.png"), rgb))
        out.alpha_composite(tint(L("torso/clothes/robe/female/walk/white.png"), rgb))
        out.alpha_composite(L("torso/waist/belt_robe/female/walk/white.png") if c.get("belt") else Image.new("RGBA", (576, 256)))
    else:
        out.alpha_composite(tint(L("legs/pants/male/walk.png"), hx(c.get("pants", "#2a2a30")), 0.9))
        out.alpha_composite(tint(L("torso/clothes/longsleeve/longsleeve/male/walk.png"), rgb))
    head = "head/heads/human/male_elderly/walk.png" if c.get("old") else "head/heads/human/male/walk.png"
    out.alpha_composite(eyes(mul(L(head), SKIN[c["skin"]])))
    if c.get("beard"): out.alpha_composite(hair(L("beards/beard/%s/walk.png" % c["beard"]), HAIR[c["hc"]]))
    out.alpha_composite(hair(L("hair/%s/adult/walk.png" % c["hair"]), HAIR[c["hc"]]))
    return out
C = lambda robe, skin="med", hair="plain", hc="dark", beard=None, old=False, outfit="robe", **k: dict(robe=robe, skin=skin, hair=hair, hc=hc, beard=beard, old=old, outfit=outfit, **k)
CHARS = {
  "player":     C("#3b6fb6", "tan", "plain", "black", outfit="shirt"),
  "teacher":    C("#f0ece0", "tan", "balding", "white", old=True, outfit="shirt", pants="#3a3a44"),
  "peter":      C("#c0703a", "med", "messy1", "dark", "medium", belt=1),
  "polycarp":   C("#7b6aa8", "med", "balding", "white", "medium", old=True),
  "irenaeus":   C("#3f7a6b", "med", "plain", "dark", "basic", belt=1),
  "merchant":   C("#6b5b3a", "med", "messy1", "black", "basic"),
  "athanasius": C("#8a3b3b", "med", "plain", "black", "medium"),
  "official":   C("#b08a2e", "med", "plain", "dark"),
  "monk":       C("#5a4a3a", "light", "balding", "brown"),
  "pilgrim":    C("#4a6b5a", "med", "messy1", "brown", "basic"),
  "patrick":    C("#2f6b3a", "light", "plain", "red", "medium", belt=1),
  "soldier":    C("#6e2b2b", "light", "plain", "brown", outfit="shirt", pants="#4a3a2a"),
  "crusader":   C("#9a9a9a", "light", "plain", "brown", outfit="shirt", pants="#5a5a60"),
  "scholar":    C("#3a5a8a", "med", "plain", "black", "medium"),
  "francis":    C("#7a5a3a", "light", "balding", "brown", "basic", belt=1),
  "anselm":     C("#2a3a6e", "light", "balding", "grey", old=True),
  "wycliffe":   C("#5a3a2a", "light", "balding", "grey", "medium", old=True),
  "hus":        C("#3a4a6e", "light", "plain", "dark", "medium"),
  "tetzel":     C("#8a1a1a", "light", "balding", "brown", belt=1),
  "luther":     C("#2a2a2a", "light", "plain", "brown"),
  "luther2":    C("#2a2a2a", "light", "plain", "brown"),
  "calvin":     C("#1a1a2a", "light", "plain", "dark", "medium"),
  "tyndale":    C("#3a2a1a", "light", "plain", "brown", "basic"),
  "pilgrimf":   C("#2a2a2a", "light", "plain", "brown", outfit="shirt", pants="#2a2a2a"),
  "farmer":     C("#5a4a2a", "light", "messy1", "brown", "basic", outfit="shirt", pants="#4a3a2a"),
  "jesuit":     C("#1a1a1a", "light", "plain", "dark"),
  "deist":      C("#6a6a8a", "light", "plain", "white", outfit="shirt", pants="#3a3a4a"),
  "wesley":     C("#1a1a1a", "light", "plain", "grey"),
  "carey":      C("#4a3a2a", "light", "balding", "brown", outfit="shirt", pants="#2a2a2a"),
  "student":    C("#2a5a8a", "light", "plain", "brown", outfit="shirt", pants="#2a2a30"),
  "elder":      C("#6a5a3a", "tan", "balding", "white", old=True, outfit="shirt", pants="#3a3a3a"),
  "youth":      C("#3a6a8a", "tan", "messy1", "black", outfit="shirt", pants="#1a1a2a"),
}
if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for k, c in CHARS.items():
        build(c).save(os.path.join(OUT, k + ".png"), optimize=True)
    # កំណត់ត្រាអ្នកនិពន្ធ (attribution) សម្រាប់ស្រទាប់ដែលបានប្រើ
    used = ["body/bodies/male/", "feet/sandals/male/", "torso/clothes/longsleeve/longsleeve/male/", "torso/clothes/robe/female/",
            "torso/waist/belt_robe/female/", "legs/pants/male/", "head/heads/human/male/", "head/heads/human/male_elderly/",
            "beards/beard/basic/", "beards/beard/medium/", "hair/plain/adult/", "hair/balding/adult/", "hair/messy1/adult/"]
    rows = list(csv.reader(open(os.path.join(SRC, "..", "CREDITS.csv"), encoding="utf-8")))
    keep = [rows[0]] + [r for r in rows[1:] if any(r[0].strip().startswith(u) for u in used) and "walk" in r[0]]
    csv.writer(open(os.path.join(OUT, "CREDITS.csv"), "w", encoding="utf-8", newline="")).writerows(keep)
    print(len(CHARS), "sprites,", len(keep) - 1, "credit rows")
