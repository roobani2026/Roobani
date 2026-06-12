"""Generate a tight horizontal lockup logo for the navbar and crop the existing one."""
import asyncio
import base64
import os
from pathlib import Path
from PIL import Image
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / "backend" / ".env")
OUT = ROOT / "frontend" / "public" / "brand"
API_KEY = os.getenv("EMERGENT_LLM_KEY")
MODEL = "gemini-3.1-flash-image-preview"


async def gen(name: str, prompt: str) -> None:
    chat = (
        LlmChat(api_key=API_KEY, session_id=f"roobani-{name}", system_message="You are a senior brand designer for a luxury private bank.")
        .with_model("gemini", MODEL)
        .with_params(modalities=["image", "text"])
    )
    _, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not images:
        print(f"[{name}] FAILED")
        return
    out = OUT / f"{name}.png"
    out.write_bytes(base64.b64decode(images[0]["data"]))
    print(f"[{name}] saved {out.name}")


PROMPTS = {
    "logo_horizontal": (
        "A bespoke premium horizontal lockup logo for a luxury private bank named Roobani. "
        "On the LEFT a small but precise hexagonal crest mark in warm gold hex C9A84C: a tall narrow "
        "hexagon outline with very fine engraved hairline detail, inside the hexagon an intricately "
        "interlaced letter R formed by two overlapping line strokes. To the RIGHT of the crest on the "
        "same horizontal baseline, the wordmark ROOBANI in uppercase wide-tracked refined modern serif "
        "(similar to DM Serif Display but uppercase, generous letter spacing), set in deep navy hex "
        "1A1F3D. The crest height equals the wordmark cap height exactly. Tight crop: minimal "
        "whitespace, the crest and wordmark fill the canvas edge to edge with only a small margin. "
        "Off white background hex FAFAF8. Vector quality, sharp edges, no shadows, no gradients, "
        "perfectly horizontal lockup. The canvas aspect ratio should be wide, about 4 to 1 horizontal. "
        "Crisp, museum quality, suitable for a navigation bar."
    ),
}


async def main() -> None:
    for n, p in PROMPTS.items():
        await gen(n, p)
    # Also produce a tightly cropped version of the existing vertical-lockup logo.
    src = OUT / "logo_v2_crest.png"
    if src.exists():
        im = Image.open(src).convert("RGB")
        bg = (250, 250, 248)
        px = im.load()
        w, h = im.size
        # Find bounding box of non-near-bg pixels
        thresh = 35
        left, top, right, bottom = w, h, 0, 0
        # sample every 4px for speed
        for y in range(0, h, 2):
            for x in range(0, w, 2):
                r, g, b = px[x, y]
                if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > thresh:
                    if x < left: left = x
                    if y < top: top = y
                    if x > right: right = x
                    if y > bottom: bottom = y
        pad = 18
        left = max(0, left - pad); top = max(0, top - pad)
        right = min(w, right + pad); bottom = min(h, bottom + pad)
        im.crop((left, top, right, bottom)).save(OUT / "logo_tight.png")
        print(f"logo_tight saved {right-left}x{bottom-top}")


if __name__ == "__main__":
    asyncio.run(main())
