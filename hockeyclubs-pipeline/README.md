# Hockeyclubs Pipeline — Logo's & Kleuren

Pipeline om voor alle Nederlandse hockeyclubs de clublogo's te downloaden en de 2 dominante clubkleuren te extracten als hex-codes.

## Quickstart

```bash
# 1. Installeer dependencies
cd hockeyclubs-pipeline
pip install -r requirements.txt

# 2. Scrape logo-URLs van hockeygids.nl
python scripts/01_scrape_logos.py

# 3. Download alle logo's
python scripts/02_download_logos.py

# 4. Extraheer kleuren uit de logo's
python scripts/03_extract_colors.py

# 5. Verrijk het Excel-bestand (optioneel)
#    Kopieer eerst je hockeyclubs_nederland.xlsx naar data/
python scripts/04_enrich_excel.py

# 6. Genereer visuele check-pagina
python scripts/05_generate_check.py
#    → Open check/kleur_check.html in je browser

# 7. Push naar Supabase (optioneel)
#    Kopieer eerst .env.example naar .env en vul je credentials in
python scripts/06_update_supabase.py --dry-run          # test eerst
python scripts/06_update_supabase.py --upload-logos      # logo's + kleuren
```

## Mappenstructuur

```
hockeyclubs-pipeline/
├── README.md                   # Dit bestand
├── requirements.txt            # Python dependencies
├── .env.example                # Template voor Supabase credentials
├── .env                        # Jouw credentials (NIET committen!)
│
├── scripts/
│   ├── 01_scrape_logos.py      # Scrape hockeygids.nl → logo mapping
│   ├── 02_download_logos.py    # Download logo's van Supabase storage
│   ├── 03_extract_colors.py    # Extraheer kleuren uit logo's (KMeans)
│   ├── 04_enrich_excel.py      # Voeg kleuren toe aan Excel
│   ├── 05_generate_check.py    # Genereer visuele HTML check
│   └── 06_update_supabase.py   # Push naar Supabase database
│
├── data/
│   ├── club_logo_mapping.json  # Clubnaam → logo-URL (output stap 01)
│   ├── club_kleuren.json       # Clubnaam → hex-codes (output stap 03)
│   └── hockeyclubs_nederland.xlsx  # Input Excel (kopieer hier naartoe)
│
├── logos/                      # Gedownloade club-logo's (output stap 02)
│   ├── hc-bloemendaal.jpg
│   └── ...
│
└── check/
    └── kleur_check.html        # Visuele check-pagina (output stap 05)
```

## Per script

### 01_scrape_logos.py
Scrapet de hoofdpagina van hockeygids.nl en extraheert per club de logo-URL uit Supabase storage. Output: `data/club_logo_mapping.json`.

### 02_download_logos.py
Downloadt elk logo en slaat op als `logos/{slug}.jpg`. Bestaande logo's worden overgeslagen (tenzij `--force`).

```bash
python scripts/02_download_logos.py           # alleen nieuwe
python scripts/02_download_logos.py --force    # alles opnieuw
```

### 03_extract_colors.py
Analyseert elk logo met KMeans clustering:
1. Filtert wit/zwart/grijs-achtige pixels eruit
2. Clustert resterende pixels in 6 groepen
3. Pakt de top-2 meest voorkomende kleuren
4. Converteert naar hex-codes + Nederlandse kleurnaam

Output: `data/club_kleuren.json`

### 04_enrich_excel.py
Voegt kleurkolommen toe aan het bestaande Excel-bestand. Matcht op clubnaam (fuzzy matching). **Respecteert handmatige overrides** — rijen met `kleur_bron = "handmatig"` worden niet overschreven.

```bash
python scripts/04_enrich_excel.py
python scripts/04_enrich_excel.py --input /pad/naar/excel.xlsx
python scripts/04_enrich_excel.py --force   # overschrijf ook handmatige
```

### 05_generate_check.py
Maakt een HTML-pagina waar je snel door alle clubs kunt scrollen. Per club zie je: logo + 2 kleurblokken met hex-code en kleurnaam. Open `check/kleur_check.html` in je browser.

### 06_update_supabase.py
Pusht de resultaten naar je Supabase project. Vereist `.env` met credentials.

```bash
python scripts/06_update_supabase.py --dry-run           # test eerst
python scripts/06_update_supabase.py                      # alleen kleuren
python scripts/06_update_supabase.py --upload-logos        # ook logo's naar storage
python scripts/06_update_supabase.py --force               # overschrijf handmatige
```

## Supabase tabel setup

Voeg deze kolommen toe aan je `clubs` tabel (of maak een nieuwe):

```sql
-- Als je een nieuwe tabel maakt:
CREATE TABLE clubs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    naam TEXT,
    adres TEXT,
    postcode TEXT,
    plaats TEXT,
    kleur_1 TEXT,          -- Hex-code primaire kleur, bijv. "#FF6600"
    kleur_2 TEXT,          -- Hex-code secundaire kleur, bijv. "#FFFFFF"
    kleur_1_naam TEXT,     -- Nederlandse kleurnaam, bijv. "oranje"
    kleur_2_naam TEXT,     -- Nederlandse kleurnaam, bijv. "wit"
    logo_url TEXT,         -- URL naar logo in Supabase Storage
    kleur_bron TEXT,       -- "logo_analyse" of "handmatig"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Als je kolommen wilt toevoegen aan een bestaande tabel:
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kleur_1 TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kleur_2 TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kleur_1_naam TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kleur_2_naam TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kleur_bron TEXT DEFAULT 'logo_analyse';
```

## Herhaalbaarheid

De pipeline is ontworpen om herhaald te draaien:

- **Nieuwe clubs toevoegen**: Voeg ze toe aan je Excel, draai stap 01-06 opnieuw
- **Logo's updaten**: Draai stap 02 met `--force`, dan 03-06
- **Handmatige overrides behouden**: Zet `kleur_bron` op `"handmatig"` in de database of het Excel. De pipeline overschrijft deze niet (tenzij `--force`)
- **Clubs laten zelf kleuren kiezen**: In je app kunnen clubs `kleur_1` en `kleur_2` overschrijven. Zet `kleur_bron` dan op `"handmatig"` zodat de pipeline ze met rust laat

## Integratie in je project

Deze map kun je als subdirectory in je bestaande project plaatsen:

```
jouw-project/
├── src/
├── public/
├── supabase/
├── hockeyclubs-pipeline/    ← deze map
│   ├── scripts/
│   └── ...
├── package.json
└── ...
```

Voeg `hockeyclubs-pipeline/` toe aan je `.gitignore` voor de `logos/` en `.env`:

```gitignore
# In hockeyclubs-pipeline
hockeyclubs-pipeline/.env
hockeyclubs-pipeline/logos/
hockeyclubs-pipeline/check/
```

## Troubleshooting

**"Geen clubs gevonden" bij stap 01**
→ hockeygids.nl structuur is mogelijk veranderd. Check de HTML handmatig.

**Logo's downloaden mislukt**
→ Check of de Supabase storage URLs nog werken. Open er eentje in je browser.

**Kleuren kloppen niet**
→ Normaal voor ~10-20% van de clubs. Open `check/kleur_check.html`, corrigeer handmatig in het Excel of de database, en zet `kleur_bron` op `"handmatig"`.

**Supabase connectie mislukt**
→ Check je `.env` credentials. Gebruik de service role key, niet de anon key.
