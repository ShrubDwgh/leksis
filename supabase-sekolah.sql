-- =====================================================================
-- LEKSIS — supabase-sekolah.sql
-- Platform sekolah (multi-tenant), absensi/jadwal, ujian aman, branding.
-- Jalankan SETELAH supabase.sql: SQL Editor → New query → tempel seluruh isi → Run.
-- Aman dijalankan ulang. Data lama tetap dipakai (guru→teacher, siswa→student).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. FUNGSI KODE ACAK (CSPRNG via gen_random_uuid)
-- ---------------------------------------------------------------------
create or replace function public.gen_school_code() returns text
language plpgsql security definer set search_path = public as $$
declare chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; u bytea; result text; i int;
begin
  loop
    u := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    result := '';
    for i in 0..7 loop result := result || substr(chars, 1 + (get_byte(u, i) % 32), 1); end loop;
    exit when not exists (select 1 from public.schools where teacher_code = result or student_code = result);
  end loop;
  return result;
end $$;

create or replace function public.gen_parent_code() returns text
language plpgsql security definer set search_path = public as $$
declare chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; u bytea; result text; i int;
begin
  loop
    u := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    result := '';
    for i in 0..7 loop result := result || substr(chars, 1 + (get_byte(u, i) % 32), 1); end loop;
    exit when not exists (select 1 from public.parent_codes where code = result);
  end loop;
  return result;
end $$;

create or replace function public.valid_social(j jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(j) = 'object' and not exists (
    select 1 from jsonb_each_text(j) e
    where e.key not in ('instagram', 'facebook', 'youtube', 'twitter')
       or e.value !~* '^https?://' or char_length(e.value) > 300)
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 2. SEKOLAH + PERAN BARU
-- ---------------------------------------------------------------------
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 150),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  address text not null default '' check (char_length(address) <= 300),
  logo_url text check (logo_url is null or (logo_url ~* '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/school-assets/' and char_length(logo_url) <= 500)),
  principal_id uuid references public.profiles(id) on delete set null,
  teacher_code text not null unique default public.gen_school_code(),
  student_code text not null unique default public.gen_school_code(),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists school_id uuid references public.schools(id) on delete set null;
alter table public.profiles add column if not exists nis text check (nis is null or char_length(nis) <= 30);
create index if not exists idx_profiles_school on public.profiles(school_id);

-- Peran: teks + CHECK (lebih mudah diubah dari HP daripada enum). guru→teacher, siswa→student.
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'teacher' where role = 'guru';
update public.profiles set role = 'student' where role = 'siswa';
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin', 'school_admin', 'teacher', 'student', 'parent'));
alter table public.profiles alter column role set default 'student';

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  year_name text not null check (char_length(btrim(year_name)) between 4 and 20),
  semester text not null check (semester in ('Ganjil', 'Genap')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, year_name, semester)
);
create unique index if not exists uq_year_active on public.academic_years(school_id) where is_active;

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  code text check (code is null or char_length(code) <= 20),
  created_at timestamptz not null default now()
);
create unique index if not exists uq_subject_code on public.subjects(school_id, lower(code)) where code is not null;

alter table public.classes add column if not exists school_id uuid references public.schools(id) on delete set null;
alter table public.classes add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null;
create index if not exists idx_classes_school on public.classes(school_id);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists idx_schedules_class on public.schedules(class_id);
create index if not exists idx_schedules_teacher on public.schedules(teacher_id);

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  status text not null check (status in ('Hadir', 'Sakit', 'Izin', 'Alpa')),
  note text check (note is null or char_length(note) <= 300),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (class_id, student_id, date)
);
create index if not exists idx_att_student on public.attendances(student_id, date desc);

create table if not exists public.parent_students (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);
create index if not exists idx_ps_student on public.parent_students(student_id);

-- Kode hubung orang tua (rahasia milik siswa; hanya dibaca lewat fungsi my_parent_code)
create table if not exists public.parent_codes (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique
);

-- ---------------------------------------------------------------------
-- 3. BRANDING SEKOLAH
-- ---------------------------------------------------------------------
create table if not exists public.platform_branding (
  id int primary key default 1 check (id = 1),
  primary_color text not null default '#0A2346' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#14407A' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#1FB6E5' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  font_family text not null default 'system' check (font_family in ('system', 'humanist', 'serif', 'rounded')),
  login_message text check (login_message is null or char_length(login_message) <= 500),
  footer_text text check (footer_text is null or char_length(footer_text) <= 300),
  theme_mode text not null default 'light' check (theme_mode in ('light', 'dark', 'system')),
  updated_at timestamptz not null default now()
);
insert into public.platform_branding (id) values (1) on conflict do nothing;

create table if not exists public.school_branding (
  school_id uuid primary key references public.schools(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 100),
  tagline text check (tagline is null or char_length(tagline) <= 160),
  banner_url text check (banner_url is null or (banner_url ~* '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/school-assets/' and char_length(banner_url) <= 500)),
  banner_position text not null default 'hero' check (banner_position in ('top', 'hero', 'sidebar')),
  favicon_url text check (favicon_url is null or (favicon_url ~* '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/school-assets/' and char_length(favicon_url) <= 500)),
  primary_color text not null default '#0A2346' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#14407A' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#1FB6E5' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  font_family text not null default 'system' check (font_family in ('system', 'humanist', 'serif', 'rounded')),
  login_background_url text check (login_background_url is null or (login_background_url ~* '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/school-assets/' and char_length(login_background_url) <= 500)),
  login_message text check (login_message is null or char_length(login_message) <= 500),
  footer_text text check (footer_text is null or char_length(footer_text) <= 300),
  contact_email text check (contact_email is null or (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 150)),
  contact_phone text check (contact_phone is null or contact_phone ~ '^[0-9+() -]{3,30}$'),
  website_url text check (website_url is null or (website_url ~* '^https?://' and char_length(website_url) <= 300)),
  social_media jsonb not null default '{}'::jsonb check (public.valid_social(social_media)),
  theme_mode text not null default 'light' check (theme_mode in ('light', 'dark', 'system')),
  updated_at timestamptz not null default now()
);
drop trigger if exists school_branding_updated on public.school_branding;
create trigger school_branding_updated before update on public.school_branding
  for each row execute function public.set_updated_at();

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_school on public.audit_log(school_id, created_at desc);

