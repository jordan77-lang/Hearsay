-- HearSay: dictionary_rules for projects that already have public.classes

-- Run in Supabase → SQL Editor (uses existing classes.slug, not courses.id).



-- Synthetic row for merged "all" dictionary (optional; UI also offers All classes without this).

insert into public.classes (slug, label, file_prefix, sort_order, sample_candidates, addon_defaults)

values (

  'all',

  'All classes (combined)',

  'all',

  0,

  '[]'::jsonb,

  '{"dictionaryName":"all","dictionaryDisplayName":"All classes (combined)","nvdaRegexEntries":[]}'::jsonb

)

on conflict (slug) do update set

  label = excluded.label,

  sort_order = excluded.sort_order;



create table if not exists public.dictionary_rules (

  id bigint generated always as identity primary key,

  class_slug text not null references public.classes (slug) on update cascade,

  sort_order integer not null,

  pattern text not null,

  replacement text not null,

  case_sensitive boolean not null default false,

  rule_type smallint not null default 0 check (rule_type in (0, 1, 2)),

  comment text,

  updated_at timestamptz not null default now(),

  unique (class_slug, sort_order)

);



create index if not exists dictionary_rules_class_sort_idx

  on public.dictionary_rules (class_slug, sort_order);



create unique index if not exists dictionary_rules_class_pattern_idx

  on public.dictionary_rules (class_slug, pattern);



alter table public.dictionary_rules enable row level security;



drop policy if exists "dictionary_rules anon read" on public.dictionary_rules;

create policy "dictionary_rules anon read"

  on public.dictionary_rules for select to anon using (true);



-- Anon write policies (team-shared anon key, not published on a public site).
-- Includes class_slug = 'all' so the browser can Rebuild combined.
--
-- Stricter alternative (if the anon key is ever embedded in a public app):
--   insert: with check (class_slug <> 'all')
--   update: using (class_slug <> 'all') with check (class_slug <> 'all')
--   delete: using (class_slug <> 'all')

drop policy if exists "dictionary_rules anon insert" on public.dictionary_rules;

create policy "dictionary_rules anon insert"

  on public.dictionary_rules for insert to anon with check (true);



drop policy if exists "dictionary_rules anon update" on public.dictionary_rules;

create policy "dictionary_rules anon update"

  on public.dictionary_rules for update to anon using (true) with check (true);



drop policy if exists "dictionary_rules anon delete" on public.dictionary_rules;

create policy "dictionary_rules anon delete"

  on public.dictionary_rules for delete to anon using (true);



drop policy if exists "dictionary_rules auth write" on public.dictionary_rules;

create policy "dictionary_rules auth write"

  on public.dictionary_rules for all to authenticated using (true) with check (true);


