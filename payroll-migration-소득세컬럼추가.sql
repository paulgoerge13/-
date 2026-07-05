-- ⚠️ Supabase → SQL Editor 에 그대로 붙여넣고 [Run] 하세요.
-- payroll 테이블에 "소득세·식대·공제·퇴직금·입퇴사일" 등 고정 설정 컬럼이 없어서
-- 저장 API가 이 값들을 조용히 버리던 문제를 해결합니다.
-- (IF NOT EXISTS 라서 이미 있는 컬럼은 건너뜁니다 → 몇 번 실행해도 안전)

-- 기본 인적사항/상태 (혹시 없을 수 있어 함께 보강)
alter table payroll add column if not exists emp_type       text    default '알바';
alter table payroll add column if not exists resident_id    text    default '';
alter table payroll add column if not exists phone          text    default '';
alter table payroll add column if not exists email          text    default '';
alter table payroll add column if not exists account_number text    default '';
alter table payroll add column if not exists default_time   text    default '';
alter table payroll add column if not exists status         text    default 'saved';

-- ★ 이번 문제의 핵심: 소득세 및 고정 설정 컬럼
alter table payroll add column if not exists hire_date      text    default '';
alter table payroll add column if not exists resign_date    text    default '';
alter table payroll add column if not exists birth_date     text    default '';
alter table payroll add column if not exists deduction_type text    default 'none';
alter table payroll add column if not exists income_tax       numeric default 0;   -- 소득세
alter table payroll add column if not exists retro_income_tax numeric default 0;   -- 소급 소득세(지난달 미징수분)
alter table payroll add column if not exists meal_allowance   numeric default 0;   -- 식대(비과세)
alter table payroll add column if not exists severance_pay    numeric default 0;   -- 퇴직금

-- 월급제 직원 (시급×209 대신 월급 직접입력)
alter table payroll add column if not exists salary_type    text    default 'hourly'; -- 'hourly'|'monthly'
alter table payroll add column if not exists monthly_salary numeric default 0;       -- 월급(주휴 포함 기본급)
