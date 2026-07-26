-- Enable Supabase Realtime for match_availability so availability/attendance
-- screens can subscribe to live changes instead of requiring a manual
-- refresh — important on a homescreen-installed PWA where pull-to-refresh
-- is awkward. Realtime respects the table's existing RLS SELECT policy, so
-- this doesn't expose anything a client couldn't already read via REST.
ALTER PUBLICATION supabase_realtime ADD TABLE match_availability;
