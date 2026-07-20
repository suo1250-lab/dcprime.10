-- 인정결석 사유를 출석표에서 바로 볼 수 있도록 컬럼 추가
ALTER TABLE attendance_overrides ADD COLUMN IF NOT EXISTS reason text;
