"""Generate all Roobani imagery (hero, illustrations, avatars, abstracts) via Nano Banana."""
import asyncio
import base64
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / "backend" / ".env")

OUT_DIR = ROOT / "frontend" / "public" / "brand"
OUT_DIR.mkdir(parents=True, exist_ok=True)

API_KEY = os.getenv("EMERGENT_LLM_KEY")
MODEL = "gemini-3.1-flash-image-preview"


async def generate(name: str, prompt: str) -> None:
    if (OUT_DIR / f"{name}.png").exists() and name not in FORCE:
        print(f"[{name}] skip (exists)")
        return
    chat = (
        LlmChat(api_key=API_KEY, session_id=f"roobani-asset-{name}", system_message="You are an award winning art director who creates bespoke editorial imagery for luxury financial brands.")
        .with_model("gemini", MODEL)
        .with_params(modalities=["image", "text"])
    )
    msg = UserMessage(text=prompt)
    try:
        text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        print(f"[{name}] ERROR {e}")
        return
    if not images:
        print(f"[{name}] FAILED no images")
        return
    out = OUT_DIR / f"{name}.png"
    out.write_bytes(base64.b64decode(images[0]["data"]))
    print(f"[{name}] saved {out.name}")


FORCE = set(sys.argv[1:])

ASSETS = {
    "hero_visual": (
        "Editorial fine art photograph for a luxury private bank website hero section. "
        "Abstract sculptural composition of layered translucent frosted glass panels and "
        "polished brushed brass geometric shards arranged in a tall vertical ascending stack, "
        "softly catching warm directional sunlight from the upper right, casting long sharp "
        "geometric shadows on a warm off-white seamless paper backdrop. Subtle deep navy and "
        "warm gold reflections in the glass refractions. Shallow depth of field, ultra crisp "
        "focus on the foreground edges, museum quality, magazine cover composition with "
        "generous empty negative space on the left half for text overlay. Light theme, "
        "minimalist, premium, no people, no text, no logos."
    ),
    "step_account": (
        "A bespoke editorial product still life: a single elegant warm cream embossed card "
        "with sharp corners standing upright on a warm off-white surface, beside a brushed "
        "deep navy fountain pen laying horizontally. Soft directional warm light from the right, "
        "minimal composition, generous negative space, sharp focus, no text on the card, "
        "magazine quality, light theme, no people, no logos."
    ),
    "step_plan": (
        "A bespoke editorial product still life: three sharp edged warm cream folio cards "
        "fanned in a precise overlapping arrangement on a warm off-white surface, each card "
        "edged with a thin warm gold hairline, a single small navy geometric mark printed on "
        "the top card. Soft directional warm light, minimal composition, generous negative "
        "space, sharp focus, no text, magazine quality, light theme, no people."
    ),
    "step_fund": (
        "A bespoke editorial product still life: a single warm brass weighted geometric "
        "paperweight cube sitting on a warm off-white surface beside a folded warm cream "
        "ribbon. Soft directional warm light casting a long sharp shadow, minimal composition, "
        "generous negative space, sharp focus, magazine quality, light theme, no people, no text."
    ),
    "step_track": (
        "A bespoke editorial product still life: a single sharp edged warm cream card "
        "standing upright on a warm off-white surface, the card surface engraved with very "
        "fine warm gold hairline ascending line strokes resembling an abstract chart trend. "
        "Soft directional warm light, minimal composition, generous negative space, sharp focus, "
        "no readable text, magazine quality, light theme, no people."
    ),
    "avatar_1": (
        "Editorial portrait headshot of a confident south asian woman in her late 30s with "
        "shoulder length straight black hair, wearing a tailored charcoal blazer over a warm "
        "cream blouse, soft natural studio lighting from the front left, neutral warm off-white "
        "background, gentle composed expression looking slightly off camera, magazine quality, "
        "shallow depth of field, premium private banking aesthetic, light theme."
    ),
    "avatar_2": (
        "Editorial portrait headshot of a distinguished black man in his early 50s with short "
        "salt and pepper hair and a closely trimmed beard, wearing a deep navy tailored suit "
        "with a crisp white shirt, soft natural studio lighting, neutral warm off-white "
        "background, calm confident expression, magazine quality, shallow depth of field, "
        "premium private banking aesthetic, light theme."
    ),
    "avatar_3": (
        "Editorial portrait headshot of a thoughtful east asian man in his early 40s with "
        "short neatly styled black hair and clear rimless glasses, wearing a soft taupe knit "
        "sweater, soft natural studio lighting, neutral warm off-white background, warm "
        "approachable expression, magazine quality, shallow depth of field, premium "
        "private banking aesthetic, light theme."
    ),
    "avatar_4": (
        "Editorial portrait headshot of an elegant middle aged white woman in her late 40s "
        "with chin length straight blonde hair, wearing a refined warm camel turtleneck, "
        "soft natural studio lighting, neutral warm off-white background, composed serious "
        "expression, magazine quality, shallow depth of field, premium private banking "
        "aesthetic, light theme."
    ),
    "about_visual": (
        "Editorial fine art photograph for a private bank about page. Wide architectural "
        "interior of a contemporary private wealth office: warm travertine stone wall on the "
        "right catching directional warm sunlight, a single tall sharp edged glass partition "
        "on the left casting long geometric shadows on a polished warm cream floor, a single "
        "minimalist deep navy lounge chair facing away. Generous negative space, no people, "
        "no text, no logos, magazine quality, light theme, premium serene composition."
    ),
    "auth_visual": (
        "Editorial fine art still life for a private bank login page: a sharp edged tall "
        "translucent frosted glass slab leaning gently against a warm off-white wall, a single "
        "warm brass geometric paperweight cube on the floor beside it casting a long sharp "
        "diagonal shadow from warm directional sunlight. Minimal, serene, generous negative "
        "space, magazine quality, no people, no text, light theme."
    ),
    "plan_foundation": (
        "Editorial abstract still life: a single small smooth river stone resting on a sharp "
        "edged warm cream stone slab in warm directional light, minimal calm composition, "
        "off white background, generous negative space, no text, magazine quality, light theme."
    ),
    "plan_growth": (
        "Editorial abstract still life: three precisely stacked warm cream geometric blocks "
        "of ascending heights on an off white surface in warm directional light casting sharp "
        "geometric shadows, minimal balanced composition, no text, magazine quality, light theme."
    ),
    "plan_accelerator": (
        "Editorial abstract still life: a single sharp edged warm brass rod balanced "
        "diagonally on a warm cream pedestal casting a sharp shadow on an off white surface "
        "in warm directional light, dynamic composition, no text, magazine quality, light theme."
    ),
    "plan_elite": (
        "Editorial abstract still life: a single tall sharp edged translucent frosted glass "
        "shard standing upright on an off white surface beside a small warm brass cube, warm "
        "directional light catching the glass edge, refined composition, no text, magazine "
        "quality, light theme."
    ),
}


async def main() -> None:
    for n, p in ASSETS.items():
        await generate(n, p)


if __name__ == "__main__":
    asyncio.run(main())
