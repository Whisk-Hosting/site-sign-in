-- Sites, the people who work there, visitor types, inductions, contractors, visits, expected
-- visitors, kiosks, roll calls and the outbox. One business per app.

create table settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Reception',
  accent text not null default '#0f766e',
  timezone text not null default 'America/New_York',
  privacy_note text not null default 'We keep your details to know who is on site and to keep everyone safe. They are deleted after 12 months.',
  photos boolean not null default false,
  badges boolean not null default false,
  retention_months int not null default 12,
  contractor_policy text not null default 'warn' check (contractor_policy in ('warn', 'block')),
  chat_webhook_url text not null default '',
  email_from text not null default '',
  admin_email text not null default '',
  -- Signs sign-in drafts and the cookies that remember a visitor's phone. Made once, here.
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1);

create table sites (
  id serial primary key,
  name text not null,
  address text not null default '',
  -- The QR poster points at /s/<poster_token>; making a new one retires old posters.
  poster_token text not null unique,
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Staff: the people visitors come to see, and who sign in and out on the staff board.
create table people (
  id serial primary key,
  name text not null,
  email text not null default '',
  site_id int references sites on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table inductions (
  id serial primary key,
  title text not null,
  body text not null default '',
  video_upload_id text,
  -- [{prompt, choices: [text], answer: index}]
  questions jsonb not null default '[]',
  pass_mark int not null default 100 check (pass_mark between 0 and 100),
  -- 0 means every visit.
  valid_months int not null default 12 check (valid_months between 0 and 60),
  version int not null default 1,
  archived boolean not null default false,
  updated_at timestamptz not null default now()
);

create table visitor_types (
  id serial primary key,
  name text not null,
  icon text not null default 'visitor',
  position int not null default 0,
  ask_company boolean not null default true,
  ask_phone boolean not null default true,
  ask_email boolean not null default false,
  ask_host boolean not null default true,
  photo boolean not null default false,
  contractor boolean not null default false,
  -- [{label, required}]
  questions jsonb not null default '[]',
  induction_ids int[] not null default '{}',
  archived boolean not null default false
);

create table companies (
  id serial primary key,
  name text not null,
  contact_email text not null default '',
  insurance_expires date,
  licence_expires date,
  certificate_upload_id text,
  warned_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- A visitor's own record, so a returning visitor is recognized and skips inductions they hold.
create table visitors (
  id serial primary key,
  name text not null,
  phone text not null default '',
  email text not null default '',
  company text not null default '',
  company_id int references companies on delete set null,
  created_at timestamptz not null default now(),
  last_visit_at timestamptz
);
create index visitors_phone on visitors (phone) where phone <> '';
create index visitors_email on visitors (lower(email)) where email <> '';

create table passes (
  visitor_id int not null references visitors on delete cascade,
  induction_id int not null references inductions on delete cascade,
  version int not null,
  score int not null default 100,
  signature text not null default '',
  passed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (visitor_id, induction_id)
);

create table invites (
  id serial primary key,
  site_id int not null references sites on delete cascade,
  type_id int references visitor_types on delete set null,
  host_id int references people on delete set null,
  name text not null,
  email text not null default '',
  company text not null default '',
  expected_on date not null,
  code text not null unique,
  token text not null unique,
  visitor_id int references visitors on delete set null,
  ready_at timestamptz,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create table visits (
  id serial primary key,
  site_id int not null references sites on delete cascade,
  visitor_id int references visitors on delete cascade,
  person_id int references people on delete cascade,
  type_id int references visitor_types on delete set null,
  type_name text not null,
  host_id int references people on delete set null,
  invite_id int references invites on delete set null,
  name text not null,
  company text not null default '',
  phone text not null default '',
  email text not null default '',
  -- [{label, answer}]
  answers jsonb not null default '[]',
  -- [{induction_id, title, version, score}]
  inductions jsonb not null default '[]',
  photo_upload_id text,
  warning text not null default '',
  source text not null check (source in ('kiosk', 'phone', 'staff', 'invite')),
  -- Lets the visitor's own phone sign them out.
  token text not null unique,
  signed_in_at timestamptz not null default now(),
  signed_out_at timestamptz,
  signed_out_by text,
  check ((visitor_id is null) <> (person_id is null))
);
create index visits_on_site on visits (site_id) where signed_out_at is null;
create index visits_signed_in on visits (signed_in_at);
create index visits_visitor on visits (visitor_id);

create table kiosks (
  id serial primary key,
  site_id int not null references sites on delete cascade,
  name text not null default 'Kiosk',
  token_hash text unique,
  pair_code text unique,
  pair_expires timestamptz,
  paired_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table roll_calls (
  id serial primary key,
  site_id int not null references sites on delete cascade,
  started_by text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create table roll_call_marks (
  roll_call_id int not null references roll_calls on delete cascade,
  visit_id int not null references visits on delete cascade,
  marked_by text not null,
  marked_at timestamptz not null default now(),
  primary key (roll_call_id, visit_id)
);

-- Emails and chat posts are written here first, then sent by the send-message function, so
-- staff can see what went and what failed.
create table messages (
  id serial primary key,
  channel text not null check (channel in ('email', 'chat')),
  kind text not null,
  to_addr text not null default '',
  subject text not null default '',
  html text not null default '',
  text text not null default '',
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'demo')),
  error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index messages_created on messages (created_at);
