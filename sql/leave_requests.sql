-- 지각/결석 신청 기록
CREATE TABLE IF NOT EXISTS leave_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   text NOT NULL,
  date         text NOT NULL,
  type         text NOT NULL,        -- '결석' | '지각'
  reason       text,
  arrival_time text,                 -- 지각일 때만 사용
  created_at   timestamptz DEFAULT now()
);
