create table if not exists public.volttype_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default timezone('utc', now())
);

alter table public.volttype_webhook_events enable row level security;

drop policy if exists "service role manages webhook events" on public.volttype_webhook_events;

create policy "service role manages webhook events"
on public.volttype_webhook_events
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