create table if not exists public.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (user_id, bucket)
);

-- Sekolah baru otomatis mendapat branding awal dari pengaturan platform
create or replace function public.schools_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.school_branding (school_id, primary_color, secondary_color, accent_color, font_family, login_message, footer_text, theme_mode)
  select new.id, p.primary_color, p.secondary_color, p.accent_color, p.font_family, p.login_message, p.footer_text, p.theme_mode
  from public.platform_branding p where p.id = 1
  on conflict do nothing;
  insert into public.school_branding (school_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists schools_after_insert_trg on public.schools;
create trigger schools_after_insert_trg after insert on public.schools
  for each row execute function public.schools_after_insert();

-- Catat perubahan branding: siapa, kapan, field apa
create or replace function public.audit_branding() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb := to_jsonb(old); n jsonb := to_jsonb(new); diff jsonb;
begin
  select coalesce(jsonb_object_agg(k, jsonb_build_object('old', o -> k, 'new', n -> k)), '{}'::jsonb) into diff
  from jsonb_object_keys(n) as k where k <> 'updated_at' and (o -> k) is distinct from (n -> k);
  if diff <> '{}'::jsonb then
    insert into public.audit_log (school_id, user_id, action, details) values (new.school_id, auth.uid(), 'branding_update', diff);
  end if;
  return new;
end $$;
drop trigger if exists school_branding_audit on public.school_branding;
create trigger school_branding_audit after update on public.school_branding
  for each row execute function public.audit_branding();

-- ---------------------------------------------------------------------
-- 4. UJIAN: KOLOM BARU + LOG
-- ---------------------------------------------------------------------
alter table public.exams add column if not exists subject_id uuid references public.subjects(id) on delete set null;
alter table public.exams add column if not exists shuffle_questions boolean not null default false;
alter table public.exams add column if not exists shuffle_options boolean not null default false;
alter table public.exams add column if not exists anticheat boolean not null default true;
alter table public.exams add column if not exists violation_limit int not null default 0 check (violation_limit between 0 and 20);

alter table public.submissions add column if not exists session_token text;
alter table public.submissions add column if not exists device_id text;
alter table public.submissions add column if not exists ip_address text;
alter table public.submissions add column if not exists user_agent text;
alter table public.submissions add column if not exists question_order jsonb;
alter table public.submissions add column if not exists option_orders jsonb;
alter table public.submissions add column if not exists violation_count int not null default 0;
alter table public.submissions add column if not exists last_seen_at timestamptz;

create table if not exists public.exam_violations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  violation_type text not null,
  severity int not null default 1,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_viol_sub on public.exam_violations(submission_id, created_at);

create table if not exists public.exam_activity_log (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  activity_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_act_sub on public.exam_activity_log(submission_id, created_at);

-- ---------------------------------------------------------------------
-- 5. FUNGSI BANTU RLS (security definer → tanpa rekursi policy)
-- ---------------------------------------------------------------------
create or replace function public.my_school() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_school_admin(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select sid is not null and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'school_admin' and school_id = sid)
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
$$;

-- "Mengelola kelas": guru pemilik kelas ATAU admin sekolah dari kelas itu.
create or replace function public.is_teacher_of(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.classes c
    where c.id = cid and (c.teacher_id = auth.uid()
      or (c.school_id is not null and public.is_school_admin(c.school_id))))
$$;

create or replace function public.is_exam_teacher(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.exams e where e.id = eid and public.is_teacher_of(e.class_id))
$$;

create or replace function public.is_question_teacher(qid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.questions q where q.id = qid and public.is_exam_teacher(q.exam_id))
$$;

create or replace function public.is_submission_teacher(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.submissions s where s.id = sid and public.is_teacher_of(s.class_id))
$$;

create or replace function public.is_parent_of(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parent_students where parent_id = auth.uid() and student_id = sid)
$$;

create or replace function public.parent_sees_class(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.parent_students ps join public.class_members m on m.student_id = ps.student_id
    where ps.parent_id = auth.uid() and m.class_id = cid)
$$;

-- Admin sekolah memilih guru dari sekolahnya sendiri
create or replace function public.school_staff(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles t, public.profiles me
    where t.id = tid and me.id = auth.uid() and me.role = 'school_admin'
      and t.school_id = me.school_id and t.role in ('teacher', 'school_admin'))
$$;

create or replace function public.uuid_or_null(t text) returns uuid
language plpgsql immutable as $$
begin return t::uuid; exception when others then return null; end $$;

create or replace function public.can_see_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.class_members m join public.classes c on c.id = m.class_id
      where (public.is_teacher_of(c.id) and m.student_id = pid)
         or (m.student_id = auth.uid() and c.teacher_id = pid))
    or exists (select 1 from public.profiles p where p.id = pid and public.is_school_admin(p.school_id))
    or exists (select 1 from public.parent_students ps where ps.parent_id = auth.uid() and ps.student_id = pid)
    or exists (
      select 1 from public.parent_students ps
      join public.class_members m on m.student_id = ps.student_id
      join public.classes c on c.id = m.class_id
      where ps.parent_id = auth.uid() and c.teacher_id = pid)
    or exists (
      select 1 from public.schedules sc join public.class_members m on m.class_id = sc.class_id
      where sc.teacher_id = pid and m.student_id = auth.uid())
    or exists (
      select 1 from public.schedules sc join public.parent_students ps on true
      join public.class_members m on m.class_id = sc.class_id and m.student_id = ps.student_id
      where sc.teacher_id = pid and ps.parent_id = auth.uid())
$$;

-- Siswa hanya bisa membaca soal lewat fungsi get_exam_questions saat ujian berjalan.
-- Baca langsung hanya untuk guru, atau untuk siswa setelah nilainya dirilis (tinjau jawaban).
create or replace function public.exam_content_visible(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.exams e where e.id = eid and (
      public.is_teacher_of(e.class_id)
      or (e.published and public.is_member_of(e.class_id) and exists (
            select 1 from public.submissions s join public.grades g on g.submission_id = s.id
            where s.exam_id = e.id and s.student_id = auth.uid() and g.released))))
$$;

create or replace function public.can_read_key(qid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.questions q join public.exams e on e.id = q.exam_id
    where q.id = qid and (
      public.is_teacher_of(e.class_id)
      or (e.published and e.show_score and e.ends_at is not null
          and e.ends_at < now() - interval '2 minutes'
          and exists (select 1 from public.submissions s
                      where s.exam_id = e.id and s.student_id = auth.uid() and s.status <> 'in_progress'))))
$$;

-- ---------------------------------------------------------------------
-- 6. TRIGGER PENGAMAN
-- ---------------------------------------------------------------------
-- school_id kelas SELALU mengikuti sekolah gurunya; tahun ajaran harus satu sekolah.
create or replace function public.classes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.school_id := (select school_id from public.profiles where id = new.teacher_id);
  else
    if coalesce(current_setting('leksis.allow_school_move', true), '') <> '1' then
      new.school_id := old.school_id;
    end if;
    if new.teacher_id <> old.teacher_id
       and new.school_id is distinct from (select school_id from public.profiles where id = new.teacher_id) then
      raise exception 'Guru harus berasal dari sekolah yang sama';
    end if;
  end if;
  if new.academic_year_id is not null and not exists (
       select 1 from public.academic_years y where y.id = new.academic_year_id and y.school_id is not distinct from new.school_id) then
    raise exception 'Tahun ajaran tidak sesuai dengan sekolah kelas';
  end if;
  return new;
end $$;
drop trigger if exists classes_guard_trg on public.classes;
create trigger classes_guard_trg before insert or update on public.classes
  for each row execute function public.classes_guard();

create or replace function public.subject_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.subject_id is not null and not exists (
       select 1 from public.classes c join public.subjects s on s.id = new.subject_id
       where c.id = new.class_id and s.school_id is not distinct from c.school_id) then
    raise exception 'Mata pelajaran tidak sesuai dengan sekolah kelas';
  end if;
  return new;
end $$;
drop trigger if exists schedules_subject_guard on public.schedules;
create trigger schedules_subject_guard before insert or update on public.schedules
  for each row execute function public.subject_guard();
drop trigger if exists exams_subject_guard on public.exams;
create trigger exams_subject_guard before insert or update on public.exams
  for each row execute function public.subject_guard();

-- Pendaftaran: peran bebas hanya student/teacher/parent. school_admin membuat sekolah baru.
-- Peran super_admin TIDAK bisa dibuat dari pendaftaran (ubah manual lewat SQL Editor).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := meta ->> 'role';
  nm text := left(btrim(coalesce(meta ->> 'full_name', '')), 100);
  code text := upper(btrim(coalesce(meta ->> 'school_code', '')));
  final_role text; sid uuid; sname text; base text; sch public.schools%rowtype;
begin
  final_role := case when r in ('teacher', 'parent', 'school_admin') then r else 'student' end;
  insert into public.profiles (id, full_name, role)
  values (new.id, nm, case when final_role = 'school_admin' then 'student' else final_role end)
  on conflict (id) do nothing;

  if final_role = 'school_admin' then
    sname := left(btrim(coalesce(meta ->> 'school_name', '')), 150);
    if char_length(sname) < 2 then sname := 'Sekolah ' || coalesce(nullif(nm, ''), 'Baru'); end if;
    base := trim(both '-' from regexp_replace(lower(sname), '[^a-z0-9]+', '-', 'g'));
    if base = '' then base := 'sekolah'; end if;
    insert into public.schools (name, slug, principal_id)
    values (sname, left(base, 50) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), new.id)
    returning id into sid;
    update public.profiles set role = 'school_admin', school_id = sid where id = new.id;
  elsif code <> '' and final_role in ('student', 'teacher') then
    select * into sch from public.schools where teacher_code = code or student_code = code;
    if found and ((sch.teacher_code = code and final_role = 'teacher') or (sch.student_code = code and final_role = 'student')) then
      update public.profiles set school_id = sch.id where id = new.id;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 7. RLS — semua policy dibuat ulang agar konsisten
