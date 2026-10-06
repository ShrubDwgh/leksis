-- =====================================================================
-- LEKSIS — supabase.sql
-- Cara pakai: Supabase Dashboard → SQL Editor → New query → tempel SELURUH isi
-- file ini → Run. Aman dijalankan ulang (tabel tidak dihapus, policy dibuat ulang).
-- Jangan pernah menaruh secret / service_role key di aplikasi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. KODE KELAS (acak, dibuat di server)
-- ---------------------------------------------------------------------
create or replace function public.gen_class_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  u bytea; result text; i int;
begin
  loop
    u := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    result := '';
    for i in 0..5 loop
      result := result || substr(chars, 1 + (get_byte(u, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.classes where code = result);
  end loop;
  return result;
end $$;

-- ---------------------------------------------------------------------
-- 2. TABEL
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 100),
  role text not null default 'siswa' check (role in ('guru', 'siswa')),
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  code text not null unique default public.gen_class_code() check (code ~ '^[A-Z0-9]{6,10}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 150),
  content text not null default '' check (char_length(content) <= 20000),
  link_url text check (link_url is null or (link_url ~* '^https?://' and char_length(link_url) <= 500)),
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 150),
  content text not null default '' check (char_length(content) <= 20000),
  link_url text check (link_url is null or (link_url ~* '^https?://' and char_length(link_url) <= 500)),
  due_at timestamptz,
  max_score numeric(8,2) not null default 100 check (max_score > 0 and max_score <= 1000),
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 150),
  description text not null default '' check (char_length(description) <= 5000),
  duration_minutes int check (duration_minutes is null or duration_minutes between 1 and 600),
  starts_at timestamptz,
  ends_at timestamptz,
  max_attempts int not null default 1 check (max_attempts between 1 and 10),
  show_score boolean not null default false,   -- nilai langsung tampil setelah dinilai
  published boolean not null default false,    -- false = draf
  created_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  type text not null check (type in ('pilihan_ganda', 'benar_salah', 'jawaban_singkat', 'essay')),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  points numeric(8,2) not null default 1 check (points >= 0 and points <= 1000),
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Pilihan jawaban TIDAK menyimpan kunci. Kunci ada di answer_keys (tidak terlihat siswa).
create table if not exists public.choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 500),
  position int not null default 0
);

create table if not exists public.answer_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct_choice_id uuid references public.choices(id) on delete set null,
  accepted_answers text[] not null default '{}' check (cardinality(accepted_answers) <= 20)
);

-- Satu tabel untuk pengerjaan ujian (exam_id) dan pengumpulan tugas (assignment_id).
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attempt_no int not null default 1,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  content text check (content is null or char_length(content) <= 20000),
  link_url text check (link_url is null or (link_url ~* '^https?://' and char_length(link_url) <= 500)),
  check ((exam_id is null) <> (assignment_id is null))
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  choice_id uuid references public.choices(id) on delete set null,
  answer_text text check (answer_text is null or char_length(answer_text) <= 10000),
  score numeric(8,2),
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  updated_at timestamptz not null default now(),
  unique (submission_id, question_id)
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  score numeric(10,2) not null default 0,
  max_score numeric(10,2) not null default 0,
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  released boolean not null default false,     -- true = siswa boleh melihat nilai
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. INDEX
-- ---------------------------------------------------------------------
create index if not exists idx_classes_teacher on public.classes(teacher_id);
create index if not exists idx_members_student on public.class_members(student_id);
create index if not exists idx_materials_class on public.materials(class_id, created_at desc);
create index if not exists idx_assignments_class on public.assignments(class_id, created_at desc);
create index if not exists idx_exams_class on public.exams(class_id, created_at desc);
create index if not exists idx_questions_exam on public.questions(exam_id, position);
create index if not exists idx_choices_question on public.choices(question_id, position);
create index if not exists idx_sub_class on public.submissions(class_id);
create index if not exists idx_sub_exam on public.submissions(exam_id);
create index if not exists idx_sub_assignment on public.submissions(assignment_id);
create index if not exists idx_sub_student on public.submissions(student_id);
create unique index if not exists uq_sub_exam_attempt on public.submissions(exam_id, student_id, attempt_no) where exam_id is not null;
create unique index if not exists uq_sub_assignment on public.submissions(assignment_id, student_id) where assignment_id is not null;
create index if not exists idx_answers_sub on public.answers(submission_id);
create index if not exists idx_grades_class on public.grades(class_id);
create index if not exists idx_grades_student on public.grades(student_id);

