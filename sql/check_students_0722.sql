-- 2026-07-22 명단 45명 계정 존재 여부 확인

WITH target_names(name) AS (
  VALUES
    ('강지민'), ('강찬민'), ('기태간'), ('김가은'), ('김민결'), ('김민서'), ('김채이'),
    ('김태연'), ('김한결'), ('남유주'), ('남정우'), ('류동훈'), ('문해솔'), ('박지수'),
    ('박하영'), ('서주원'), ('서형준'), ('안시현'), ('염유찬'), ('이동명'), ('이서현'),
    ('이소민'), ('이정진'), ('이채은'), ('이형준'), ('장현태'), ('정서준'), ('정예은'),
    ('정지우'), ('지하영'), ('한지석'), ('김민솔'), ('김민찬'), ('김재민'), ('박솔윤'),
    ('서유림'), ('서은설'), ('성윤서'), ('유민건'), ('이창목'), ('임고은'), ('정서진'),
    ('정원재'), ('최보은'), ('김태욱')
)
SELECT
  t.name,
  s.id IS NOT NULL AS 계정존재,
  s.grade,
  s.campus
FROM target_names t
LEFT JOIN students s ON s.name = t.name
ORDER BY 계정존재, t.name;

-- 계정 없는 학생만 따로 보기
-- SELECT t.name FROM target_names t
-- LEFT JOIN students s ON s.name = t.name
-- WHERE s.id IS NULL;
