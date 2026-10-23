-- Schema inicial. Todas as datas em timestamptz (UTC); o fuso do atendimento fica em professionals.timezone.
create extension if not exists btree_gist;

-- ───────────── Autenticação ─────────────
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Limitação de requisições / tentativas de login (janela deslizante simples)
create table rate_limit_events (
  id bigserial primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_idx on rate_limit_events (bucket, created_at);

-- ───────────── Profissionais, serviços e disponibilidade ─────────────
create table professionals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null,
  crp text,
  show_crp boolean not null default false,
  headline text,
  bio text,
  photo_url text,
  approach text,
  education text[] not null default '{}',
  experience text[] not null default '{}',
  languages text[] not null default '{}',
  specialties text[] not null default '{}',
  faq jsonb not null default '[]',
  how_it_works text,
  online_instructions text,
  address text,
  contact_email text,
  external_links jsonb not null default '[]',
  -- regras de agenda
  timezone text not null default 'America/Sao_Paulo',
  slot_step_minutes int not null default 30 check (slot_step_minutes between 5 and 240),
  buffer_minutes int not null default 10 check (buffer_minutes between 0 and 120),
  min_notice_hours int not null default 12 check (min_notice_hours >= 0),
  max_advance_days int not null default 60 check (max_advance_days between 1 and 365),
  cancel_deadline_hours int not null default 24 check (cancel_deadline_hours >= 0),
  max_per_day int check (max_per_day is null or max_per_day > 0),
  require_email boolean not null default false,
  -- comunicação
  whatsapp_contact_enabled boolean not null default false,
  whatsapp_contact_number text,
  send_reminders boolean not null default true,
  extra_reminder_hours int check (extra_reminder_hours is null or extra_reminder_hours between 1 and 12),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  name text not null,
  description text,
  instructions text,
  duration_minutes int not null check (duration_minutes between 10 and 480),
  price_cents int check (price_cents is null or price_cents >= 0),
  modality text not null check (modality in ('online', 'presencial')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_prof_idx on services (professional_id);

-- Janelas de atendimento. Almoço/descanso = intervalo entre duas janelas do mesmo dia.
-- weekday segue ISO (1 = segunda … 7 = domingo).
create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index availability_rules_prof_idx on availability_rules (professional_id, weekday);

create table blocked_periods (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  kind text not null default 'block' check (kind in ('block', 'vacation', 'holiday', 'dayoff')),
  reason text,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index blocked_periods_idx on blocked_periods (professional_id, start_at, end_at);

-- ───────────── Pacientes (dados administrativos, não é prontuário) ─────────────
create table patients (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  contact_preference text not null default 'whatsapp' check (contact_preference in ('whatsapp', 'email', 'none')),
  reminders_opt_in boolean not null default true,
  admin_notes text,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, phone)
);
create index patients_name_idx on patients (professional_id, lower(name));

create table consent_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  consent_type text not null check (consent_type in ('data_processing', 'whatsapp_contact', 'email_contact')),
  text_version text not null,
  source text not null,
  created_at timestamptz not null default now()
);
create index consent_records_patient_idx on consent_records (patient_id);

-- ───────────── Agendamentos ─────────────
create table appointments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  professional_id uuid not null references professionals(id) on delete cascade,
  patient_id uuid not null references patients(id),
  service_id uuid not null references services(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  -- fim efetivo da ocupação = end_at + intervalo de preparação vigente na criação
  block_end_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  modality text not null check (modality in ('online', 'presencial')),
  timezone text not null,
  source text not null default 'online' check (source in ('online', 'manual')),
  admin_notes text,
  patient_note text,
  idempotency_key text,
  rescheduled_count int not null default 0,
  manage_token_version int not null default 1,
  patient_confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  cancelled_by text check (cancelled_by in ('patient', 'professional', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (block_end_at >= end_at),
  -- GARANTIA FINAL contra conflitos: nenhuma sobreposição [início, fim+intervalo) por profissional
  -- entre agendamentos que ocupam a agenda. Intervalos semiabertos permitem consultas consecutivas.
  constraint appointments_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(start_at, block_end_at, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'completed', 'no_show'))
);
create unique index appointments_idem_key on appointments (professional_id, idempotency_key)
  where idempotency_key is not null;
create index appointments_prof_start_idx on appointments (professional_id, start_at);
create index appointments_patient_idx on appointments (patient_id);

create table appointment_history (
  id bigserial primary key,
  appointment_id uuid not null references appointments(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  actor_type text not null check (actor_type in ('patient', 'professional', 'system')),
  action text not null,
  from_start timestamptz,
  from_end timestamptz,
  to_start timestamptz,
  to_end timestamptz,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create index appointment_history_idx on appointment_history (appointment_id, created_at);

-- ───────────── Notificações (fila persistente) ─────────────
create table notification_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'email')),
  type text not null check (type in
    ('confirmation', 'reminder_24h', 'reminder_extra', 'rescheduled', 'cancelled', 'waitlist_offer')),
  scheduled_at timestamptz not null,
  -- início da consulta no momento do enfileiramento: o worker descarta o job se a consulta mudou
  appointment_start_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'delivered', 'failed', 'cancelled', 'skipped', 'test_sent')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  locked_at timestamptz,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_jobs_due_idx on notification_jobs (scheduled_at) where status in ('pending', 'processing');
create index notification_jobs_appt_idx on notification_jobs (appointment_id);
create index notification_jobs_provider_idx on notification_jobs (provider_message_id) where provider_message_id is not null;

create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'email')),
  type text not null,
  body text not null,
  provider_template_name text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  updated_at timestamptz not null default now(),
  unique (professional_id, channel, type)
);

create table webhook_events (
  id bigserial primary key,
  provider text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

-- ───────────── Lista de espera ─────────────
create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  status text not null default 'waiting' check (status in ('waiting', 'notified', 'booked', 'cancelled')),
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  check (date_to >= date_from)
);
create index waitlist_prof_idx on waitlist_entries (professional_id, status);

-- ───────────── Auditoria ─────────────
create table audit_logs (
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  professional_id uuid references professionals(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_prof_idx on audit_logs (professional_id, created_at desc);
