-- HearSay team access
-- ===================
-- Anyone can READ the class dictionaries. Only the team account
-- (dreamscape@hearsay.team, signed in with the team password) can ADD, CHANGE
-- or DELETE them.
--
-- Run this once in Supabase → SQL Editor → New query → Run,
-- AFTER creating the team user (Authentication → Users → Add user).
-- It is safe to run again: it rebuilds the same rules each time.
--
-- Want reading to require the password too? Change the line marked
-- "READ RULE" so it uses the same team check as the edit rules.

do $$
declare
  team_email constant text := 'dreamscape@hearsay.team';
  t text;
  p record;
begin
  foreach t in array array['classes', 'courses', 'dictionary_rules', 'entries'] loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'Skipping %: table not found in this project', t;
      continue;
    end if;

    -- 1. Remove every existing rule on the table, including the old ones that
    --    let anyone holding the public key edit.
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    -- 2. Turn on row-level security so only the rules below apply.
    execute format('alter table public.%I enable row level security', t);

    -- 3. Table permissions: the public key may only read.
    execute format('revoke insert, update, delete on public.%I from anon', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);

    -- 4. READ RULE: anyone can read.
    execute format('create policy "hearsay read" on public.%I for select to anon, authenticated using (true)', t);

    -- 5. EDIT RULES: only the signed-in team account.
    execute format('create policy "hearsay team insert" on public.%I for insert to authenticated with check ((auth.jwt() ->> ''email'') = %L)', t, team_email);
    execute format('create policy "hearsay team update" on public.%I for update to authenticated using ((auth.jwt() ->> ''email'') = %L) with check ((auth.jwt() ->> ''email'') = %L)', t, team_email, team_email);
    execute format('create policy "hearsay team delete" on public.%I for delete to authenticated using ((auth.jwt() ->> ''email'') = %L)', t, team_email);
  end loop;
end $$;

-- New rows may need their id counters.
grant usage, select on all sequences in schema public to authenticated;

-- Check the result: each table should list one "hearsay read" rule and three
-- "hearsay team ..." rules, and nothing else.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename in ('classes', 'courses', 'dictionary_rules', 'entries')
order by tablename, policyname;
