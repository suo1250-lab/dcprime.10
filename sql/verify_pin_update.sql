-- verify_pin RPC 업데이트: admin 테이블 role 컬럼 실제 값 반환
-- (기존: 'admin' 하드코딩 → 변경: a.role 반환)
-- Supabase SQL Editor에서 실행

CREATE OR REPLACE FUNCTION verify_pin(p_pin text)
RETURNS TABLE(sid text, sname text, role text, grade text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    SELECT a.id::text, a.name, a.role, NULL::text
    FROM admin a
    WHERE extensions.crypt(p_pin, a.pin_hash) = a.pin_hash
  UNION ALL
    SELECT s.id::text, s.name, 'student'::text, s.grade
    FROM students s
    WHERE extensions.crypt(p_pin, s.pin_hash) = s.pin_hash;
END;
$$;