-- ---------------------------------------------------------------------
alter table public.schools enable row level security;
alter table public.academic_years enable row level security;
alter table public.subjects enable row level security;
alter table public.schedules enable row level security;
alter table public.attendances enable row level security;
alter table public.parent_students enable row level security;
alter table public.parent_codes enable row level security;
alter table public.platform_branding enable row level security;
alter table public.school_branding enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;
alter table public.exam_violations enable row level security;
alter table public.exam_activity_log enable row level security;

do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_see_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- schools
create policy schools_select on public.schools for select to authenticated
  using (id = public.my_school() or public.is_super_admin());
create policy schools_update on public.schools for update to authenticated
  using (public.is_school_admin(id) or public.is_super_admin())
  with check (public.is_school_admin(id) or public.is_super_admin());
create policy schools_delete on public.schools for delete to authenticated
  using (public.is_super_admin());

-- academic_years, subjects
create policy years_read on public.academic_years for select to authenticated using (school_id = public.my_school());
create policy years_admin on public.academic_years for all to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));
create policy subjects_read on public.subjects for select to authenticated using (school_id = public.my_school());
create policy subjects_admin on public.subjects for all to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

-- classes
create policy classes_select on public.classes for select to authenticated
  using (teacher_id = auth.uid() or public.is_member_of(id) or public.is_teacher_of(id) or public.parent_sees_class(id));
