#!/usr/bin/env python3
"""
01_scrape_logos.py — Scrape hockeygids.nl en bouw een mapping van clubnaam → logo-URL.

Wat doet dit script:
- Haalt de hoofdpagina van hockeygids.nl op (alle 349 clubs staan in de HTML)
- Extraheert per club: naam, adres, slug, en logo-UUID (Supabase storage)
- Slaat op als data/club_logo_mapping.json

Gebruik:
    python scripts/01_scrape_logos.py

Output:
    data/club_logo_mapping.json
"""

import re
import json
import requests
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

HOCKEYGIDS_URL = "https://www.hockeygids.nl/"
SUPABASE_LOGO_BASE = "https://lzaunlcspnggsscgtgkg.supabase.co/storage/v1/object/public/club-logos"


def fetch_page(url: str) -> str:
    """Haal de volledige HTML van een pagina op."""
    print(f"Ophalen: {url}")
    resp = requests.get(url, timeout=30, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    })
    resp.raise_for_status()
    return resp.text


def extract_clubs(html: str) -> list[dict]:
    """
    Parse de HTML en extraheer clubs met hun logo-UUID.
    
    De HTML bevat patronen als:
    <a href="/clubs/{slug}">
        <img ... src="/_next/image?url=...%2Fclub-logos%2F{uuid}.jpg..." />
        <span>Clubnaam</span>
        <span>Adres</span>
    </a>
    
    In de raw HTML zoeken we naar het patroon van logo-UUID + clubslug.
    """
    clubs = []
    
    # Patroon: logo UUID gevolgd door club link
    # De Next.js HTML heeft een structuur waar logo URL en club link dicht bij elkaar staan
    # We zoeken alle club-links met hun bijbehorende logo
    
    # Methode 1: Zoek alle club slugs en logo UUIDs
    # Club links: href="/clubs/{slug}"
    club_slugs = re.findall(r'href="/clubs/([^"]+)"', html)
    
    # Logo UUIDs: club-logos/{uuid}.jpg
    logo_uuids = re.findall(r'club-logos(?:%2F|/)([a-f0-9-]+)\.(?:jpg|png)', html)
    
    # De logo's en clubs komen in dezelfde volgorde voor op de pagina
    # Verwijder duplicaten maar behoud volgorde
    seen_slugs = set()
    unique_slugs = []
    for s in club_slugs:
        if s not in seen_slugs:
            seen_slugs.add(s)
            unique_slugs.append(s)
    
    seen_uuids = set()
    unique_uuids = []
    for u in logo_uuids:
        if u not in seen_uuids:
            seen_uuids.add(u)
            unique_uuids.append(u)
    
    print(f"Gevonden: {len(unique_slugs)} club-slugs, {len(unique_uuids)} logo-UUIDs")
    
    # Match ze op volgorde (ze komen in dezelfde volgorde voor)
    # Soms zijn er meer UUIDs dan slugs (door duplicaten in responsive HTML)
    # We matchen zoveel als we kunnen
    
    # Betere methode: zoek per club-link de dichtstbijzijnde logo-URL
    # HTML structuur: href="/clubs/{slug}" ... club-logos/{uuid}.jpg
    pattern = re.compile(
        r'href="/clubs/([^"]+)"'
        r'.*?'
        r'club-logos(?:%2F|/)([a-f0-9-]+)\.(?:jpg|png)',
        re.DOTALL
    )

    pairs = []
    seen_pairs = set()
    for match in pattern.finditer(html):
        slug = match.group(1)
        uuid = match.group(2)
        # Check dat de afstand niet te groot is (max 3000 chars)
        if match.end() - match.start() < 3000 and slug not in seen_pairs:
            seen_pairs.add(slug)
            pairs.append({
                "slug": slug,
                "logo_uuid": uuid,
                "logo_url": f"{SUPABASE_LOGO_BASE}/{uuid}.jpg"
            })
    
    print(f"Gematched: {len(pairs)} club-logo paren")
    return pairs


def main():
    html = fetch_page(HOCKEYGIDS_URL)
    
    clubs = extract_clubs(html)
    
    if not clubs:
        print("WAARSCHUWING: Geen clubs gevonden. De site structuur is mogelijk veranderd.")
        print("Check of hockeygids.nl nog steeds dezelfde HTML-structuur heeft.")
        return
    
    output_path = DATA_DIR / "club_logo_mapping.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(clubs, f, indent=2, ensure_ascii=False)
    
    print(f"\nOpgeslagen: {output_path}")
    print(f"Totaal: {len(clubs)} clubs met logo-URLs")
    print(f"\nVoorbeeld:")
    for club in clubs[:3]:
        print(f"  {club['slug']} → {club['logo_url']}")


if __name__ == "__main__":
    main()
