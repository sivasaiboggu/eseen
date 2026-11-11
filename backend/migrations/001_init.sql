create table users(id text primary key, email text not null unique, plan text not null default 'free', created_at timestamptz not null default now());
create table messages(id text primary key, user_id text not null references users(id) on delete cascade, label_enc bytea, sent_at timestamptz not null default now(), created_at timestamptz not null default now());
create table recipients(id text primary key, message_id text not null references messages(id) on delete cascade, kind text not null, created_at timestamptz not null default now());
create table links(id text primary key, message_id text not null references messages(id) on delete cascade, recipient_id text not null references recipients(id) on delete cascade, url text not null check (url ~* '^https?://'), created_at timestamptz not null default now());
create table events(id text primary key, recipient_id text not null references recipients(id) on delete cascade, kind text not null, at timestamptz not null, user_agent text, suspected_bot boolean not null default false, bot_label text, self_open boolean not null default false, coarse_country text, created_at timestamptz not null default now());
create table optouts(recipient_id text primary key, created_at timestamptz not null default now());
create table rules_versions(version int primary key, rules jsonb not null, created_at timestamptz not null default now());
create index on messages(user_id, created_at); create index on recipients(message_id); create index on events(recipient_id, at); create index on links(recipient_id);
-- No raw IP column by design. Coarse location only, if enabled later.