create policy classes_insert on public.classes for insert to authenticated
  with check (
    (teacher_id = auth.uid() and coalesce(public.my_role(), '') in ('teacher', 'school_admin'))
    or (coalesce(public.my_role(), '') = 'school_admin' and public.school_staff(teacher_id)));
create policy classes_update on public.classes for update to authenticated
  using (public.is_teacher_of(id))
  with check (teacher_id = auth.uid() or public.school_staff(teacher_id));
create policy classes_delete on public.classes for delete to authenticated
  using (public.is_teacher_of(id));

-- class_members (siswa masuk lewat join_class)
create policy members_select on public.class_members for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_of(class_id) or public.is_parent_of(student_id));
create policy members_delete on public.class_members for delete to authenticated
  using (student_id = auth.uid() or public.is_teacher_of(class_id));

-- materials / assignments / exams
create policy materials_teacher on public.materials for all to authenticated
  using (public.is_teacher_of(class_id)) with check (public.is_teacher_of(class_id));
create policy materials_read on public.materials for select to authenticated
  using (published and public.is_member_of(class_id));

create policy assignments_teacher on public.assignments for all to authenticated
  using (public.is_teacher_of(class_id)) with check (public.is_teacher_of(class_id));
create policy assignments_read on public.assignments for select to authenticated
  using (published and (public.is_member_of(class_id) or public.parent_sees_class(class_id)));

create policy exams_teacher on public.exams for all to authenticated
  using (public.is_teacher_of(class_id)) with check (public.is_teacher_of(class_id));
create policy exams_read on public.exams for select to authenticated
  using (published and (public.is_member_of(class_id) or public.parent_sees_class(class_id)));

-- questions / choices / answer_keys
create policy questions_teacher on public.questions for all to authenticated
  using (public.is_exam_teacher(exam_id)) with check (public.is_exam_teacher(exam_id));
create policy questions_read on public.questions for select to authenticated
  using (public.exam_content_visible(exam_id));
create policy choices_teacher on public.choices for all to authenticated
  using (public.is_question_teacher(question_id)) with check (public.is_question_teacher(question_id));
create policy choices_read on public.choices for select to authenticated
  using (public.question_visible(question_id));
create policy keys_teacher on public.answer_keys for all to authenticated
  using (public.is_question_teacher(question_id)) with check (public.is_question_teacher(question_id));
create policy keys_read on public.answer_keys for select to authenticated
  using (public.can_read_key(question_id));

-- submissions / answers / grades: hanya SELECT
create policy submissions_select on public.submissions for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_of(class_id) or public.is_parent_of(student_id));
create policy answers_select on public.answers for select to authenticated
  using (public.can_read_answers(submission_id));
create policy grades_select on public.grades for select to authenticated
  using (public.is_teacher_of(class_id) or (released and (student_id = auth.uid() or public.is_parent_of(student_id))));

-- jadwal & absensi
create policy schedules_read on public.schedules for select to authenticated
  using (teacher_id = auth.uid() or public.is_teacher_of(class_id) or public.is_member_of(class_id) or public.parent_sees_class(class_id));
create policy schedules_write on public.schedules for all to authenticated
  using (public.is_teacher_of(class_id)) with check (public.is_teacher_of(class_id));
create policy attendances_select on public.attendances for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_of(class_id) or public.is_parent_of(student_id));

-- orang tua
create policy ps_select on public.parent_students for select to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid());
create policy ps_delete on public.parent_students for delete to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid());

-- branding, audit, log ujian
create policy branding_read on public.school_branding for select to authenticated using (school_id = public.my_school());
create policy branding_insert on public.school_branding for insert to authenticated with check (public.is_school_admin(school_id));
create policy branding_update on public.school_branding for update to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));
create policy platform_read on public.platform_branding for select to authenticated using (true);
create policy platform_update on public.platform_branding for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy audit_read on public.audit_log for select to authenticated using (public.is_school_admin(school_id));
create policy violations_read on public.exam_violations for select to authenticated using (public.is_submission_teacher(submission_id));
create policy activity_read on public.exam_activity_log for select to authenticated using (public.is_submission_teacher(submission_id));
-- rate_limits & parent_codes: RLS aktif tanpa policy → tidak bisa diakses langsung.

-- ---------------------------------------------------------------------
-- 8. STORAGE: bucket school-assets (baca publik, tulis hanya admin sekolah)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-assets', 'school-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists school_assets_select on storage.objects;
drop policy if exists school_assets_insert on storage.objects;
drop policy if exists school_assets_update on storage.objects;
drop policy if exists school_assets_delete on storage.objects;
create policy school_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'school-assets');
create policy school_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'school-assets' and public.is_school_admin(public.uuid_or_null((storage.foldername(name))[1])));
create policy school_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'school-assets' and public.is_school_admin(public.uuid_or_null((storage.foldername(name))[1])))
  with check (bucket_id = 'school-assets' and public.is_school_admin(public.uuid_or_null((storage.foldername(name))[1])));
