"""Generate Bobby illustration assets with gpt-image-2 (medium quality).

Run via: vault-run scripts/gen_bobby_art.py
Outputs land in public/bobby/. Prints progress only, never the key.
"""

import base64
import json
import os
import urllib.request

KEY = "<agent-vault:openai-key>"
OUT = "/Users/Jacky_1/Desktop/stat306_homework/public/bobby"
os.makedirs(OUT, exist_ok=True)

STYLE = (
    "Flat minimal vector illustration in the style of Notion marketing icons. "
    "Character: a round warm marigold-yellow (#FFB110) smiley face with two simple "
    "black dot eyes and a small black smile arc, thin royal-blue (#097FE8) outline "
    "ring around the face. Clean flat shapes, 2-4 solid colors max, no gradients, "
    "no shadows, no texture, generous negative space, sticker-like composition."
)

JOBS = [
    (
        "icon-read.png",
        STYLE
        + " The face sits inside a large solid bright-blue (#097FE8) circle badge, "
        "wearing tiny round reading glasses, looking at a white document page with "
        "simple line drawings of a sofa and a table on it. Pure white background.",
    ),
    (
        "icon-hunt.png",
        STYLE
        + " The face sits inside a large solid marigold (#FFB110) circle badge, "
        "holding a big dark magnifying glass over a small simplified map shape with "
        "two location pins. Face peeking with curious wide eyes. Pure white background.",
    ),
    (
        "icon-negotiate.png",
        STYLE
        + " The face sits inside a large solid coral-red (#F64932) circle badge, with a "
        "white speech bubble next to it containing a black euro sign, confident smirk "
        "expression. Pure white background.",
    ),
    (
        "icon-inspect.png",
        STYLE
        + " The face sits inside a large solid deep-green (#0F7B0F) circle badge, next to "
        "a white clipboard with a big green checkmark on it, proud closed-eye smile. "
        "Pure white background.",
    ),
    (
        "icon-contract.png",
        STYLE
        + " The face sits inside a large solid midnight-navy (#02093A) circle badge, next "
        "to a white contract paper with text lines and a red square seal stamp on it, "
        "satisfied smile. Pure white background.",
    ),
    (
        "bobby-desk.png",
        STYLE
        + " Scene: the marigold round face character working at a simple desk with an open "
        "laptop, a stack of paper catalogs beside it, and a small window behind showing a "
        "flat cargo container ship on water. Background is a solid warm cream (#FFF4DC) "
        "rounded square. Composition centered, lots of breathing room.",
    ),
]


def generate(name: str, prompt: str) -> None:
    body = json.dumps(
        {
            "model": "gpt-image-2",
            "prompt": prompt,
            "size": "1024x1024",
            "quality": "medium",
            "n": 1,
        }
    ).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=body,
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read())
    img = base64.b64decode(data["data"][0]["b64_json"])
    path = os.path.join(OUT, name)
    with open(path, "wb") as f:
        f.write(img)
    print(f"ok {name} {len(img) // 1024}KB")


for filename, job_prompt in JOBS:
    try:
        generate(filename, job_prompt)
    except urllib.error.HTTPError as exc:
        print(f"FAIL {filename}: {exc}")
        print(exc.read().decode()[:600])
    except Exception as exc:  # keep going; report which failed
        print(f"FAIL {filename}: {exc}")

print("done")
