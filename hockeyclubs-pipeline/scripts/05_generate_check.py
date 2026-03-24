#!/usr/bin/env python3
"""
05_generate_check.py — Genereer een visuele HTML check-pagina.

Wat doet dit script:
- Leest de kleurdata en logo mapping
- Genereert een HTML-pagina met per club: logo + 2 kleurblokken + kleurnamen
- Handig om snel visueel te checken of de kleuren kloppen

Gebruik:
    python scripts/05_generate_check.py

Output:
    check/kleur_check.html (open in browser)
"""

import json
import base64
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
LOGOS_DIR = BASE_DIR / "logos"
CHECK_DIR = BASE_DIR / "check"
CHECK_DIR.mkdir(exist_ok=True)


def logo_to_base64(logo_path: Path) -> str | None:
    """Converteer een logo naar base64 data URL voor inline in HTML."""
    if not logo_path.exists():
        return None
    try:
        with open(logo_path, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        return f"data:image/jpeg;base64,{data}"
    except Exception:
        return None


def contrast_color(hex_color: str) -> str:
    """Bepaal of tekst wit of zwart moet zijn op deze achtergrond."""
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    brightness = (r * 299 + g * 587 + b * 114) / 1000
    return "#000000" if brightness > 128 else "#FFFFFF"


def main():
    kleuren_path = DATA_DIR / "club_kleuren.json"
    mapping_path = DATA_DIR / "club_logo_mapping.json"
    
    if not kleuren_path.exists() or not mapping_path.exists():
        print("FOUT: data bestanden ontbreken. Draai eerst stap 01-03.")
        return
    
    with open(kleuren_path, "r", encoding="utf-8") as f:
        kleuren = json.load(f)
    
    with open(mapping_path, "r", encoding="utf-8") as f:
        logo_mapping = {club["slug"]: club for club in json.load(f)}
    
    # Genereer HTML
    cards_html = []
    
    for slug, colors in sorted(kleuren.items()):
        logo_path = LOGOS_DIR / f"{slug}.jpg"
        logo_data = logo_to_base64(logo_path)
        
        kleur_1 = colors["kleur_1"]
        kleur_2 = colors["kleur_2"]
        naam_1 = colors.get("kleur_1_naam", "?")
        naam_2 = colors.get("kleur_2_naam", "?")
        
        logo_img = f'<img src="{logo_data}" alt="{slug}">' if logo_data else '<div class="no-logo">?</div>'
        
        cards_html.append(f"""
        <div class="card">
            <div class="logo">{logo_img}</div>
            <div class="info">
                <div class="name">{slug}</div>
                <div class="colors">
                    <div class="color-block" style="background:{kleur_1}; color:{contrast_color(kleur_1)}">
                        {kleur_1}<br><small>{naam_1}</small>
                    </div>
                    <div class="color-block" style="background:{kleur_2}; color:{contrast_color(kleur_2)}">
                        {kleur_2}<br><small>{naam_2}</small>
                    </div>
                </div>
            </div>
        </div>""")
    
    html = f"""<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <title>Hockeyclubs — Kleur Check</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; }}
        h1 {{ text-align: center; margin-bottom: 10px; color: #333; }}
        .stats {{ text-align: center; color: #666; margin-bottom: 20px; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; max-width: 1400px; margin: 0 auto; }}
        .card {{ background: white; border-radius: 8px; padding: 12px; display: flex; gap: 12px; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .logo {{ width: 50px; height: 50px; flex-shrink: 0; }}
        .logo img {{ width: 50px; height: 50px; object-fit: contain; border-radius: 4px; }}
        .no-logo {{ width: 50px; height: 50px; background: #eee; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 20px; }}
        .info {{ flex: 1; min-width: 0; }}
        .name {{ font-size: 12px; font-weight: 600; color: #333; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
        .colors {{ display: flex; gap: 6px; }}
        .color-block {{ padding: 4px 8px; border-radius: 4px; font-size: 11px; font-family: monospace; min-width: 85px; text-align: center; border: 1px solid rgba(0,0,0,0.1); }}
        .color-block small {{ font-family: -apple-system, sans-serif; opacity: 0.8; }}
    </style>
</head>
<body>
    <h1>Hockeyclubs — Kleur Check</h1>
    <div class="stats">{len(kleuren)} clubs met kleuren geëxtraheerd</div>
    <div class="grid">
        {"".join(cards_html)}
    </div>
</body>
</html>"""
    
    output_path = CHECK_DIR / "kleur_check.html"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    
    print(f"Check-pagina gegenereerd: {output_path}")
    print(f"Open in je browser om de kleuren visueel te controleren.")


if __name__ == "__main__":
    main()
