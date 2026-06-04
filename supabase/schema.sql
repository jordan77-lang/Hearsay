-- HearSay: remote NVDA dictionary rules (multi-course)
-- Run in Supabase → SQL Editor. Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
--
-- If your project already has public.classes (slug column), use
-- supabase/setup-dictionary-rules.sql instead of the courses block below.

-- ---------------------------------------------------------------------------
-- Courses / classes (each has its own dictionary; "all" = merged view)
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id text primary key,
  label text not null,
  description text,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.courses (id, label, description, sort_order) values
  ('all', 'All classes (combined)', 'Union of every class dictionary — rebuilt from class-specific rules.', 0),
  ('chem113', 'CHEM 113', 'General chemistry pronunciation dictionary.', 1)
on conflict (id) do update set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Dictionary rules (NVDA .dic rows)
-- ---------------------------------------------------------------------------
create table if not exists public.dictionary_rules (
  id bigint generated always as identity primary key,
  course_id text not null references public.courses (id) on update cascade,
  sort_order integer not null,
  pattern text not null,
  replacement text not null,
  case_sensitive boolean not null default false,
  rule_type smallint not null default 0 check (rule_type in (0, 1, 2)),
  comment text,
  updated_at timestamptz not null default now(),
  unique (course_id, sort_order)
);

create index if not exists dictionary_rules_course_sort_idx
  on public.dictionary_rules (course_id, sort_order);

-- One pattern per course (upsert when authors add while working).
create unique index if not exists dictionary_rules_course_pattern_idx
  on public.dictionary_rules (course_id, pattern);

alter table public.dictionary_rules enable row level security;

-- Anon: read (browser playground + extension).
drop policy if exists "dictionary_rules anon read" on public.dictionary_rules;
create policy "dictionary_rules anon read"
  on public.dictionary_rules for select to anon using (true);

-- Anon write (team-shared anon key; includes course_id = 'all' for Rebuild combined).
-- Stricter alternative if the anon key is public: use (course_id <> 'all') on all three.
drop policy if exists "dictionary_rules anon insert" on public.dictionary_rules;
create policy "dictionary_rules anon insert"
  on public.dictionary_rules for insert to anon with check (true);

drop policy if exists "dictionary_rules anon update" on public.dictionary_rules;
create policy "dictionary_rules anon update"
  on public.dictionary_rules for update to anon using (true) with check (true);

drop policy if exists "dictionary_rules anon delete" on public.dictionary_rules;
create policy "dictionary_rules anon delete"
  on public.dictionary_rules for delete to anon using (true);

-- Authenticated users: full access (future admin UI).
drop policy if exists "dictionary_rules auth write" on public.dictionary_rules;
create policy "dictionary_rules auth write"
  on public.dictionary_rules for all to authenticated using (true) with check (true);

alter table public.courses enable row level security;

drop policy if exists "courses anon read" on public.courses;
create policy "courses anon read"
  on public.courses for select to anon using (true);

drop policy if exists "courses anon insert" on public.courses;
create policy "courses anon insert"
  on public.courses for insert to anon with check (id <> 'all');

drop policy if exists "courses anon update" on public.courses;
create policy "courses anon update"
  on public.courses for update to anon using (id <> 'all') with check (id <> 'all');

drop policy if exists "courses anon delete" on public.courses;
create policy "courses anon delete"
  on public.courses for delete to anon using (id <> 'all');

drop policy if exists "courses auth write" on public.courses;
create policy "courses auth write"
  on public.courses for all to authenticated using (true) with check (true);
