-- Keys for the JSON API under /api/v1. An admin makes and turns off keys under Setup, Settings;
-- the key itself is shown once and only its SHA-256 is kept, with its first 10 characters to
-- tell keys apart.
create table api_keys (
  id serial primary key,
  label text not null,
  prefix text not null,
  hash text not null unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
