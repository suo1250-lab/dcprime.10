-- attendance_overrides.status CHECK 제약에 'excused'(인정결석) 허용 추가
ALTER TABLE attendance_overrides DROP CONSTRAINT IF EXISTS attendance_overrides_status_check;
ALTER TABLE attendance_overrides ADD CONSTRAINT attendance_overrides_status_check
  CHECK (status IN ('present', 'partial', 'absent', 'excused'));