-- ---------------------------------------------------------------------
-- 4. PROFIL OTOMATIS SAAT DAFTAR (role hanya 'guru' atau 'siswa')
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), 100),
    case when new.raw_user_meta_data->>'role' = 'guru' then 'guru' else 'siswa' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 5. FUNGSI BANTU UNTUK RLS (security definer → menghindari rekursi policy)
-- ---------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_teacher_of(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes where id = cid and teacher_id = auth.uid())
$$;

create or replace function public.is_member_of(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members where class_id = cid and student_id = auth.uid())
$$;

create or replace function public.is_exam_teacher(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.exams e join public.classes c on c.id = e.class_id
    where e.id = eid and c.teacher_id = auth.uid())
$$;

create or replace function public.is_question_teacher(qid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.questions q
    join public.exams e on e.id = q.exam_id
    join public.classes c on c.id = e.class_id
    where q.id = qid and c.teacher_id = auth.uid())
$$;

-- Guru boleh melihat profil siswa di kelasnya; siswa boleh melihat profil guru kelasnya.
-- Siswa TIDAK bisa melihat profil teman sekelas.
create or replace function public.can_see_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_members m join public.classes c on c.id = m.class_id
    where (c.teacher_id = auth.uid() and m.student_id = pid)
       or (m.student_id = auth.uid() and c.teacher_id = pid))
$$;

-- Soal ujian hanya terlihat oleh siswa SETELAH ia memulai pengerjaan (ada submission).
create or replace function public.exam_content_visible(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.exams e join public.classes c on c.id = e.class_id
    where e.id = eid and (
      c.teacher_id = auth.uid()
      or (e.published
          and exists (select 1 from public.class_members m where m.class_id = e.class_id and m.student_id = auth.uid())
          and exists (select 1 from public.submissions s where s.exam_id = e.id and s.student_id = auth.uid()))))
$$;

create or replace function public.question_visible(qid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.questions q where q.id = qid and public.exam_content_visible(q.exam_id))
$$;

-- Kunci jawaban: guru kapan saja; siswa hanya jika ujian sudah ditutup (+2 menit),
-- nilai diizinkan tampil, dan siswa sudah pernah mengumpulkan.
create or replace function public.can_read_key(qid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.questions q
    join public.exams e on e.id = q.exam_id
    join public.classes c on c.id = e.class_id
    where q.id = qid and (
      c.teacher_id = auth.uid()
      or (e.published and e.show_score and e.ends_at is not null
          and e.ends_at < now() - interval '2 minutes'
          and exists (select 1 from public.submissions s
                      where s.exam_id = e.id and s.student_id = auth.uid() and s.status <> 'in_progress'))))
$$;

-- Jawaban: guru kelas; siswa hanya miliknya, dan setelah dikumpulkan hanya jika nilai sudah dirilis.
create or replace function public.can_read_answers(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.submissions s
    where s.id = sid and (
      public.is_teacher_of(s.class_id)
      or (s.student_id = auth.uid()
          and (s.status = 'in_progress'
               or exists (select 1 from public.grades g where g.submission_id = s.id and g.released)))))
$$;

create or replace function public._deadline(p_started timestamptz, p_minutes int, p_ends timestamptz)
returns timestamptz language sql immutable as $$
  select least(case when p_minutes is null then null else p_started + make_interval(mins => p_minutes) end, p_ends)
$$;

-- ---------------------------------------------------------------------
-- 6. RLS — aktifkan di semua tabel
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.materials enable row level security;
alter table public.assignments enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.choices enable row level security;
alter table public.answer_keys enable row level security;
alter table public.submissions enable row level security;
alter table public.answers enable row level security;
alter table public.grades enable row level security;

-- Hapus policy lama (agar file ini bisa dijalankan ulang)
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
-- (kolom role tidak bisa diubah: hanya kolom full_name yang di-GRANT untuk update, lihat bagian 8)

-- classes
create policy classes_select on public.classes for select to authenticated
  using (teacher_id = auth.uid() or public.is_member_of(id));
