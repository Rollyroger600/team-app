#!/usr/bin/env python3
"""
03_extract_colors.py — Extraheer de 2 dominante kleuren uit elk clublogo.

Wat doet dit script:
- Leest alle logo's uit logos/
- Filtert achtergrondkleuren (wit, zwart, grijs) eruit
- Gebruikt KMeans clustering om de 2 dominante kleuren te vinden
- Slaat resultaten op als data/club_kleuren.json

Algoritme:
1. Open logo, sample pixels
2. Converteer naar HSV, filter lage-saturatie pixels (wit/grijs/zwart)
3. KMeans clustering (k=6) op de kleurige pixels
4. Sorteer clusters op grootte
5. Neem de top-2 als primaire en secundaire kleur
6. Als er maar 1 kleur overblijft → secundair wordt wit of zwart

Gebruik:
    python scripts/03_extract_colors.py

Input:
    logos/{slug}.jpg
    data/club_logo_mapping.json

Output:
    data/club_kleuren.json
"""

import json
import colorsys
from pathlib import Path
import numpy as np
from PIL import Image
from sklearn.cluster import KMeans
from collections import Counter

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
LOGOS_DIR = BASE_DIR / "logos"

# Configuratie
N_CLUSTERS = 8          # Aantal clusters voor KMeans (meer = betere keuze voor kleur 2)
MIN_SATURATION = 0.12   # Minimum saturatie (0-1) om als "kleur" te tellen
MIN_BRIGHTNESS_LOW = 0.10   # Onder deze brightness = zwart
MAX_BRIGHTNESS_HIGH = 0.95  # Boven deze brightness + lage sat = wit
MIN_CLUSTER_RATIO = 0.02    # Minimum percentage pixels in een cluster
MIN_COLOR_DISTANCE = 80     # Minimum Euclidean RGB-afstand tussen kleur 1 en kleur 2
MIN_SAT_FOR_COLOR2 = 0.25   # Minimum saturatie voor kleur 2 (filtert muffe tinten eruit)
WHITE_BLACK_THRESHOLD = 0.05  # Minimaal aandeel neutrale pixels om wit/zwart te kiezen


def rgb_to_hex(r: int, g: int, b: int) -> str:
    """RGB naar hex string."""
    return f"#{r:02X}{g:02X}{b:02X}"


def color_distance(rgb1: tuple, rgb2: tuple) -> float:
    """Euclidean afstand in RGB ruimte (0–441)."""
    return float(np.sqrt(sum((a - b) ** 2 for a, b in zip(rgb1, rgb2))))


def is_perceptually_different(rgb1: tuple, rgb2: tuple) -> bool:
    """
    True als twee kleuren visueel duidelijk van elkaar verschillen.
    Vereist voldoende hue-verschil (andere kleur-familie) OF
    voldoende helderheids-verschil (bijv. donker + licht).
    Dit filtert JPEG-artefact-tinten die RGB-afstand halen maar toch "dezelfde" kleur lijken.
    """
    if color_distance(rgb1, rgb2) < MIN_COLOR_DISTANCE:
        return False

    h1, s1, v1 = colorsys.rgb_to_hsv(*[x / 255 for x in rgb1])
    h2, s2, v2 = colorsys.rgb_to_hsv(*[x / 255 for x in rgb2])

    # Hue-verschil (circulair, in graden)
    hue_diff = min(abs(h1 - h2), 1.0 - abs(h1 - h2)) * 360
    # Helderheids-verschil
    value_diff = abs(v1 - v2)

    # Voldoende anders in kleur-familie óf in helderheid
    return hue_diff > 25 or value_diff > 0.35


def dominant_neutral(pixels: np.ndarray) -> dict | None:
    """
    Kijk of er genoeg witte of zwarte pixels in het logo zitten om als kleur 2 te dienen.
    Geeft {'hex', 'rgb', 'ratio', 'naam'} terug of None.
    """
    total = len(pixels)
    whites, blacks = 0, 0
    for p in pixels:
        r, g, b = int(p[0]), int(p[1]), int(p[2])
        _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if v > 0.80 and s < 0.35:  # wit of lichte tint
            whites += 1
        elif v < 0.20:
            blacks += 1

    white_ratio = whites / total
    black_ratio = blacks / total

    if white_ratio >= WHITE_BLACK_THRESHOLD:
        return {"hex": "#FFFFFF", "rgb": (255, 255, 255), "ratio": round(white_ratio, 3), "naam": "wit"}
    if black_ratio >= WHITE_BLACK_THRESHOLD:
        return {"hex": "#000000", "rgb": (0, 0, 0), "ratio": round(black_ratio, 3), "naam": "zwart"}
    return None


