-- Manually-added ("losse") umpire duties have no match_id to derive a date from.
-- Add an explicit nullable date so standalone entries sort and group correctly
-- alongside match-linked ones (which keep deriving their date from matches.match_date).
ALTER TABLE umpire_duties ADD COLUMN IF NOT EXISTS duty_date DATE;
