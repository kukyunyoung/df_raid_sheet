-- 공대표 (예: 미카엘라 노말). 생성/기수 추가는 관리자만
CREATE TABLE raids (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  rounds      INTEGER NOT NULL DEFAULT 1,   -- 기수 수
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 공대표 칸. 행이 없으면 빈 자리. 칸 편집은 누구나
CREATE TABLE raid_slots (
  raid_id       INTEGER NOT NULL REFERENCES raids(id),
  round         INTEGER NOT NULL,           -- 1기, 2기, ...
  party         TEXT NOT NULL,              -- 'red' | 'yellow' | 'green'
  slot          INTEGER NOT NULL,           -- 0~2 딜러, 3 버퍼
  character_id  INTEGER NOT NULL REFERENCES characters(id),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (raid_id, round, party, slot)
);
CREATE INDEX ix_raid_slots_character ON raid_slots(character_id);
