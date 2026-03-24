#!/usr/bin/env python3
"""
02_download_logos.py — Download alle clublogo's van Supabase storage.

Wat doet dit script:
- Leest data/club_logo_mapping.json (output van stap 01)
- Download elk logo naar logos/{slug}.jpg
- Skipt logo's die al bestaan (tenzij --force)
- Resize naar 400x400 voor consistente analyse

Gebruik:
    python scripts/02_download_logos.py           # download alleen nieuwe
    python scripts/02_download_logos.py --force    # download alles opnieuw

Input:
    data/club_logo_mapping.json

Output:
    logos/{slug}.jpg (per club)
"""

import json
import sys
import time
import requests
from pathlib import Path
from PIL import Image
from io import BytesIO

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
LOGOS_DIR = BASE_DIR / "logos"
LOGOS_DIR.mkdir(exist_ok=True)

LOGO_SIZE = (400, 400)
TIMEOUT = 15


def download_logo(url: str, output_path: Path, resize: tuple = LOGO_SIZE) -> bool:
    """Download een logo, resize het, en sla op als JPG."""
    try:
        resp = requests.get(url, timeout=TIMEOUT, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        })
        resp.raise_for_status()
        
        img = Image.open(BytesIO(resp.content))
        
        # Converteer naar RGB (sommige logo's zijn RGBA/PNG)
        if img.mode in ("RGBA", "P"):
            # Maak witte achtergrond voor transparante logo's
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[3] if img.mode == "RGBA" else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")
        
        # Resize met behoud van aspect ratio
        img.thumbnail(resize, Image.LANCZOS)
        
        # Sla op als JPG
        img.save(output_path, "JPEG", quality=90)
        return True
        
    except Exception as e:
        print(f"  FOUT: {e}")
        return False


def main():
    force = "--force" in sys.argv
    
    mapping_path = DATA_DIR / "club_logo_mapping.json"
    if not mapping_path.exists():
        print("FOUT: data/club_logo_mapping.json niet gevonden.")
        print("Draai eerst: python scripts/01_scrape_logos.py")
        sys.exit(1)
    
    with open(mapping_path, "r", encoding="utf-8") as f:
        clubs = json.load(f)
    
    print(f"Logo's downloaden voor {len(clubs)} clubs...")
    if force:
        print("(--force: alle logo's worden opnieuw gedownload)")
    print()
    
    success = 0
    skipped = 0
    failed = 0
    
    for i, club in enumerate(clubs, 1):
        slug = club["slug"]
        logo_url = club["logo_url"]
        output_path = LOGOS_DIR / f"{slug}.jpg"
        
        if output_path.exists() and not force:
            skipped += 1
            continue
        
        print(f"[{i}/{len(clubs)}] {slug}...", end=" ")
        
        if download_logo(logo_url, output_path):
            print("OK")
            success += 1
        else:
            failed += 1
        
        # Kleine pauze om de server niet te overbelasten
        time.sleep(0.2)
    
    print(f"\nKlaar!")
    print(f"  Gedownload: {success}")
    print(f"  Overgeslagen (bestond al): {skipped}")
    print(f"  Mislukt: {failed}")


if __name__ == "__main__":
    main()
