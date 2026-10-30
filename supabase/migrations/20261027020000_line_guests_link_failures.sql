-- 予約紐付けの総当たり対策: 失敗が一定回数を超えた LINE ユーザーは一定時間受け付けない
alter table public.line_guests
  add column link_failure_count             integer not null default 0,
  add column link_failure_window_started_at timestamptz;
