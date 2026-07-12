-- MyPQ — initial schema, RLS, storage buckets, seed data.
-- Apply with: supabase db push (or paste into the SQL editor).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Short human-friendly codes for referrals / rep codes.
create or replace function public.gen_code(len int default 8)
returns text
language sql
volatile
as $$
  select upper(substr(replace(replace(encode(gen_random_bytes(8), 'base64'), '/', ''), '+', ''), 1, len));
$$;

-- ---------------------------------------------------------------------------
-- Core reference tables
-- ---------------------------------------------------------------------------

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null,
  unique (institution_id, name)
);

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,          -- ND1, ND2, HND1, HND2
  position int not null default 0
);

create table public.lecturers (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  style_notes text
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  level_id uuid not null references public.levels(id),
  code text not null,
  title text not null,
  unique (department_id, level_id, code)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,          -- "2024/2025"
  start_year int not null
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  email text,
  name text,
  department_id uuid references public.departments(id),
  level_id uuid references public.levels(id),
  role text not null default 'student' check (role in ('student', 'admin')),
  is_rep boolean not null default false,
  rep_code text unique,
  referral_code text not null unique default public.gen_code(8),
  referred_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, phone)
  values (new.id, new.email, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

create table public.question_sets (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  session_id uuid not null references public.sessions(id),
  semester text not null default 'First' check (semester in ('First', 'Second')),
  lecturer_id uuid references public.lecturers(id),
  type text not null default 'exam' check (type in ('exam', 'test', 'ai_generated')),
  source text not null default 'admin' check (source in ('admin', 'ai')),
  is_premium boolean not null default false,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.question_sections (
  id uuid primary key default gen_random_uuid(),
  question_set_id uuid not null references public.question_sets(id) on delete cascade,
  label text not null,                 -- "Section A — Objectives"
  position int not null default 0,
  scoring text not null default 'auto' check (scoring in ('auto', 'self'))
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  question_set_id uuid not null references public.question_sets(id) on delete cascade,
  section_id uuid references public.question_sections(id) on delete set null,
  number int not null,
  type text not null default 'mcq' check (type in ('mcq', 'theory')),
  body_md text not null,
  options jsonb,                       -- [{"key":"A","text":"..."}]
  correct_option text,                 -- "A" | "B" | ...
  answer_md text,
  explanation_md text,
  answer_source text not null default 'admin' check (answer_source in ('admin', 'ai_deduced', 'verified')),
  unique (question_set_id, number)
);

create table public.ai_explanations (
  question_id uuid primary key references public.questions(id) on delete cascade,
  explanation_md text not null,
  created_at timestamptz not null default now()
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lecturer_id uuid references public.lecturers(id),
  title text not null,
  file_url text not null,              -- storage path in the "materials" bucket
  extracted_text_status text not null default 'pending'
    check (extracted_text_status in ('pending', 'extracted', 'failed', 'needs_ocr')),
  is_premium boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  lecturer_id uuid references public.lecturers(id),
  chunk_text text not null,
  position int not null default 0
);

create index material_chunks_course_idx on public.material_chunks (course_id);

-- ---------------------------------------------------------------------------
-- Student activity
-- ---------------------------------------------------------------------------

create table public.user_courses (
  user_id uuid not null references public.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  primary key (user_id, course_id)
);

create table public.user_course_exams (
  user_id uuid not null references public.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  exam_type text not null default 'exam' check (exam_type in ('test', 'exam')),
  exam_date date not null,
  primary key (user_id, course_id)
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  question_set_id uuid not null references public.question_sets(id) on delete cascade,
  mode text not null default 'test' check (mode in ('read', 'test')),
  score numeric not null default 0,
  total numeric not null default 0,
  duration_s int not null default 0,
  created_at timestamptz not null default now()
);

create table public.attempt_answers (
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  given_answer text,
  is_correct boolean,
  primary key (attempt_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  semester_label text not null,
  amount int not null,                 -- kobo
  provider text not null check (provider in ('paystack', 'manual')),
  reference text unique,               -- paystack reference (null for manual)
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.rep_attributions (
  id uuid primary key default gen_random_uuid(),
  rep_user_id uuid not null references public.users(id) on delete cascade,
  attributed_user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id),
  created_at timestamptz not null default now(),
  unique (attributed_user_id)
);

create table public.rep_commissions (
  id uuid primary key default gen_random_uuid(),
  rep_user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  amount int not null,                 -- kobo
  status text not null default 'accrued' check (status in ('accrued', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  delta int not null,
  reason text not null check (reason in ('referral', 'spend_ai', 'spend_trial', 'admin_adjust')),
  created_at timestamptz not null default now()
);

create table public.pdf_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  question_set_id uuid not null references public.question_sets(id) on delete cascade,
  file_url text not null,              -- storage path in the "exports" bucket
  created_at timestamptz not null default now(),
  unique (user_id, question_set_id)
);

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  lecturer_id uuid references public.lecturers(id),
  kind text not null default 'generate' check (kind in ('generate', 'explain', 'deduce')),
  source_question_set_ids jsonb,
  output_question_set_id uuid references public.question_sets(id),
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS helper functions (security definer so they bypass RLS internally)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

create or replace function public.has_active_premium(uid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = uid and status = 'active' and expires_at > now()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.institutions enable row level security;
alter table public.departments enable row level security;
alter table public.levels enable row level security;
alter table public.lecturers enable row level security;
alter table public.courses enable row level security;
alter table public.sessions enable row level security;
alter table public.users enable row level security;
alter table public.question_sets enable row level security;
alter table public.question_sections enable row level security;
alter table public.questions enable row level security;
alter table public.ai_explanations enable row level security;
alter table public.materials enable row level security;
alter table public.material_chunks enable row level security;
alter table public.user_courses enable row level security;
alter table public.user_course_exams enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.rep_attributions enable row level security;
alter table public.rep_commissions enable row level security;
alter table public.credits_ledger enable row level security;
alter table public.pdf_exports enable row level security;
alter table public.ai_generations enable row level security;

-- Reference data: readable by any authenticated user; writable by admins.
do $$
declare t text;
begin
  foreach t in array array['institutions','departments','levels','lecturers','courses','sessions'] loop
    execute format('create policy "read %1$s" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "admin write %1$s" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- users: read/update own row; admins read + update all.
create policy "read own profile" on public.users
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.users
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (
    -- students cannot self-promote or self-flag as rep
    public.is_admin() or (id = auth.uid() and role = 'student')
  );
-- allow reading minimal rep/referral lookup: resolved via security-definer RPC instead
create or replace function public.lookup_rep(code text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.users where rep_code = upper(code) and is_rep limit 1;
$$;
create or replace function public.lookup_referrer(code text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.users where referral_code = upper(code) limit 1;
$$;

-- question_sets: metadata visible to all signed-in students (needed to show
-- FREE/PREMIUM badges + locked previews). Content gating happens on questions.
create policy "read question_sets" on public.question_sets
  for select to authenticated using (true);
create policy "admin write question_sets" on public.question_sets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read question_sections" on public.question_sections
  for select to authenticated using (true);
create policy "admin write question_sections" on public.question_sections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- questions: THE premium gate. Free sets fully readable; premium sets expose
-- only the first 2 questions (locked preview) unless the user holds an active
-- semester unlock. Enforced server-side by Postgres — not the client.
create policy "read questions" on public.questions
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.question_sets qs
      where qs.id = question_set_id
        and (
          not qs.is_premium
          or public.has_active_premium(auth.uid())
          or questions.number <= 2
        )
    )
  );
create policy "admin write questions" on public.questions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read ai_explanations" on public.ai_explanations
  for select to authenticated using (true);
create policy "admin write ai_explanations" on public.ai_explanations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- materials: free materials readable by all; premium requires an unlock.
create policy "read materials" on public.materials
  for select to authenticated using (
    public.is_admin() or not is_premium or public.has_active_premium(auth.uid())
  );
create policy "admin write materials" on public.materials
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- material_chunks feed the AI server-side; only admins read them directly.
create policy "admin read material_chunks" on public.material_chunks
  for select to authenticated using (public.is_admin());
create policy "admin write material_chunks" on public.material_chunks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- own-data tables
create policy "own user_courses" on public.user_courses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own user_course_exams" on public.user_course_exams
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own attempts" on public.attempts
  for all to authenticated using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid());
create policy "own attempt_answers" on public.attempt_answers
  for all to authenticated using (
    exists (select 1 from public.attempts a where a.id = attempt_id and (a.user_id = auth.uid() or public.is_admin()))
  ) with check (
    exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid())
  );

-- money: read own; writes happen via the service role (webhooks/admin API).
create policy "read own subscriptions" on public.subscriptions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admin write subscriptions" on public.subscriptions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "rep reads own attributions" on public.rep_attributions
  for select to authenticated using (rep_user_id = auth.uid() or public.is_admin());
create policy "admin write rep_attributions" on public.rep_attributions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "rep reads own commissions" on public.rep_commissions
  for select to authenticated using (rep_user_id = auth.uid() or public.is_admin());
create policy "admin write rep_commissions" on public.rep_commissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read own credits" on public.credits_ledger
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admin write credits" on public.credits_ledger
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read own pdf_exports" on public.pdf_exports
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "read own ai_generations" on public.ai_generations
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Signup attribution RPC: records rep attribution + referral credit safely.
-- Called once from onboarding; all checks server-side.
-- ---------------------------------------------------------------------------

create or replace function public.claim_signup_code(code text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  rep_id uuid;
  ref_id uuid;
  monthly_cap int := 10;
  rewarded int;
begin
  if auth.uid() is null then
    return 'not_signed_in';
  end if;

  rep_id := public.lookup_rep(code);
  if rep_id is not null and rep_id <> auth.uid() then
    insert into public.rep_attributions (rep_user_id, attributed_user_id)
    values (rep_id, auth.uid())
    on conflict (attributed_user_id) do nothing;
    return 'rep_attributed';
  end if;

  ref_id := public.lookup_referrer(code);
  if ref_id is not null and ref_id <> auth.uid() then
    update public.users set referred_by = ref_id
    where id = auth.uid() and referred_by is null;
    -- anti-abuse: cap rewarded referrals per referrer per month
    select count(*) into rewarded from public.credits_ledger
    where user_id = ref_id and reason = 'referral'
      and created_at > date_trunc('month', now());
    if rewarded < monthly_cap then
      insert into public.credits_ledger (user_id, delta, reason)
      values (ref_id, 1, 'referral');
    end if;
    return 'referred';
  end if;

  return 'unknown_code';
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage buckets + policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('materials', 'materials', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "authenticated read materials bucket" on storage.objects
  for select to authenticated using (bucket_id = 'materials');
create policy "admin write materials bucket" on storage.objects
  for all to authenticated
  using (bucket_id = 'materials' and public.is_admin())
  with check (bucket_id = 'materials' and public.is_admin());
-- exports are written by the service role; owners read via signed URLs.
create policy "read own exports" on storage.objects
  for select to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Seed data — PTI Effurun, Mechanical Engineering, levels, current session
-- ---------------------------------------------------------------------------

insert into public.institutions (name) values ('Petroleum Training Institute, Effurun');

insert into public.departments (institution_id, name)
select id, 'Mechanical Engineering' from public.institutions
where name = 'Petroleum Training Institute, Effurun';

insert into public.levels (name, position) values
  ('ND1', 1), ('ND2', 2), ('HND1', 3), ('HND2', 4);

insert into public.sessions (name, start_year) values ('2024/2025', 2024);

-- To promote the founder to admin after signup:
--   update public.users set role = 'admin' where email = 'you@example.com';
-- To flag a class rep:
--   update public.users set is_rep = true, rep_code = public.gen_code(6) where email = '...';