create policy school_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'school-assets' and public.is_school_admin(public.uuid_or_null((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
-- 9. FUNGSI INTERNAL UJIAN (tidak bisa dipanggil dari aplikasi)
-- ---------------------------------------------------------------------
create or replace function public._req_header(p_name text) returns text
language plpgsql stable as $$
begin
  return nullif(current_setting('request.headers', true)::jsonb ->> p_name, '');
exception when others then return null;
end $$;

create or replace function public._req_ip() returns text
language sql stable as $$
  select nullif(btrim(split_part(coalesce(public._req_header('x-forwarded-for'), public._req_header('cf-connecting-ip'), ''), ',', 1)), '')
$$;

-- Batas permintaan per menit per pengguna (anti scraping / spam)
create or replace function public._rate_check(p_bucket text, p_max int) returns void
language plpgsql security definer set search_path = public as $$
declare h int;
begin
  insert into public.rate_limits (user_id, bucket, window_start, hits)
  values (auth.uid(), p_bucket, date_trunc('minute', now()), 1)
  on conflict (user_id, bucket) do update set
    hits = case when public.rate_limits.window_start = date_trunc('minute', now()) then public.rate_limits.hits + 1 else 1 end,
    window_start = date_trunc('minute', now())
  returning hits into h;
  if h > p_max then raise exception 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.'; end if;
end $$;

-- Validasi sesi ujian: pemilik, belum dikumpulkan, token cocok, waktu belum habis.
create or replace function public._session(p_sid uuid, p_token text, p_allow_expired boolean default false)
returns public.submissions
language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype; e public.exams%rowtype; dl timestamptz;
begin
  select * into s from public.submissions where id = p_sid and student_id = auth.uid() and exam_id is not null;
  if not found then raise exception 'Pengerjaan tidak ditemukan'; end if;
  if s.status <> 'in_progress' then raise exception 'SUDAH_DIKUMPULKAN: Pengerjaan sudah dikumpulkan'; end if;
  if s.session_token is distinct from p_token then raise exception 'SESSION_REPLACED: Ujian dibuka di perangkat atau tab lain'; end if;
  if not p_allow_expired then
    select * into e from public.exams where id = s.exam_id;
    dl := public._deadline(s.started_at, e.duration_minutes, e.ends_at);
    if dl is not null and now() > dl + interval '30 seconds' then raise exception 'WAKTU_HABIS: Waktu pengerjaan sudah habis'; end if;
  end if;
  return s;
end $$;

-- ---------------------------------------------------------------------
-- 10. FUNGSI UJIAN (dipanggil aplikasi). Kunci jawaban TIDAK PERNAH dikirim.
-- ---------------------------------------------------------------------
drop function if exists public.start_exam(uuid);
create or replace function public.start_exam(p_exam uuid, p_device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.exams%rowtype; s public.submissions%rowtype; used int; dl timestamptz;
  tok text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  seed text; qo jsonb; oo jsonb;
  ip text := public._req_ip(); ua text := left(public._req_header('user-agent'), 400);
  dev text := left(coalesce(p_device, ''), 64);
begin
  perform public._rate_check('start_exam', 20);
  select * into e from public.exams where id = p_exam;
  if not found or not e.published or not public.is_member_of(e.class_id) then raise exception 'Ujian tidak ditemukan'; end if;

  select * into s from public.submissions
    where exam_id = p_exam and student_id = auth.uid() and status = 'in_progress'
    order by attempt_no desc limit 1;
  if found then
    dl := public._deadline(s.started_at, e.duration_minutes, e.ends_at);
    if dl is null or now() <= dl then
      -- Lanjutkan: token diganti → perangkat/tab lama otomatis terkunci keluar.
      update public.submissions set session_token = tok, device_id = dev, last_seen_at = now() where id = s.id;
      if s.device_id is not null and s.device_id <> dev then
        insert into public.exam_violations (submission_id, violation_type, severity, details)
        values (s.id, 'multiple_device', 3, jsonb_build_object('old_device', s.device_id, 'new_device', dev, 'ip', ip));
        update public.submissions set violation_count = violation_count + 1 where id = s.id;
      end if;
      insert into public.exam_activity_log (submission_id, activity_type, details)
      values (s.id, 'resume', jsonb_build_object('ip', ip));
      return jsonb_build_object('submission_id', s.id, 'token', tok);
    end if;
    perform public._finalize(s.id);  -- waktu habis → kumpulkan otomatis
  end if;

  if e.starts_at is not null and now() < e.starts_at then return jsonb_build_object('error', 'Ujian belum dimulai'); end if;
  if e.ends_at is not null and now() > e.ends_at then return jsonb_build_object('error', 'Waktu ujian sudah berakhir'); end if;
  select count(*) into used from public.submissions where exam_id = p_exam and student_id = auth.uid();
  if used >= e.max_attempts then return jsonb_build_object('error', 'Jumlah percobaan sudah habis'); end if;

  -- Acak deterministik per siswa+ujian (md5), disimpan agar konsisten walau refresh.
  -- Kunci dipetakan ke ID pilihan, bukan label A/B/C/D, jadi mengacak pilihan aman.
  seed := auth.uid()::text || e.id::text;
  qo := (select coalesce(jsonb_agg(q.id order by case when e.shuffle_questions then md5(seed || q.id::text) end, q.position, q.id), '[]'::jsonb)
         from public.questions q where q.exam_id = e.id);
  oo := (select coalesce(jsonb_object_agg(x.qid, x.arr), '{}'::jsonb) from (
           select q.id::text as qid,
                  (select coalesce(jsonb_agg(c.id order by case when e.shuffle_options and q.type = 'pilihan_ganda' then md5(seed || c.id::text) end, c.position, c.id), '[]'::jsonb)
                   from public.choices c where c.question_id = q.id) as arr
           from public.questions q where q.exam_id = e.id and q.type in ('pilihan_ganda', 'benar_salah')) x);

  insert into public.submissions (class_id, exam_id, student_id, attempt_no, status, session_token, device_id, ip_address, user_agent, question_order, option_orders, last_seen_at)
  values (e.class_id, p_exam, auth.uid(), used + 1, 'in_progress', tok, dev, ip, ua, qo, oo, now())
  returning * into s;
  insert into public.exam_activity_log (submission_id, activity_type, details)
  values (s.id, 'start_exam', jsonb_build_object('ip', ip, 'attempt', used + 1));
  return jsonb_build_object('submission_id', s.id, 'token', tok);
end $$;

create or replace function public.get_exam_questions(p_submission uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype; e public.exams%rowtype; qo uuid[]; dl timestamptz; rem int; qs jsonb; ans jsonb;
begin
  perform public._rate_check('get_questions', 30);
  s := public._session(p_submission, p_token);
  select * into e from public.exams where id = s.exam_id;
  qo := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(s.question_order, '[]'::jsonb)) x), '{}'::uuid[]);
  dl := public._deadline(s.started_at, e.duration_minutes, e.ends_at);
  rem := case when dl is null then null else greatest(0, floor(extract(epoch from (dl - now())))::int) end;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', q.id, 'type', q.type, 'body', q.body, 'points', q.points,
      'choices', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label)
          order by coalesce(array_position(
            (select array_agg(z::uuid) from jsonb_array_elements_text(coalesce(s.option_orders -> (q.id::text), '[]'::jsonb)) z), c.id), 1000000), c.position, c.id)
        from public.choices c where c.question_id = q.id), '[]'::jsonb))
    order by coalesce(array_position(qo, q.id), 1000000), q.position, q.id), '[]'::jsonb)
  into qs from public.questions q where q.exam_id = s.exam_id;

  select coalesce(jsonb_object_agg(a.question_id::text, jsonb_build_object('choice_id', a.choice_id, 'answer_text', a.answer_text)), '{}'::jsonb)
  into ans from public.answers a where a.submission_id = s.id;

  return jsonb_build_object('title', e.title, 'remaining', rem, 'questions', qs, 'answers', ans,
                            'anticheat', e.anticheat, 'violations', s.violation_count, 'limit', e.violation_limit);
