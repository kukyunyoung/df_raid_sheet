-- IP는 더 이상 수집하지 않음. 기존 값도 컬럼째 삭제
DROP INDEX IF EXISTS ix_crawl_runs_ip;
ALTER TABLE crawl_runs DROP COLUMN requester_ip;
ALTER TABLE actors DROP COLUMN last_ip;
ALTER TABLE audit_log DROP COLUMN actor_ip;