create policy classes_insert on public.classes for insert to authenticated
  with check (teacher_id = auth.uid() and coalesce(public.my_role(), '') = 'guru');
create policy classes_update on public.classes for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy classes_delete on public.classes for delete to authenticated
  using (teacher_id = auth.uid());

-- class_members (siswa masuk lewat fungsi join_class, bukan insert langsung)
create policy members_select on public.class_members for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_of(class_id));
create policy members_delete on public.class_members for delete to authenticated
  using (student_id = auth.uid() or public.is_teacher_of(class_id));

-- materials
create policy materials_teacher on public.materials for all to authenticated
  using (public.is_teacher_of(class_id)) with check (public.is_teacher_of(class_id));
create policy materials_read on public.materials for select to authenticated
  using (published and public.is_member_of(class_id));

-- assignments
create policy assignments_teacher on public.assignments for all to authenticated
  using (public.is_teacher_of(class_id)) with check (public.is_teacher_of(class_id));
create policy assignments_read on public.assignments for select to authenticated
  using (published and public.is_member_of(class_id));

-- exams
create policy exams_teacher on public.exams for all to authenticated
  using (public.is_teacher_of(class_id)) with check (public.is_teacher_of(class_id));
create policy exams_read on public.exams for select to authenticated
  using (published and public.is_member_of(class_id));

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

-- submissions / answers / grades: hanya SELECT. Semua perubahan lewat fungsi di bagian 7.
create policy submissions_select on public.submissions for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_of(class_id));
create policy answers_select on public.answers for select to authenticated
  using (public.can_read_answers(submission_id));
create policy grades_select on public.grades for select to authenticated
  using (public.is_teacher_of(class_id) or (student_id = auth.uid() and released));

