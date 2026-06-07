-- ============================================================
--  재고 관리 테이블 (Supabase SQL Editor 에서 1회 실행)
--  - inventory_items : 지점별 품목 + 현재고 + 최소재고
--  - inventory_logs  : 입고/사용/조정 변동 이력
-- ============================================================

-- 1) 품목 테이블
create table if not exists inventory_items (
  id          bigint generated always as identity primary key,
  branch      text not null,                 -- 지점명 (지점마다 따로 관리)
  name        text not null,                 -- 품목명 (예: 원두, 우유, 12oz컵)
  unit        text default '개',             -- 단위 (개/박스/kg/L 등)
  category    text default '',               -- 분류 (선택)
  current_qty numeric default 0,             -- 현재고
  min_qty     numeric default 0,             -- 최소재고(적정 수량). 이 아래면 '부족'
  memo        text default '',               -- 비고 (거래처 등)
  sort_order  int default 0,                 -- 정렬 순서
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_inv_items_branch on inventory_items(branch);

-- 2) 입출고 이력 테이블
create table if not exists inventory_logs (
  id         bigint generated always as identity primary key,
  branch     text not null,
  item_id    bigint references inventory_items(id) on delete cascade,
  item_name  text default '',               -- 삭제 후에도 남도록 이름 사본 저장
  type       text not null,                 -- '입고' | '사용' | '조정'
  qty        numeric default 0,             -- 변동량 (+입고 / -사용)
  result_qty numeric default 0,             -- 변동 후 현재고
  memo       text default '',
  actor      text default '',               -- 기록한 지점/사람
  created_at timestamptz default now()
);
create index if not exists idx_inv_logs_branch on inventory_logs(branch, created_at desc);

-- 3) RLS (다른 테이블과 동일하게 전체 허용)
alter table inventory_items enable row level security;
alter table inventory_logs  enable row level security;

drop policy if exists "allow all inv_items" on inventory_items;
drop policy if exists "allow all inv_logs"  on inventory_logs;
create policy "allow all inv_items" on inventory_items for all using (true) with check (true);
create policy "allow all inv_logs"  on inventory_logs  for all using (true) with check (true);
