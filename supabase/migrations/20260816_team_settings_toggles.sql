-- Multi-team rollenmodel, fase 2: per-team instelbare features. Defaults reproduceren
-- het huidige gedrag exact (alles aan, fluitbeurten auto/zaterdag-voor) — voor het
-- bestaande team verandert er dus niets totdat iemand een toggle bewust omzet.
ALTER TABLE teams
  ADD COLUMN potjescup_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN potjescup_rules_text TEXT,  -- NULL = val terug op de hardcoded tekst in Potjescup.tsx
  ADD COLUMN fluitbeurten_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN fluitbeurten_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (fluitbeurten_mode IN ('auto', 'manual')),
  ADD COLUMN fluitbeurten_day_of_week SMALLINT NOT NULL DEFAULT 6  -- 0=zo..6=za; huidige gedrag = zaterdag
    CHECK (fluitbeurten_day_of_week BETWEEN 0 AND 6),
  ADD COLUMN fluitbeurten_relative_to_match TEXT NOT NULL DEFAULT 'before'
    CHECK (fluitbeurten_relative_to_match IN ('before', 'after')),
  ADD COLUMN gathering_banner_enabled BOOLEAN NOT NULL DEFAULT true;
