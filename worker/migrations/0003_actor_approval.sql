-- 작업자 승인제: 이름 입력 후 관리자 승인 전까지 쓰기 불가
ALTER TABLE actors ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;
-- 기존 작업자는 승인된 것으로 간주
UPDATE actors SET approved = 1;
