-- Run once if you already created dictionary_rules before the courses table existed.

insert into public.courses (id, label, description, sort_order) values
  ('all', 'All classes (combined)', 'Union of every class dictionary.', 0),
  ('chem113', 'CHEM 113', 'General chemistry pronunciation dictionary.', 1)
on conflict (id) do nothing;

-- Optional: add FK if the table was created without it (skip if this errors).
-- alter table public.dictionary_rules
--   add constraint dictionary_rules_course_id_fkey
--   foreign key (course_id) references public.courses (id) on update cascade;

create unique index if not exists dictionary_rules_course_pattern_idx
  on public.dictionary_rules (course_id, pattern);
