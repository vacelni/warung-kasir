-- Hosted demo project only (docs/DEMO.md), after demo.sql: keep the public demo clean.
create extension if not exists pg_cron;

select cron.unschedule(jobname) from cron.job where jobname in ('demo-reset', 'demo-restore-logins');

-- Full reset: store, menu, staff and 30 days of sales, every hour on the hour.
select cron.schedule('demo-reset', '0 * * * *', 'select demo.reset()');
-- Demo logins repaired every 5 minutes in between.
select cron.schedule('demo-restore-logins', '*/5 * * * *', 'select demo.restore_logins()');
