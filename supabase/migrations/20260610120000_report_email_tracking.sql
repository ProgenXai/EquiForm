alter table public.reports
  add column if not exists report_email_sent_at timestamptz,
  add column if not exists report_email_due_at timestamptz;

create index if not exists reports_pending_report_email_idx
  on public.reports (report_email_due_at)
  where report_email_sent_at is null
    and report_email_due_at is not null;
