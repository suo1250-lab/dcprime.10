-- admin 테이블: role 컬럼 추가 + 튜터/부원장 계정 생성
-- 생성일: 2026-07-16

-- ① role 컬럼 추가 (기존 원장 계정은 '원장' 기본값)
ALTER TABLE admin ADD COLUMN IF NOT EXISTS role text DEFAULT '원장';

-- ② 기존 원장 계정 role 명시
UPDATE admin SET role = '원장' WHERE name = '신성호';

-- ③ 부원장 + 튜터 계정 INSERT
INSERT INTO admin (id, name, pin_hash, role) VALUES
  ('admin-pjw', '박주원', extensions.crypt('8962', extensions.gen_salt('bf')), '부원장'),
  ('admin-ksj', '김성준', extensions.crypt('8382', extensions.gen_salt('bf')), '튜터'),
  ('admin-lsb', '이송빈', extensions.crypt('3115', extensions.gen_salt('bf')), '튜터'),
  ('admin-kic', '김익찬', extensions.crypt('5301', extensions.gen_salt('bf')), '튜터'),
  ('admin-sjs', '서준서', extensions.crypt('9130', extensions.gen_salt('bf')), '튜터');
-- 김영재(admin-kyj) 이따 추가 예정
