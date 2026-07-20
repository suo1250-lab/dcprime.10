-- leave_requests: RLS 때문에 학생(anon key) insert가 막혀있던 문제 수정
-- 다른 학생 테이블(goals, timetables, study_logs)과 동일하게 RLS 비활성화
ALTER TABLE leave_requests DISABLE ROW LEVEL SECURITY;
