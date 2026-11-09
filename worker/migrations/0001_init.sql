-- 초기 스키마 (HANDOFF.md 6.1)

CREATE TABLE adventures (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE characters (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  adventure_id     INTEGER NOT NULL REFERENCES adventures(id),
  server           TEXT NOT NULL,           -- 서버 코드 (bakal 등)
  name             TEXT NOT NULL,
  -- 아래는 크롤러가 갱신
  df_character_id  TEXT,                    -- 공홈 characterId (Open API id와 다름)
  job              TEXT,
  level            INTEGER,
  fame             INTEGER,
  is_buffer        INTEGER,                 -- 0/1
  equip_point      INTEGER,
  buff_point       INTEGER,
  score            INTEGER,                 -- 딜러=장비점수, 버퍼=버프력
  score_type       TEXT,                    -- 'equip' | 'buff'
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending|ok|not_found|error
  last_crawled_at  TEXT,                    -- 마지막으로 조회에 성공한 시각 (ok/not_found)
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at       TEXT                     -- soft delete
);
CREATE UNIQUE INDEX ux_characters_server_name
  ON characters(server, name) WHERE deleted_at IS NULL;
CREATE INDEX ix_characters_adventure ON characters(adventure_id);

-- 체크박스형 표시 (업둥 등). 새 항목은 행 추가로 확장
CREATE TABLE tags (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  key                TEXT NOT NULL UNIQUE,
  label              TEXT NOT NULL,
  emoji              TEXT,
  admin_only         INTEGER NOT NULL DEFAULT 0,  -- 1이면 관리자만 체크 가능
  max_per_adventure  INTEGER NOT NULL DEFAULT 0,  -- 모험단당 최대 개수 기본값
  sort_order         INTEGER NOT NULL DEFAULT 0
);
-- 업둥 제한 초기값 0 (체크 불가), 관리자가 점차 늘림
INSERT INTO tags (key, label, emoji) VALUES ('updung', '업둥', '🌱');

-- 모험단별 태그 개수 제한 예외. 없으면 tags.max_per_adventure 사용
CREATE TABLE adventure_tag_limits (
  adventure_id  INTEGER NOT NULL REFERENCES adventures(id),
  tag_id        INTEGER NOT NULL REFERENCES tags(id),
  max_count     INTEGER NOT NULL,
  PRIMARY KEY (adventure_id, tag_id)
);

CREATE TABLE character_tags (
  character_id  INTEGER NOT NULL REFERENCES characters(id),
  tag_id        INTEGER NOT NULL REFERENCES tags(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (character_id, tag_id)
);
CREATE INDEX ix_character_tags_tag ON character_tags(tag_id);

-- 관리자 전용 (확장용). 공개 API에는 노출하지 않음
CREATE TABLE character_admin (
  character_id  INTEGER PRIMARY KEY REFERENCES characters(id),
  hidden        INTEGER NOT NULL DEFAULT 0,  -- 목록에서 숨김
  locked        INTEGER NOT NULL DEFAULT 0,  -- 일반 사용자 수정/삭제 금지
  note          TEXT,
  updated_at    TEXT
);

-- 점수 추이 (값이 바뀐 경우에만 insert)
CREATE TABLE score_history (
  character_id  INTEGER NOT NULL REFERENCES characters(id),
  fame          INTEGER,
  equip_point   INTEGER,
  buff_point    INTEGER,
  recorded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_score_history_char ON score_history(character_id, recorded_at);

-- 갱신 실행 기록. 실행 중 판단 + IP 쿨타임 + 실패 추적
CREATE TABLE crawl_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type  TEXT NOT NULL,              -- 'schedule' | 'manual'
  scope         TEXT NOT NULL,              -- 'all' | 'adventure'
  adventure_id  INTEGER REFERENCES adventures(id),
  requester_ip  TEXT,
  status        TEXT NOT NULL DEFAULT 'running',  -- running|success|failed
  total         INTEGER,
  ok            INTEGER,
  not_found     INTEGER,
  error         INTEGER,
  message       TEXT,                       -- 실패 사유
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT
);
CREATE INDEX ix_crawl_runs_ip ON crawl_runs(requester_ip, started_at);
CREATE INDEX ix_crawl_runs_status ON crawl_runs(status, started_at);

-- 작업자 (로그인 없음, 브라우저별 device_id)
CREATE TABLE actors (
  device_id   TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  last_ip     TEXT,
  blocked     INTEGER NOT NULL DEFAULT 0,   -- 1이면 쓰기 차단
  first_seen  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT
);

-- 관리자가 바꾸는 전역 설정 (key-value)
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO settings (key, value) VALUES ('refresh_cooldown_minutes', '30');

-- 등록/삭제/태그 변경 이력
CREATE TABLE audit_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_device_id  TEXT,
  actor_name       TEXT,                    -- 작업 당시 이름 스냅샷
  actor_ip         TEXT,
  is_admin         INTEGER NOT NULL DEFAULT 0,
  action           TEXT NOT NULL,           -- 'character.create' | 'character.delete' | 'tag.set' | 'tag.unset' ...
  target_type      TEXT,
  target_id        INTEGER,
  detail           TEXT,                    -- JSON
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_audit_log_target ON audit_log(target_type, target_id);
