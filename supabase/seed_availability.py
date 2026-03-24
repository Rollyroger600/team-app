#!/usr/bin/env python3
"""
Generates realistic match_availability seed data for all 23 players × 22 matches.
Patterns:
  - Past matches (completed): 100% response rate, ~15-18 available per match
  - Next upcoming (2026-03-29): 100% response rate
  - Near future (Apr): 70-80% response rate
  - Far future (May+): 20-40% response rate
"""

import random
random.seed(42)  # reproducible

# All 23 players: (id, name, availability_rate)
PLAYERS = [
    ("207a5c3c-b449-4606-9798-ef7f1eee2d3c", "Arjen Mulder",      0.90),
    ("1e7c61aa-ff59-49f6-9657-208574db6b80", "Bas Janssen",        0.85),
    ("38fc4d3d-3780-48b0-a89e-09256fa989d5", "Daan Hendriks",      0.92),
    ("2cf0bbd3-5181-43d0-9b2a-0545152a577a", "Dennis Vermeer",     0.70),
    ("91c15511-8c38-478a-8189-47b07d0d9199", "Frank Hoekstra",     0.60),  # vaak afwezig
    ("431289e9-bcbd-4cad-a1bf-537cca3b4adb", "Jeroen Peters",      0.88),
    ("6d26ff64-534d-4676-abd1-fa602da379ae", "Joost Bakker",       0.80),
    ("08a0d6f9-06de-44e1-8cd5-dc21134855e4", "Kevin van Leeuwen",  0.75),
    ("e5e78bb4-4f4f-43d2-a817-290cb31acac2", "Lars van den Berg",  0.93),
    ("dca16666-9005-470e-a747-6c6ebbe1c91e", "Marc Willems",       0.88),
    ("ab306cd2-4992-4ded-84cf-4e9e6494e922", "Martijn Smits",      0.85),
    ("2884821f-5a93-44c0-9128-b39eb115c701", "Michel Brouwers",    0.78),
    ("8c6ee7ee-cd05-4cb4-8d28-67319a7e1b5f", "Niels Bosman",       0.90),
    ("351e5ada-ef07-4eb2-8ac1-5682513df703", "Paul Schouten",      0.82),
    ("e2198933-a831-423d-aa35-6b2dcb1b4406", "Pieter de Groot",    0.88),
    ("55e0fd07-13e9-411c-a0a0-4e9091810240", "Rick van Dijk",      0.92),
    ("c9df2fc4-dbc2-41b3-8169-e1d5c95c5064", "Rogier",             0.95),
    ("3ca0e9dd-cab3-4bf1-a45f-f278d8e94a2e", "Ruben Kuijpers",     0.87),
    ("13e1e489-e737-4dae-9f49-32641bac2674", "Sander de Vries",    0.83),
    ("bb07e5c2-9661-4822-92d6-006117359f91", "Stefan de Jong",     0.88),
    ("c5a92662-93c6-4dd4-ab86-002c904a9089", "Thomas Meijer",      0.80),
    ("a049cbed-daae-4fbc-a79e-f45986377c9f", "Tim van der Berg",   0.72),
    ("d6fdaf32-96dc-49a7-aed2-8033090716c7", "Wouter Visser",      0.90),
]

# Matches: (id, date, response_rate_override)
# past matches → 1.0 response rate, upcoming → partial
MATCHES = [
    ("87394caf-49aa-49d8-b1a1-1c52ba1743ca", "2025-09-07", 1.0),
    ("377a11a1-eb82-40c0-ab9e-d426f1343a86", "2025-09-14", 1.0),
    ("bcf669da-eec6-4c02-a967-7d137a451ce5", "2025-09-21", 1.0),
    ("cbf8a01f-83f7-42b3-8e88-a9a582666ef2", "2025-09-28", 1.0),
    ("f1bcc003-caaf-4bb4-b359-d3d598b0f326", "2025-10-05", 1.0),
    ("2f501f25-a7c8-4851-8cd4-28ff261c880b", "2025-10-12", 1.0),
    ("669b90c8-477b-4cb7-b70c-db2c336a51eb", "2025-10-26", 1.0),
    ("81303d1a-46b3-47df-bdc9-98ebfea26134", "2025-11-02", 1.0),
    ("e1a624b2-6aa0-4028-818d-33fed0c438de", "2025-11-09", 1.0),
    ("21e7c715-69d9-4ab4-a904-b35790582117", "2025-11-16", 1.0),
    ("c16b9b41-d025-4fff-baf2-4d09abf1876e", "2025-11-23", 1.0),
    ("abb1fb61-04b5-47bc-8ab5-1a5f9f85d869", "2026-03-08", 1.0),
    ("6627a5a0-d3d2-4dc5-946d-da62e2ef11e3", "2026-03-15", 1.0),
    ("157727ab-30b1-46e2-a1d4-cdae2bae0c56", "2026-03-22", 1.0),
    # next match — everyone responded
    ("6db370b3-3eeb-48be-9473-9ceb2385bfe0", "2026-03-29", 1.0),
    # upcoming — partial response
    ("9af8c314-640a-4154-af04-742d26e75209", "2026-04-12", 0.78),
    ("2a089db6-f6f4-4fa9-b7da-d75628e1e21b", "2026-04-19", 0.65),
    ("c8643270-b254-45b9-b16a-116151e80bfb", "2026-05-10", 0.48),
    ("6b2c49d6-76eb-4efa-9668-c1e79ad2afe2", "2026-05-17", 0.35),
    ("03f10a22-9bbf-4944-9b9a-c1eff9f2bed3", "2026-05-31", 0.22),
    ("21b7cbfd-d4f7-42ca-9ae1-9e47625222b0", "2026-06-07", 0.18),
    ("6cf14c52-cbe2-42db-b3ed-15d55fac0b1b", "2026-06-14", 0.10),
]

# Notes for unavailable (random sampling)
UNAVAILABLE_NOTES = [
    None, None, None,  # mostly no note
    "Op vakantie",
    "Werk",
    "Verjaardag",
    "Blessure",
    "Familiebezoek",
    "Andere afspraak",
]

MAYBE_NOTES = [
    None, None,
    "Hangt af van werk",
    "Moet nog kijken",
    "Wellicht iets anders",
]

rows = []

for match_id, match_date, match_response_rate in MATCHES:
    for player_id, player_name, avail_rate in PLAYERS:
        # Does this player respond to this match?
        if random.random() > match_response_rate:
            continue  # no response (unknown)

        r = random.random()
        if r < avail_rate:
            status = 'available'
            note = None
        elif r < avail_rate + 0.12:
            status = 'maybe'
            note = random.choice(MAYBE_NOTES)
        else:
            status = 'unavailable'
            note = random.choice(UNAVAILABLE_NOTES)

        note_sql = f"'{note}'" if note else "NULL"
        # responded_at: for past matches spread across the week before
        rows.append(
            f"('{match_id}', '{player_id}', '{status}', {note_sql}, now())"
        )

# Write SQL
sql = "INSERT INTO match_availability (match_id, player_id, status, note, responded_at)\nVALUES\n"
sql += ",\n".join(rows)
sql += "\nON CONFLICT (match_id, player_id) DO NOTHING;\n"

print(f"-- Generated {len(rows)} availability records")
print(sql)
