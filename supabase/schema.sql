-- ============================================================
-- DocuSentinel AI — Complete Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. USER PROFILES
-- ============================================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null default '',
  email text not null,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin', 'reviewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Service role can manage profiles"
  on public.profiles for all
  using (auth.role() = 'service_role');

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. DOCUMENTS
-- ============================================================
create type document_category as enum (
  'contract', 'purchase_order', 'invoice', 'receipt', 'statement', 'compliance', 'other'
);

create type document_status as enum (
  'uploading', 'uploaded', 'processing', 'completed', 'error'
);

create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size bigint not null default 0,
  mime_type text not null default 'application/pdf',
  category document_category not null default 'other',
  classified_as document_category,
  status document_status not null default 'uploading',
  page_count integer,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  processing_error text,
  processing_attempts integer not null default 0,
  file_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_documents_user_id on public.documents(user_id);
create index idx_documents_status on public.documents(status);
create index idx_documents_category on public.documents(category);
create index idx_documents_created_at on public.documents(created_at desc);

alter table public.documents enable row level security;

create policy "Users can view own documents"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "Users can update own documents"
  on public.documents for update
  using (auth.uid() = user_id);

create policy "Users can delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 3. EXTRACTED FIELDS
-- ============================================================
create table if not exists public.extracted_fields (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.documents(id) on delete cascade,
  field_name text not null,
  field_value text,
  field_type text not null default 'text',
  confidence numeric(5,4) check (confidence >= 0 and confidence <= 1),
  is_missing boolean not null default false,
  is_ambiguous boolean not null default false,
  source_text text,
  source_page integer,
  created_at timestamptz not null default now()
);

create index idx_extracted_fields_document on public.extracted_fields(document_id);
create index idx_extracted_fields_name on public.extracted_fields(field_name);

alter table public.extracted_fields enable row level security;

create policy "Users can view own document fields"
  on public.extracted_fields for select
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_id and d.user_id = auth.uid()
    )
  );

create policy "Service role can manage extracted fields"
  on public.extracted_fields for all
  using (auth.role() = 'service_role');

-- ============================================================
-- 4. LINE ITEMS (for invoices and POs)
-- ============================================================
create table if not exists public.line_items (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.documents(id) on delete cascade,
  item_number integer,
  description text,
  quantity numeric(15,4),
  unit_price numeric(15,4),
  amount numeric(15,2),
  unit text,
  source_page integer,
  created_at timestamptz not null default now()
);

create index idx_line_items_document on public.line_items(document_id);

alter table public.line_items enable row level security;

create policy "Users can view own line items"
  on public.line_items for select
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_id and d.user_id = auth.uid()
    )
  );

create policy "Service role can manage line items"
  on public.line_items for all
  using (auth.role() = 'service_role');

-- ============================================================
-- 5. RECONCILIATION GROUPS
-- ============================================================
create type reconciliation_status as enum (
  'pending', 'matched', 'discrepancy', 'missing_po', 'missing_invoice', 'error'
);

create table if not exists public.reconciliation_groups (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  contract_id uuid references public.documents(id) on delete set null,
  purchase_order_id uuid references public.documents(id) on delete set null,
  invoice_id uuid references public.documents(id) on delete set null,
  status reconciliation_status not null default 'pending',
  contract_value numeric(15,2),
  po_value numeric(15,2),
  invoice_value numeric(15,2),
  variance numeric(15,2),
  variance_percentage numeric(7,3),
  currency text,
  vendor_name text,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_recon_groups_user on public.reconciliation_groups(user_id);
create index idx_recon_groups_status on public.reconciliation_groups(status);

alter table public.reconciliation_groups enable row level security;

create policy "Users can view own recon groups"
  on public.reconciliation_groups for select
  using (auth.uid() = user_id);

create policy "Users can manage own recon groups"
  on public.reconciliation_groups for all
  using (auth.uid() = user_id);

-- ============================================================
-- 6. FINDINGS
-- ============================================================
create type finding_severity as enum ('critical', 'high', 'medium', 'low', 'info');
create type finding_status as enum ('open', 'reviewing', 'accepted', 'rejected', 'resolved');
create type finding_type as enum (
  'amount_mismatch', 'supplier_mismatch', 'currency_mismatch',
  'quantity_discrepancy', 'unit_price_discrepancy', 'missing_field',
  'duplicate_invoice', 'payment_term_mismatch', 'date_discrepancy',
  'exceeds_po_amount', 'exceeds_contract_value', 'tax_discrepancy',
  'vendor_name_variation', 'unusual_amount', 'other'
);

create table if not exists public.findings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reconciliation_group_id uuid references public.reconciliation_groups(id) on delete set null,
  finding_type finding_type not null,
  severity finding_severity not null default 'medium',
  status finding_status not null default 'open',
  title text not null,
  description text not null,
  reason text,
  source_document_id uuid references public.documents(id) on delete set null,
  compared_document_id uuid references public.documents(id) on delete set null,
  source_value text,
  compared_value text,
  financial_impact numeric(15,2),
  currency text,
  source_field text,
  source_page integer,
  source_text text,
  compared_field text,
  compared_page integer,
  compared_text text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_findings_user on public.findings(user_id);
create index idx_findings_severity on public.findings(severity);
create index idx_findings_status on public.findings(status);
create index idx_findings_type on public.findings(finding_type);
create index idx_findings_recon_group on public.findings(reconciliation_group_id);

alter table public.findings enable row level security;

create policy "Users can view own findings"
  on public.findings for select
  using (auth.uid() = user_id);

create policy "Users can manage own findings"
  on public.findings for all
  using (auth.uid() = user_id);

-- ============================================================
-- 7. REVIEW COMMENTS
-- ============================================================
create table if not exists public.review_comments (
  id uuid primary key default uuid_generate_v4(),
  finding_id uuid not null references public.findings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null,
  action text check (action in ('comment', 'accept', 'reject', 'mark_reviewed', 'reopen', 'escalate')),
  previous_status finding_status,
  new_status finding_status,
  created_at timestamptz not null default now()
);

create index idx_review_comments_finding on public.review_comments(finding_id);
create index idx_review_comments_user on public.review_comments(user_id);

alter table public.review_comments enable row level security;

create policy "Users can view related comments"
  on public.review_comments for select
  using (
    exists (
      select 1 from public.findings f
      where f.id = finding_id and f.user_id = auth.uid()
    )
  );

create policy "Users can add comments"
  on public.review_comments for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- 8. AUDIT TRAIL
-- ============================================================
create table if not exists public.audit_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb default '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_audit_user on public.audit_events(user_id);
create index idx_audit_action on public.audit_events(action);
create index idx_audit_entity on public.audit_events(entity_type, entity_id);
create index idx_audit_created on public.audit_events(created_at desc);

alter table public.audit_events enable row level security;

create policy "Users can view own audit events"
  on public.audit_events for select
  using (auth.uid() = user_id);

create policy "Service role can manage audit events"
  on public.audit_events for all
  using (auth.role() = 'service_role');

-- ============================================================
-- 9. STORAGE BUCKET
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']
)
on conflict (id) do nothing;

create policy "Users can upload own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view own documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 10. UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_documents_updated_at
  before update on public.documents
  for each row execute procedure public.update_updated_at();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at();

create trigger set_recon_groups_updated_at
  before update on public.reconciliation_groups
  for each row execute procedure public.update_updated_at();

create trigger set_findings_updated_at
  before update on public.findings
  for each row execute procedure public.update_updated_at();
