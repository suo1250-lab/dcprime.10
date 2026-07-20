-- login_logs에 접속 위치(도시/지역/국가) 컬럼 추가
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS loc text;
