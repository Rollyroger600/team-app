#!/usr/bin/env python3
"""
06_update_supabase.py — Push kleuren en logo-URLs naar de clubs_registry tabel in Supabase.

Wat doet dit script:
- Laadt alle clubs_registry rijen op (id, name)
- Matcht elke slug uit club_kleuren.json op naam (fuzzy) naar een registry-rij
- Update primary_color, secondary_color en logo_url op gematchte rijen
- Respecteert handmatige overrides (primary_color al ingevuld + --no-force)

Gebruik:
    python scripts/06_update_supabase.py             # kleuren + logo's updaten
    python scripts/06_update_supabase.py --dry-run   # toon wat er zou gebeuren
    python scripts/06_update_supabase.py --force     # overschrijf ook al ingevulde kleuren

Input:
    data/club_kleuren.json
    data/club_logo_mapping.json
    .env
"""

import json
import sys
import os
import re
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

load_dotenv(BASE_DIR / ".env")


def slugify(name: str) -> str:
    name = name.lower().strip()
    name = re.sub(r'\([^)]*\)', '', name)
    name = re.sub(r'[^a-z0-9\s]', '', name)
    name = re.sub(r'\s+', '-', name.strip())
    return name


def find_best_match(registry_name: str, slug_map: dict) -> str | None:
    """Match een clubs_registry naam op een slug uit de kleurendata."""
    candidate = slugify(registry_name)

    if candidate in slug_map:
        return candidate

    for slug in slug_map:
        if candidate in slug or slug in candidate:
            return slug

    first_word = candidate.split('-')[0] if '-' in candidate else candidate
    if len(first_word) > 3:
        for slug in slug_map:
            if slug.startswith(first_word) or first_word in slug:
                return slug

    return None


def main():
    force   = "--force"   in sys.argv
    dry_run = "--dry-run" in sys.argv

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    clubs_table  = os.getenv("SUPABASE_CLUBS_TABLE", "clubs_registry")

    if not supabase_url or not supabase_key:
        print("FOUT: SUPABASE_URL en SUPABASE_SERVICE_KEY moeten in .env staan.")
        sys.exit(1)

    from supabase import create_client
    sb = create_client(supabase_url, supabase_key)

    # Laad kleurendata
    with open(DATA_DIR / "club_kleuren.json", encoding="utf-8") as f:
        kleuren = json.load(f)

    # Laad logo-mapping (slug → logo_url)
    logo_url_map = {}
    logo_mapping_path = DATA_DIR / "club_logo_mapping.json"
    if logo_mapping_path.exists():
        with open(logo_mapping_path, encoding="utf-8") as f:
            logo_mapping = json.load(f)
        logo_url_map = {c["slug"]: c["logo_url"] for c in logo_mapping if "logo_url" in c}
        print(f"Logo-mapping geladen: {len(logo_url_map)} clubs")

    print(f"Supabase: {supabase_url}")
    print(f"Tabel:    {clubs_table}")
    print(f"Clubs met kleuren: {len(kleuren)}")
    if dry_run:
        print("(DRY RUN — er wordt niks gewijzigd)\n")

    # Haal alle registry-rijen op (pagineren voor grote tabellen)
    print("Registry ophalen...")
    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        resp = sb.table(clubs_table).select("id, name, primary_color").range(offset, offset + page_size - 1).execute()
        batch = resp.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    print(f"Registry-rijen gevonden: {len(all_rows)}\n")

    # Bouw slug-map voor matching
    slug_map = set(kleuren.keys())

    updated  = 0
    skipped  = 0
    no_match = 0
    errors   = 0

    print("=== Kleuren + logo's updaten ===")
    for row in all_rows:
        row_id   = row["id"]
        name     = row["name"] or ""
        has_color = bool(row.get("primary_color"))

        # Sla over als al ingevuld en niet --force
        if has_color and not force:
            skipped += 1
            continue

        matched_slug = find_best_match(name, slug_map)
        if not matched_slug:
            no_match += 1
            continue

        colors = kleuren[matched_slug]
        logo_url = logo_url_map.get(matched_slug)

        if dry_run:
            if updated < 5:
                logo_str = logo_url or "(geen logo)"
                print(f"  (dry run) {name!r} → {matched_slug}: {colors['kleur_1']} + {colors['kleur_2']} | {logo_str}")
            updated += 1
            continue

        try:
            update_data = {
                "primary_color":   colors["kleur_1"],
                "secondary_color": colors["kleur_2"],
            }
            if logo_url:
                update_data["logo_url"] = logo_url
            sb.table(clubs_table).update(update_data).eq("id", row_id).execute()
            updated += 1
        except Exception as e:
            print(f"  FOUT bij '{name}': {e}")
            errors += 1

    print(f"\nResultaat:")
    print(f"  Geüpdatet:                  {updated}")
    print(f"  Overgeslagen (al ingevuld): {skipped}")
    print(f"  Geen match gevonden:        {no_match}")
    if errors:
        print(f"  Fouten:                     {errors}")

    if dry_run:
        print(f"\n(DRY RUN — draai zonder --dry-run om echt te updaten)")
        print(f"  Tip: gebruik --force om ook al ingevulde kleuren te overschrijven")


if __name__ == "__main__":
    main()