def is_neutral(r: int, g: int, b: int) -> bool:
    """Check of een kleur neutraal is (wit, zwart, grijs, of lichte tint)."""
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)

    # Zwart
    if v < MIN_BRIGHTNESS_LOW:
        return True
    # Wit of lichtgrijs
    if v > MAX_BRIGHTNESS_HIGH and s < MIN_SATURATION:
        return True
    # Grijs
    if s < MIN_SATURATION * 0.7:
        return True
    # Lichte tint (pastel / bijna-wit) — bijv. lichtroze of lichtblauw achtergrond in logo
    if v > 0.80 and s < 0.35:
        return True

    return False


def extract_colors(image_path: Path) -> dict:
    """
    Extraheer de 2 dominante kleuren uit een logo.
    
    Returns:
        {
            "kleur_1": "#RRGGBB",
            "kleur_2": "#RRGGBB",
            "kleur_1_naam": "rood",  # best-effort Nederlandse kleurnaam
            "kleur_2_naam": "wit",
        }
    """
    try:
        img = Image.open(image_path).convert("RGB")
    except Exception as e:
        return {"error": str(e)}
    
    # Resize voor snellere analyse
    img.thumbnail((150, 150), Image.LANCZOS)
    pixels = np.array(img).reshape(-1, 3)
    
    if len(pixels) < 10:
        return {"error": "Te weinig pixels"}
    
    # Stap 1: Filter neutrale pixels (wit/zwart/grijs) voor de clustering
    colored_mask = np.array([
        not is_neutral(int(p[0]), int(p[1]), int(p[2])) 
        for p in pixels
    ])
    colored_pixels = pixels[colored_mask]
    
    # Als bijna alles neutraal is, gebruik dan alle pixels
    if len(colored_pixels) < len(pixels) * 0.05:
        # Club heeft waarschijnlijk een zwart-wit logo
        colored_pixels = pixels
        mostly_neutral = True
    else:
        mostly_neutral = False
    
    # Stap 2: KMeans clustering
    n_clusters = min(N_CLUSTERS, len(colored_pixels))
    if n_clusters < 2:
        n_clusters = 2
    
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    kmeans.fit(colored_pixels)
    
    # Stap 3: Sorteer clusters op grootte
    labels = kmeans.labels_
    label_counts = Counter(labels)
    total_pixels = len(colored_pixels)
    
    # Sorteer op frequentie (meest voorkomend eerst)
    sorted_clusters = sorted(
        label_counts.items(), 
        key=lambda x: x[1], 
        reverse=True
    )
    
    # Stap 4a: Kleur 1 — meest dominante gekleurde cluster
    result_colors = []
    for label, count in sorted_clusters:
        center = kmeans.cluster_centers_[label].astype(int)
        r, g, b = int(center[0]), int(center[1]), int(center[2])
        ratio = count / total_pixels
        if ratio < MIN_CLUSTER_RATIO:
            continue
        if not mostly_neutral and is_neutral(r, g, b):
            continue
        result_colors.append({
            "hex": rgb_to_hex(r, g, b),
            "rgb": (r, g, b),
            "ratio": round(ratio, 3),
            "naam": guess_color_name(r, g, b)
        })
        break

    # Fallback: als echt niks gevonden, neem grootste cluster
    if len(result_colors) == 0:
        label, count = sorted_clusters[0]
        center = kmeans.cluster_centers_[label].astype(int)
        r, g, b = int(center[0]), int(center[1]), int(center[2])
        result_colors.append({
            "hex": rgb_to_hex(r, g, b),
            "rgb": (r, g, b),
            "ratio": round(count / total_pixels, 3),
            "naam": guess_color_name(r, g, b)
        })

    # Stap 4b: Kleur 2 — zoek eerst een levendige contrastkleur (hoge saturatie)
    color1_rgb = result_colors[0]["rgb"]

    for label, count in sorted_clusters:
        center = kmeans.cluster_centers_[label].astype(int)
        r, g, b = int(center[0]), int(center[1]), int(center[2])
        ratio = count / total_pixels
        if ratio < MIN_CLUSTER_RATIO:
            continue
        if not mostly_neutral and is_neutral(r, g, b):
            continue
        if not is_perceptually_different(color1_rgb, (r, g, b)):
            continue
        # Eis voldoende saturatie zodat muffe tinten (grijzig-roze, grijzig-blauw) worden overgeslagen
        _, s, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < MIN_SAT_FOR_COLOR2:
            continue
        result_colors.append({
            "hex": rgb_to_hex(r, g, b),
            "rgb": (r, g, b),
            "ratio": round(ratio, 3),
            "naam": guess_color_name(r, g, b)
        })
        break

    # Stap 4c: Geen levendige contrastkleur? Kijk naar wit/zwart in het logo
    if len(result_colors) == 1:
        neutral = dominant_neutral(pixels)
        if neutral:
            result_colors.append(neutral)

    # Stap 4d: Laatste fallback — neem eender welke andere cluster
    if len(result_colors) == 1:
        for label, count in sorted_clusters:
            center = kmeans.cluster_centers_[label].astype(int)
            r, g, b = int(center[0]), int(center[1]), int(center[2])
            if rgb_to_hex(r, g, b) != result_colors[0]["hex"]:
                result_colors.append({
                    "hex": rgb_to_hex(r, g, b),
                    "rgb": (r, g, b),
                    "ratio": round(count / total_pixels, 3),
                    "naam": guess_color_name(r, g, b)
                })
                break
    
    return {
        "kleur_1": result_colors[0]["hex"],
        "kleur_2": result_colors[1]["hex"],
        "kleur_1_naam": result_colors[0]["naam"],
        "kleur_2_naam": result_colors[1]["naam"],
        "kleur_1_ratio": result_colors[0]["ratio"],
        "kleur_2_ratio": result_colors[1]["ratio"],
    }


