-- 학생 삭제 시 연관된 모든 기록을 함께 삭제하도록 delete_student RPC 갱신
-- (시간표, 학습인증, 목표, 출석보정, 상담기록, 리포트, 지각/결석신청 포함)
CREATE OR REPLACE FUNCTION delete_student(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM attendance_overrides WHERE student_id::text = p_id::text;
  DELETE FROM consults           WHERE student_id::text = p_id::text;
  DELETE FROM goals              WHERE student_id::text = p_id::text;
  DELETE FROM leave_requests     WHERE student_id::text = p_id::text;
  DELETE FROM reports            WHERE student_id::text = p_id::text;
  DELETE FROM study_logs         WHERE student_id::text = p_id::text;
  DELETE FROM timetables         WHERE student_id::text = p_id::text;
  DELETE FROM students           WHERE id = p_id;
END;
$$;
