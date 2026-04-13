-- Supabase SQL Editor에서 실행하세요

create table payroll (
  id uuid default gen_random_uuid() primary key,
  branch text not null,
  emp_name text not null,
  hourly_wage integer not null,
  scheduled_hours numeric not null,
  year integer not null,
  month integer not null,
  work_data jsonb,
  bonus numeric default 0,
  special_note text,
  basic_pay numeric default 0,
  weekly_holiday_pay numeric default 0,
  overtime_pay numeric default 0,
  night_pay numeric default 0,
  holiday_pay numeric default 0,
  holiday_overtime_pay numeric default 0,
  holiday_night_pay numeric default 0,
  grand_total numeric default 0,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

-- 같은 지점+직원+년월 중복 방지 (upsert 기준)
create unique index payroll_unique
  on payroll (branch, emp_name, year, month);

-- RLS 활성화
alter table payroll enable row level security;

-- 누구나 읽기/쓰기 가능 (비밀번호는 프론트에서 처리)
create policy "allow read" on payroll for select using (true);
create policy "allow insert" on payroll for insert with check (true);
create policy "allow update" on payroll for update using (true);