def guess_color_name(r: int, g: int, b: int) -> str:
    """Best-effort Nederlandse kleurnaam op basis van HSV."""
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    h_deg = h * 360
    
    if v < 0.15:
        return "zwart"
    if s < 0.10 and v > 0.85:
        return "wit"
    if s < 0.15:
        return "grijs"
    
    # Kleurnaam op basis van hue
    if h_deg < 15 or h_deg >= 345:
        return "donkerrood" if v < 0.5 else "rood"
    elif h_deg < 40:
        return "oranje"
    elif h_deg < 70:
        return "geel"
    elif h_deg < 160:
        return "donkergroen" if v < 0.5 else "groen"
    elif h_deg < 200:
        return "lichtblauw" if v > 0.6 else "petrol"
    elif h_deg < 260:
        return "donkerblauw" if v < 0.5 else "blauw"
    elif h_deg < 290:
        return "paars"
    elif h_deg < 345:
        return "roze" if v > 0.6 else "bordeaux"
    
    return "onbekend"


def main():
    mapping_path = DATA_DIR / "club_logo_mapping.json"
    if not mapping_path.exists():
        print("FOUT: data/club_logo_mapping.json niet gevonden.")
        print("Draai eerst: python scripts/01_scrape_logos.py")
        return
    
    with open(mapping_path, "r", encoding="utf-8") as f:
        clubs = json.load(f)
    
    print(f"Kleuren extracten voor {len(clubs)} clubs...")
    print()
    
    results = {}
    success = 0
    missing = 0
    errors = 0
    
    for i, club in enumerate(clubs, 1):
        slug = club["slug"]
        logo_path = LOGOS_DIR / f"{slug}.jpg"
        
        if not logo_path.exists():
            missing += 1
            continue
        
        colors = extract_colors(logo_path)
        
        if "error" in colors:
            print(f"  [{i}] {slug}: FOUT - {colors['error']}")
            errors += 1
            continue
        
        results[slug] = colors
        success += 1
        
        if i % 50 == 0 or i == len(clubs):
            print(f"  [{i}/{len(clubs)}] verwerkt...")
    
    # Opslaan
    output_path = DATA_DIR / "club_kleuren.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"\nKlaar!")
    print(f"  Succesvol: {success}")
    print(f"  Logo ontbreekt: {missing}")
    print(f"  Fouten: {errors}")
    print(f"\nOpgeslagen: {output_path}")
    
    # Toon een paar voorbeelden
    print(f"\nVoorbeelden:")
    for slug, colors in list(results.items())[:5]:
        print(f"  {slug}: {colors['kleur_1']} ({colors['kleur_1_naam']}) + {colors['kleur_2']} ({colors['kleur_2_naam']})")


if __name__ == "__main__":
    main()