end $$;

drop function if exists public.save_answer(uuid, uuid, uuid, text);
create or replace function public.save_answer(p_submission uuid, p_token text, p_question uuid, p_choice uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype; e public.exams%rowtype; dl timestamptz; rem int;
  ip text := public._req_ip(); ua text := left(public._req_header('user-agent'), 400);
begin
  perform public._rate_check('save_answer', 90);
  s := public._session(p_submission, p_token);
  if not exists (select 1 from public.questions where id = p_question and exam_id = s.exam_id) then raise exception 'Soal tidak valid'; end if;
  if p_choice is not null and not exists (select 1 from public.choices where id = p_choice and question_id = p_question) then
    raise exception 'Pilihan tidak valid';
  end if;
  if char_length(coalesce(p_text, '')) > 10000 then raise exception 'Jawaban terlalu panjang'; end if;

  insert into public.answers (submission_id, question_id, choice_id, answer_text)
  values (s.id, p_question, p_choice, p_text)
  on conflict (submission_id, question_id)
  do update set choice_id = excluded.choice_id, answer_text = excluded.answer_text, updated_at = now();
  insert into public.exam_activity_log (submission_id, activity_type, details)
  values (s.id, 'answer_question', jsonb_build_object('question_id', p_question));
  update public.submissions set last_seen_at = now() where id = s.id;

  -- Perubahan IP wajar di jaringan seluler → hanya dicatat. Perubahan user-agent → pelanggaran (tidak menambah hitungan auto-submit).
  if ip is not null and s.ip_address is not null and ip <> s.ip_address then
    insert into public.exam_activity_log (submission_id, activity_type, details)
    values (s.id, 'ip_change', jsonb_build_object('old', s.ip_address, 'new', ip));
    update public.submissions set ip_address = ip where id = s.id;
  end if;
  if ua is not null and s.user_agent is not null and ua <> s.user_agent then
    insert into public.exam_violations (submission_id, violation_type, severity, details)
    values (s.id, 'device_change', 2, jsonb_build_object('old', s.user_agent, 'new', ua));
    update public.submissions set user_agent = ua where id = s.id;
  end if;

  select * into e from public.exams where id = s.exam_id;
  dl := public._deadline(s.started_at, e.duration_minutes, e.ends_at);
  rem := case when dl is null then null else greatest(0, floor(extract(epoch from (dl - now())))::int) end;
  return jsonb_build_object('remaining', rem);
end $$;

create or replace function public.exam_ping(p_submission uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype; e public.exams%rowtype; dl timestamptz; rem int;
begin
  perform public._rate_check('ping', 20);
  s := public._session(p_submission, p_token);
  select * into e from public.exams where id = s.exam_id;
  dl := public._deadline(s.started_at, e.duration_minutes, e.ends_at);
  rem := case when dl is null then null else greatest(0, floor(extract(epoch from (dl - now())))::int) end;
  update public.submissions set last_seen_at = now() where id = s.id;
  return jsonb_build_object('remaining', rem);
end $$;

create or replace function public.log_event(p_submission uuid, p_token text, p_type text, p_details jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype; e public.exams%rowtype; sev int; d jsonb; cnt int; auto boolean := false; secs numeric := 0;
begin
  perform public._rate_check('log_event', 120);
  s := public._session(p_submission, p_token);
  select * into e from public.exams where id = s.exam_id;
  if not e.anticheat then return jsonb_build_object('violations', 0, 'limit', 0, 'auto_submitted', false); end if;

  d := case when p_details is null or jsonb_typeof(p_details) <> 'object' or length(p_details::text) > 1000 then '{}'::jsonb else p_details end;
  if (d ->> 'seconds') ~ '^[0-9]+(\.[0-9]+)?$' then secs := (d ->> 'seconds')::numeric; end if;
  if p_type not in ('left_page', 'fullscreen_exit', 'screenshot_key', 'resize_shrink', 'devtools_open', 'pip_open',
                    'blur_short', 'copy_attempt', 'paste_attempt', 'contextmenu', 'back_attempt', 'shortcut_blocked', 'submit_click') then
    p_type := 'other';
  end if;
  sev := case p_type
    when 'left_page' then case when secs >= 30 then 2 else 1 end
    when 'fullscreen_exit' then 2
    when 'screenshot_key' then 2
    when 'resize_shrink' then 1
    when 'devtools_open' then 1
    when 'pip_open' then 1
    else 0 end;

  insert into public.exam_activity_log (submission_id, activity_type, details) values (s.id, p_type, d);
  cnt := s.violation_count;
  if sev > 0 then
    insert into public.exam_violations (submission_id, violation_type, severity, details) values (s.id, p_type, sev, d);
    update public.submissions set violation_count = violation_count + 1 where id = s.id returning violation_count into cnt;
    if e.violation_limit > 0 and cnt >= e.violation_limit then
      insert into public.exam_activity_log (submission_id, activity_type, details)
      values (s.id, 'auto_submit', jsonb_build_object('reason', 'violation_limit'));
      perform public._finalize(s.id);
      auto := true;
    end if;
  end if;
  return jsonb_build_object('violations', cnt, 'limit', e.violation_limit, 'auto_submitted', auto);
end $$;

-- Kumpulkan otomatis semua pengerjaan yang waktunya sudah habis (dipanggil pg_cron tiap menit)
create or replace function public.finalize_expired_submissions() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select s.id from public.submissions s join public.exams e on e.id = s.exam_id
    where s.status = 'in_progress'
      and public._deadline(s.started_at, e.duration_minutes, e.ends_at) < now() - interval '60 seconds'
    limit 500
  loop
    insert into public.exam_activity_log (submission_id, activity_type, details) values (r.id, 'auto_submit', '{"reason":"time_up"}');
    perform public._finalize(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

do $$
begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron belum aktif: aktifkan di Database → Extensions. (%)', sqlerrm; end;
  begin perform cron.unschedule('leksis-finalize-expired'); exception when others then null; end;
  begin perform cron.schedule('leksis-finalize-expired', '* * * * *', 'select public.finalize_expired_submissions()');
  exception when others then raise notice 'Jadwal pg_cron belum dibuat: %', sqlerrm; end;
end $$;

-- ---------------------------------------------------------------------
-- 11. FUNGSI SEKOLAH, ABSENSI, ORANG TUA, ADMIN
-- ---------------------------------------------------------------------
create or replace function public.join_class(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; csch uuid; psch uuid;
begin
  if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu'; end if;
  if coalesce(public.my_role(), '') <> 'student' then raise exception 'Hanya akun siswa yang dapat bergabung ke kelas'; end if;
  perform public._rate_check('join_class', 10);
  select id, school_id into cid, csch from public.classes where code = upper(btrim(p_code));
  if cid is null then raise exception 'Kode kelas tidak ditemukan'; end if;
  select school_id into psch from public.profiles where id = auth.uid();
  if csch is not null then
    if psch is null then update public.profiles set school_id = csch where id = auth.uid();
    elsif psch <> csch then raise exception 'Kelas ini milik sekolah lain'; end if;
  elsif psch is not null then
    raise exception 'Kelas ini bukan kelas sekolah Anda';
  end if;
  insert into public.class_members (class_id, student_id) values (cid, auth.uid()) on conflict do nothing;
  return cid;
end $$;

create or replace function public.check_school_code(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', s.name,
           'kind', case when s.teacher_code = upper(btrim(p_code)) then 'teacher' else 'student' end)
  from public.schools s
  where s.teacher_code = upper(btrim(p_code)) or s.student_code = upper(btrim(p_code))
  limit 1
$$;

create or replace function public.school_public(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', s.name, 'logo_url', s.logo_url, 'display_name', b.display_name, 'tagline', b.tagline,
    'banner_url', b.banner_url, 'banner_position', b.banner_position, 'favicon_url', b.favicon_url,
    'primary_color', b.primary_color, 'secondary_color', b.secondary_color, 'accent_color', b.accent_color,
    'font_family', b.font_family, 'login_background_url', b.login_background_url, 'login_message', b.login_message,
    'footer_text', b.footer_text, 'contact_email', b.contact_email, 'contact_phone', b.contact_phone,
    'website_url', b.website_url, 'social_media', b.social_media, 'theme_mode', b.theme_mode)
  from public.schools s left join public.school_branding b on b.school_id = s.id
  where s.slug = lower(btrim(p_slug))
$$;

create or replace function public.join_school(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sch public.schools%rowtype; me public.profiles%rowtype; code text := upper(btrim(p_code));
begin
  perform public._rate_check('join_school', 10);
  select * into me from public.profiles where id = auth.uid();
  if not found or me.role not in ('student', 'teacher') then raise exception 'Peran akun Anda tidak dapat memakai kode ini'; end if;
  select * into sch from public.schools where teacher_code = code or student_code = code;
  if not found then raise exception 'Kode sekolah tidak ditemukan'; end if;
  if me.school_id is not null and me.school_id <> sch.id then raise exception 'Akun Anda sudah terdaftar di sekolah lain'; end if;
  if sch.teacher_code = code then
    update public.profiles set role = 'teacher', school_id = sch.id where id = me.id;
    perform set_config('leksis.allow_school_move', '1', true);
    update public.classes set school_id = sch.id where teacher_id = me.id and school_id is null;
  else
    if me.role = 'teacher' then raise exception 'Gunakan kode guru dari sekolah Anda'; end if;
    update public.profiles set school_id = sch.id where id = me.id;
  end if;
  return sch.id;
end $$;

create or replace function public.regenerate_school_code(p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := public.my_school();
begin
  if not public.is_school_admin(sid) then raise exception 'Tidak diizinkan'; end if;
  if p_kind = 'teacher' then update public.schools set teacher_code = public.gen_school_code() where id = sid;
  elsif p_kind = 'student' then update public.schools set student_code = public.gen_school_code() where id = sid;
  else raise exception 'Jenis kode tidak valid'; end if;
  insert into public.audit_log (school_id, user_id, action, details) values (sid, auth.uid(), 'code_regenerated', jsonb_build_object('kind', p_kind));
end $$;

create or replace function public.set_active_year(p_year uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select school_id into sid from public.academic_years where id = p_year;
  if sid is null or not public.is_school_admin(sid) then raise exception 'Tidak diizinkan'; end if;
  update public.academic_years set is_active = false where school_id = sid and is_active;
  update public.academic_years set is_active = true where id = p_year;
end $$;

create or replace function public.admin_set_user(p_user uuid, p_name text, p_nis text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := public.my_school(); t public.profiles%rowtype; newrole text := p_role;
begin
  if not public.is_school_admin(sid) then raise exception 'Tidak diizinkan'; end if;
  select * into t from public.profiles where id = p_user;
  if not found or t.school_id is distinct from sid then raise exception 'Pengguna tidak ada di sekolah ini'; end if;
  if t.role = 'school_admin' then newrole := 'school_admin'; end if;  -- peran admin tidak diubah dari sini
  if newrole not in ('teacher', 'student', 'parent', 'school_admin') then raise exception 'Peran tidak valid'; end if;
  if t.role = 'teacher' and newrole <> 'teacher' and exists (select 1 from public.classes where teacher_id = p_user) then
    raise exception 'Guru ini masih mengajar kelas. Pindahkan kelasnya dulu.';
  end if;
  update public.profiles set full_name = left(btrim(coalesce(p_name, '')), 100),
    nis = nullif(left(btrim(coalesce(p_nis, '')), 30), ''), role = newrole where id = p_user;
  insert into public.audit_log (school_id, user_id, action, details)
  values (sid, auth.uid(), 'user_updated', jsonb_build_object('user', p_user, 'role', newrole));
end $$;

create or replace function public.admin_remove_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := public.my_school(); t public.profiles%rowtype;
begin
  if not public.is_school_admin(sid) then raise exception 'Tidak diizinkan'; end if;
  select * into t from public.profiles where id = p_user;
  if not found or t.school_id is distinct from sid then raise exception 'Pengguna tidak ada di sekolah ini'; end if;
  if t.role = 'school_admin' then raise exception 'Admin sekolah tidak dapat dikeluarkan'; end if;
  if exists (select 1 from public.classes where teacher_id = p_user) then
    raise exception 'Guru ini masih mengajar kelas. Pindahkan kelasnya dulu.';
  end if;
  delete from public.class_members where student_id = p_user
    and class_id in (select id from public.classes where school_id = sid);
  update public.profiles set school_id = null where id = p_user;
  insert into public.audit_log (school_id, user_id, action, details)
  values (sid, auth.uid(), 'user_removed', jsonb_build_object('user', p_user));
end $$;

create or replace function public.save_attendance(p_class uuid, p_date date, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; sid uuid;
begin
  if not public.is_teacher_of(p_class) then raise exception 'Tidak diizinkan'; end if;
  if p_date is null or p_date > current_date + 1 then raise exception 'Tanggal tidak valid'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 300 then raise exception 'Data tidak valid'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    if (r ->> 'status') not in ('Hadir', 'Sakit', 'Izin', 'Alpa') then raise exception 'Status kehadiran tidak valid'; end if;
    sid := public.uuid_or_null(r ->> 'student_id');
    if sid is null or not exists (select 1 from public.class_members where class_id = p_class and student_id = sid) then continue; end if;
    insert into public.attendances (class_id, student_id, date, status, note, recorded_by)
    values (p_class, sid, p_date, r ->> 'status', nullif(left(coalesce(r ->> 'note', ''), 300), ''), auth.uid())
    on conflict (class_id, student_id, date)
    do update set status = excluded.status, note = excluded.note, recorded_by = auth.uid();
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.my_parent_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if coalesce(public.my_role(), '') <> 'student' then raise exception 'Hanya untuk akun siswa'; end if;
  insert into public.parent_codes (student_id, code) values (auth.uid(), public.gen_parent_code()) on conflict (student_id) do nothing;
  select code into c from public.parent_codes where student_id = auth.uid();
  return c;
end $$;

create or replace function public.reset_parent_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text := public.gen_parent_code();
begin
  if coalesce(public.my_role(), '') <> 'student' then raise exception 'Hanya untuk akun siswa'; end if;
  insert into public.parent_codes (student_id, code) values (auth.uid(), c)
  on conflict (student_id) do update set code = excluded.code;
  return c;
end $$;

create or replace function public.link_child(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare sid uuid; nm text;
begin
  if coalesce(public.my_role(), '') <> 'parent' then raise exception 'Hanya untuk akun orang tua'; end if;
  perform public._rate_check('link_child', 10);
  select pc.student_id, p.full_name into sid, nm from public.parent_codes pc
    join public.profiles p on p.id = pc.student_id where pc.code = upper(btrim(p_code));
  if sid is null then raise exception 'Kode tidak ditemukan'; end if;
  insert into public.parent_students (parent_id, student_id) values (auth.uid(), sid) on conflict do nothing;
  return nm;
end $$;

-- ---------------------------------------------------------------------
-- 12. HAK AKSES
-- ---------------------------------------------------------------------
revoke all on public.rate_limits, public.parent_codes from anon, authenticated;
grant select on public.schools, public.academic_years, public.subjects, public.schedules, public.attendances,
  public.parent_students, public.platform_branding, public.school_branding, public.audit_log,
  public.exam_violations, public.exam_activity_log to authenticated;
grant update (name, slug, address, logo_url, principal_id) on public.schools to authenticated;
grant delete on public.schools to authenticated;
grant insert, update, delete on public.academic_years, public.subjects, public.schedules to authenticated;
grant delete on public.parent_students to authenticated;
grant insert, update on public.school_branding to authenticated;
grant update on public.platform_branding to authenticated;
revoke all on public.schools, public.academic_years, public.subjects, public.schedules, public.attendances,
  public.parent_students, public.platform_branding, public.school_branding, public.audit_log,
  public.exam_violations, public.exam_activity_log from anon;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to authenticated;
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like '\_%' or p.prorettype = 'trigger'::regtype or p.proname = 'finalize_expired_submissions')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
-- Hanya dua fungsi ini yang boleh dipanggil sebelum login (halaman login sekolah & cek kode saat daftar)
grant execute on function public.school_public(text) to anon;
grant execute on function public.check_school_code(text) to anon;
