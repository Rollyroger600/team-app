-- ============================================================
-- Decouple "team captain" from "team_admin" (app admin permission)
-- These were previously conflated under team_memberships.role, showing
-- the same "Aanvoerder" badge for both a playing captain and an app
-- admin. is_captain is now a separate, purely informational flag with
-- no permission implications — team_memberships.role continues to
-- gate actual admin access.
-- ============================================================

ALTER TABLE team_memberships ADD COLUMN IF NOT EXISTS is_captain BOOLEAN DEFAULT false;
