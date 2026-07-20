-- 지각/결석 신청 삭제용 SQL 모음 (필요한 구문만 골라서 실행)

-- ① 특정 신청 건 1개만 삭제 (id로)
-- DELETE FROM leave_requests WHERE id = '여기에-uuid-입력';

-- ② 특정 학생의 특정 날짜 신청 삭제
-- DELETE FROM leave_requests WHERE student_id = (SELECT id FROM students WHERE name = '홍길동') AND date = '2026-07-20';

-- ③ 특정 학생의 전체 신청 내역 삭제
-- DELETE FROM leave_requests WHERE student_id = (SELECT id FROM students WHERE name = '홍길동');

-- ④ 특정 날짜(전체 학생) 신청 삭제
-- DELETE FROM leave_requests WHERE date = '2026-07-20';

-- ⑤ 오래된 신청 내역 일괄 정리 (예: 30일 이전)
-- DELETE FROM leave_requests WHERE date < (CURRENT_DATE - INTERVAL '30 days')::text;

-- ⑥ 테스트/전체 데이터 완전 초기화 (주의: 되돌릴 수 없음)
-- TRUNCATE leave_requests;

-- ─────────────────────────────────────────────
-- 참고: 결석 신청은 attendance_overrides에도 status='excused'로 동시 저장됩니다.
-- leave_requests만 지우면 출석표의 인정결석(Ⓧ) 표시는 그대로 남으니,
-- 출석 상태까지 같이 되돌리려면 아래도 함께 실행하세요.

-- 특정 학생 특정 날짜의 인정결석 상태도 함께 해제
-- DELETE FROM attendance_overrides WHERE student_id = (SELECT id FROM students WHERE name = '홍길동') AND date = '2026-07-20' AND status = 'excused';
