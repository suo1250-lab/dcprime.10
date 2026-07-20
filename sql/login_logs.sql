-- 관리자(원장/부원장/튜터) 로그인 기록 테이블
-- 학생 로그인은 기록하지 않음 (요청 범위: 원장/부원장/튜터만)

CREATE TABLE IF NOT EXISTS login_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sid        text NOT NULL,
  sname      text,
  role       text,
  ip         text,
  ua         text,
  created_at timestamptz DEFAULT now()
);

-- RLS 활성화 + 어떤 클라이언트 키로도 직접 접근 불가하게 잠금
-- (Worker가 service_role 키로만 우회 접근)
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;
-- 정책을 아예 만들지 않으면 anon/authenticated는 전부 거부됨 (service_role은 RLS 자체를 우회)
