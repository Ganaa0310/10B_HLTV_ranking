-- Run this once in Supabase: SQL Editor > New query > paste > Run
create table if not exists players (
  id text primary key,
  name text not null,
  score integer not null default 1000
);
-- Lock the table so only the server (service key) can read/write it
alter table players enable row level security;