-- ---------------------------------------------------------------------
-- 7. FUNGSI RPC (satu-satunya jalan siswa mengubah submission/jawaban/nilai)
-- ---------------------------------------------------------------------
create or replace function public.join_class(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu'; end if;
  if coalesce(public.my_role(), '') <> 'siswa' then raise exception 'Hanya akun siswa yang dapat bergabung ke kelas'; end if;
  select id into cid from public.classes where code = upper(btrim(p_code));
  if cid is null then raise exception 'Kode kelas tidak ditemukan'; end if;
  insert into public.class_members (class_id, student_id) values (cid, auth.uid()) on conflict do nothing;
  return cid;
end $$;

create or replace function public.submit_assignment(p_assignment uuid, p_content text, p_link text) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.assignments%rowtype; sid uuid; st text; link text := nullif(btrim(coalesce(p_link, '')), '');
begin
  select * into a from public.assignments where id = p_assignment;
  if not found or not a.published or not public.is_member_of(a.class_id) then raise exception 'Tugas tidak ditemukan'; end if;
  if coalesce(btrim(p_content), '') = '' and link is null then raise exception 'Isi jawaban atau tautan wajib diisi'; end if;
  if char_length(coalesce(p_content, '')) > 20000 then raise exception 'Jawaban terlalu panjang'; end if;
  if link is not null and (link !~* '^https?://' or char_length(link) > 500) then raise exception 'Tautan harus diawali http:// atau https://'; end if;
  select id, status into sid, st from public.submissions where assignment_id = p_assignment and student_id = auth.uid();
  if sid is not null and st = 'graded' then raise exception 'Tugas sudah dinilai dan tidak dapat diubah'; end if;
  if sid is null then
    insert into public.submissions (class_id, assignment_id, student_id, status, content, link_url, submitted_at)
    values (a.class_id, p_assignment, auth.uid(), 'submitted', p_content, link, now()) returning id into sid;
  else
    update public.submissions set content = p_content, link_url = link, submitted_at = now() where id = sid;
  end if;
  return sid;
end $$;

-- Mulai / lanjutkan ujian. Mengembalikan {submission_id, deadline} atau {error}.
create or replace function public.start_exam(p_exam uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.exams%rowtype; s public.submissions%rowtype; used int; dl timestamptz;
begin
  select * into e from public.exams where id = p_exam;
  if not found or not e.published or not public.is_member_of(e.class_id) then raise exception 'Ujian tidak ditemukan'; end if;

  select * into s from public.submissions
    where exam_id = p_exam and student_id = auth.uid() and status = 'in_progress'
    order by attempt_no desc limit 1;
  if found then
    dl := public._deadline(s.started_at, e.duration_minutes, e.ends_at);
    if dl is null or now() <= dl then
      return jsonb_build_object('submission_id', s.id, 'deadline', dl);
    end if;
    perform public._finalize(s.id);  -- waktu habis: kumpulkan otomatis
  end if;

  if e.starts_at is not null and now() < e.starts_at then return jsonb_build_object('error', 'Ujian belum dimulai'); end if;
  if e.ends_at is not null and now() > e.ends_at then return jsonb_build_object('error', 'Waktu ujian sudah berakhir'); end if;
  select count(*) into used from public.submissions where exam_id = p_exam and student_id = auth.uid();
  if used >= e.max_attempts then return jsonb_build_object('error', 'Jumlah percobaan sudah habis'); end if;

  insert into public.submissions (class_id, exam_id, student_id, attempt_no, status)
  values (e.class_id, p_exam, auth.uid(), used + 1, 'in_progress') returning * into s;
  return jsonb_build_object('submission_id', s.id, 'deadline', public._deadline(s.started_at, e.duration_minutes, e.ends_at));
end $$;

create or replace function public.save_answer(p_submission uuid, p_question uuid, p_choice uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype; e public.exams%rowtype; dl timestamptz;
begin
  select * into s from public.submissions where id = p_submission and student_id = auth.uid();
  if not found or s.status <> 'in_progress' or s.exam_id is null then raise exception 'Pengerjaan sudah ditutup'; end if;
  select * into e from public.exams where id = s.exam_id;
  dl := public._deadline(s.started_at, e.duration_minutes, e.ends_at);
  if dl is not null and now() > dl + interval '30 seconds' then raise exception 'Waktu pengerjaan sudah habis'; end if;
  if not exists (select 1 from public.questions where id = p_question and exam_id = s.exam_id) then raise exception 'Soal tidak valid'; end if;
  if p_choice is not null and not exists (select 1 from public.choices where id = p_choice and question_id = p_question) then
    raise exception 'Pilihan tidak valid';
  end if;
  if char_length(coalesce(p_text, '')) > 10000 then raise exception 'Jawaban terlalu panjang'; end if;
  insert into public.answers (submission_id, question_id, choice_id, answer_text)
  values (p_submission, p_question, p_choice, p_text)
  on conflict (submission_id, question_id)
  do update set choice_id = excluded.choice_id, answer_text = excluded.answer_text, updated_at = now();
end $$;

-- Penilaian otomatis dilakukan DI SERVER. Tidak dapat dipanggil langsung dari aplikasi.
create or replace function public._recalc_grade(p_sid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype; e public.exams%rowtype; tot numeric; mx numeric; pend boolean; newst text; rel boolean;
begin
  select * into s from public.submissions where id = p_sid;
  if not found or s.exam_id is null or s.status = 'in_progress' then return; end if;
  select * into e from public.exams where id = s.exam_id;
  select coalesce(sum(points), 0) into mx from public.questions where exam_id = s.exam_id;
  select coalesce(sum(score), 0), coalesce(bool_or(score is null), false) into tot, pend
    from public.answers where submission_id = p_sid;
  newst := case when pend then 'submitted' else 'graded' end;
  rel := (s.status <> 'graded' and newst = 'graded' and e.show_score);
  update public.submissions set status = newst where id = p_sid;
  insert into public.grades (submission_id, class_id, student_id, score, max_score, released, graded_by, graded_at)
  values (p_sid, s.class_id, s.student_id, tot, mx, rel,
          case when public.is_teacher_of(s.class_id) then auth.uid() end, now())
  on conflict (submission_id) do update set
    score = excluded.score, max_score = excluded.max_score,
    released = public.grades.released or excluded.released,
    graded_by = coalesce(excluded.graded_by, public.grades.graded_by),
    graded_at = now();
end $$;

create or replace function public._finalize(p_sid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype;
begin
  select * into s from public.submissions where id = p_sid for update;
  if not found or s.status <> 'in_progress' or s.exam_id is null then return; end if;

  update public.answers a set score = case
      when q.type in ('pilihan_ganda', 'benar_salah') then
        case when a.choice_id is not null and a.choice_id = k.correct_choice_id then q.points else 0 end
      when q.type = 'jawaban_singkat' then
        case when coalesce(btrim(a.answer_text), '') <> '' and exists (
               select 1 from unnest(coalesce(k.accepted_answers, '{}'::text[])) x
               where lower(btrim(x)) = lower(btrim(a.answer_text))) then q.points else 0 end
      else case when coalesce(btrim(a.answer_text), '') = '' then 0 else null end  -- essay: dinilai guru
    end
  from public.questions q
  left join public.answer_keys k on k.question_id = q.id
  where a.submission_id = p_sid and q.id = a.question_id;

  update public.submissions set status = 'submitted', submitted_at = now() where id = p_sid;
  perform public._recalc_grade(p_sid);
end $$;

-- Dipakai siswa (mengumpulkan) atau guru kelas (mengakhiri paksa).
create or replace function public.submit_exam(p_submission uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype;
begin
  select * into s from public.submissions where id = p_submission;
  if not found or s.exam_id is null then raise exception 'Pengerjaan tidak ditemukan'; end if;
  if s.student_id <> auth.uid() and not public.is_teacher_of(s.class_id) then raise exception 'Tidak diizinkan'; end if;
  perform public._finalize(p_submission);
end $$;

create or replace function public.grade_answer(p_answer uuid, p_score numeric, p_feedback text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select an.submission_id, q.points, s.class_id, s.status into r
    from public.answers an
    join public.questions q on q.id = an.question_id
    join public.submissions s on s.id = an.submission_id
    where an.id = p_answer;
  if not found or not public.is_teacher_of(r.class_id) then raise exception 'Tidak diizinkan'; end if;
  if r.status = 'in_progress' then raise exception 'Pengerjaan belum selesai'; end if;
  if p_score is null or p_score < 0 or p_score > r.points then raise exception 'Nilai harus antara 0 dan bobot soal'; end if;
  update public.answers set score = p_score, feedback = left(p_feedback, 2000) where id = p_answer;
  perform public._recalc_grade(r.submission_id);
end $$;

-- Menilai tugas (pengumpulan tugas, bukan ujian).
create or replace function public.grade_submission(p_submission uuid, p_score numeric, p_feedback text, p_release boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype; mx numeric;
begin
  select * into s from public.submissions where id = p_submission and assignment_id is not null;
  if not found or not public.is_teacher_of(s.class_id) then raise exception 'Tidak diizinkan'; end if;
  select max_score into mx from public.assignments where id = s.assignment_id;
  if p_score is null or p_score < 0 or p_score > mx then raise exception 'Nilai harus antara 0 dan %', mx; end if;
  update public.submissions set status = 'graded' where id = p_submission;
  insert into public.grades (submission_id, class_id, student_id, score, max_score, feedback, released, graded_by, graded_at)
  values (p_submission, s.class_id, s.student_id, p_score, mx, left(p_feedback, 2000), coalesce(p_release, true), auth.uid(), now())
  on conflict (submission_id) do update set
    score = excluded.score, max_score = excluded.max_score, feedback = excluded.feedback,
    released = excluded.released, graded_by = auth.uid(), graded_at = now();
end $$;

create or replace function public.release_grade(p_submission uuid, p_release boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select class_id into cid from public.submissions where id = p_submission;
  if cid is null or not public.is_teacher_of(cid) then raise exception 'Tidak diizinkan'; end if;
  update public.grades set released = coalesce(p_release, false) where submission_id = p_submission;
end $$;

create or replace function public.release_exam_grades(p_exam uuid, p_release boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_exam_teacher(p_exam) then raise exception 'Tidak diizinkan'; end if;
  update public.grades set released = coalesce(p_release, false)
  where submission_id in (select id from public.submissions where exam_id = p_exam and status = 'graded');
end $$;

-- ---------------------------------------------------------------------
-- 8. HAK AKSES (lapisan kedua di bawah RLS)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.classes, public.materials, public.assignments, public.exams,
  public.questions, public.choices, public.answer_keys to authenticated;
grant delete on public.class_members to authenticated;
grant update (full_name) on public.profiles to authenticated;   -- role TIDAK bisa diubah user
-- submissions, answers, grades: tidak ada insert/update/delete langsung → hanya via fungsi RPC.

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to authenticated;
revoke execute on function public._finalize(uuid), public._recalc_grade(uuid), public.handle_new_user() from authenticated;
