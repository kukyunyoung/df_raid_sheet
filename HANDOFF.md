# 던파 장비점수/버프력 대시보드 — 인수인계 문서 (Claude Code용)

> 작성일: 2026-11-09
> 함께 전달되는 파일: `dfscore.py`, `run_update.py`, `Dockerfile` (이 문서에는 파일 내용을 다시 싣지 않고, 역할·설계 의도·검증 결과만 기록함)

---

## 1. 프로젝트 개요

### 1.1 목적
- 지인 약 20명이 보는 **던전앤파이터 모험단/캐릭터 스펙 조회 사이트** 제작
- 기존 개인 프로젝트 `dundam_updater`(구글 시트 + GitHub Actions)를 **React 웹사이트로 옮겨 보기 편하게** 만드는 것이 목표
- 기존에는 던담(dundam)의 "딜표"를 썼으나, 이번에는 **던파 공식 홈페이지의 장비점수/버프력**을 사용

### 1.2 점수 기준
| 구분 | 사용하는 값 |
|---|---|
| 딜러 | 공홈 **장비점수** (`equipmentPoint`) |
| 버퍼 | 공홈 **버프력** (`buffPoint`) |

- 버퍼 직업: 크루세이더(남), 크루세이더(여), 인챈트리스, 뮤즈, 패러메딕
- **버퍼 판별은 직업명 매칭이 필요 없음.** 공홈 응답에 `bufferCharacter: true/false` 필드가 있으므로 그 값을 그대로 사용

### 1.3 규모·요구사항
- 사용자: 약 20명, 하루 방문 1만 건 미만
- 등록 캐릭터: **약 500캐릭**
- 로그인: **기본적으로 없음**
- 향후 **Claude API 키를 서버에 넣어 사이트 내 에이전트 기능** 추가 예정 → 이 기능 때문에 최소한의 접근 제어는 필요할 수 있음 (아래 6장 참고)
- 도메인: 없음. Cloudflare 무료 서브도메인(`*.pages.dev`, `*.workers.dev`) 사용
- 백엔드 언어: 제한 없음 (Claude에게 위임)
- DB: 간단하게, 단 확장 가능성은 고려

### 1.4 인프라 계정 (지인이 준비해 둔 것)
- 프론트: Cloudflare (`https://dash.cloudflare.com/`)
- 백엔드: Google Cloud (`https://console.cloud.google.com/`)

---

## 2. 기존 프로젝트(dundam_updater) 배경

- GitHub 레포: `kukyunyoung/dundam_updater` (private)
- 구성: GitHub Actions(`.github/workflows/main.yml`) → `dundam.py` 실행 (Python 3.11, Playwright Chromium, Google Sheets API)
- 서비스 계정 키는 GitHub Secret `GCP_SA_KEY` → 실행 시 `credentials.json`으로 생성
- 스케줄(KST): 02:00, 08:00, 11:30, 17:00, 19:00, 23:00
- **문제점**: GitHub Actions의 schedule 트리거는 최대 1시간가량 지연됨. 수동 `Run workflow`(workflow_dispatch)는 즉시 실행됨
- 당시 해결책: Google Apps Script 웹앱(`doGet`)에서 GitHub `workflow_dispatch` API 호출 → 그 웹앱 URL을 구글 시트에 하이퍼링크로 걸어 클릭 시 즉시 실행. GitHub 토큰은 Script Properties에 저장
- 별도로 구글 시트 기반 레이드 배정 스크립트(`raid_assign.py`)도 있었음: 딜표 시트를 읽어 컷 필터링 후 20기수 × (레드/옐로/그린) 파티 × (딜러3 + 버퍼1) 슬롯에 배정, 각 슬롯은 [모험단, 캐릭터명, 딜/버프력] 3행 구조

→ 새 사이트에서는 **Cloud Scheduler로 지연 문제 해결**, **사이트 버튼으로 수동 갱신** 대체.

---

## 3. 장비점수/버프력 수집 방법 (핵심)

### 3.1 배경
- **네오플 Open API에는 장비점수/버프력이 없음.** (캐릭터 기본정보, 장비, 능력치, 명성 등만 제공)
- 장비 배율로 직접 계산하는 방식은 배율의 소수점 정보가 공개되지 않아 오차가 큼
- 참고 글: https://arca.live/b/dunfa/176707564 (공홈 캐릭터 검색이 장비점수를 노출한다는 내용)
- 결론: **던파 공홈 캐릭터 검색 내부 요청을 이용**하는 크롤링 방식 채택

### 3.2 엔드포인트
```
GET https://df.nexon.com/world/character/fetch?serverName={서버코드}&characName={URL인코딩된 닉네임}
```
- 공홈 페이지(`https://df.nexon.com/world/character`)가 열린 **브라우저 컨텍스트 안에서** 호출해야 정상 응답 (외부에서 직접 호출 시 거부/CORS)
- 그래서 Playwright로 공홈 페이지를 한 번 연 뒤 `page.evaluate()` 안에서 `fetch()`를 여러 번 호출하는 구조
- `credentials: 'include'` 사용. 로그인은 필요 없음

### 3.3 서버 코드
| 한글 | 코드 |
|---|---|
| 카인 | cain |
| 디레지에 | diregie |
| 시로코 | siroco |
| 프레이 | prey |
| 카시야스 | casillas |
| 힐더 | hilder |
| 안톤 | anton |
| 바칼 | bakal |

`serverName=all`로 전체 서버 검색도 가능.

### 3.4 실제 응답 구조 (2026-11-09 확인)
```json
{
  "message": "",
  "body": [
    {
      "characterId": "694303daf052e9065c9c843bcce7236c",
      "level": 115,
      "characterName": "븜바",
      "jobGrowName": "眞 마도학자",
      "serverNo": 11,
      "serverName": "bakal",
      "serverNameKor": "바칼",
      "fame": "126844",
      "bufferCharacter": false,
      "equipmentPoint": "WQ9GQm1iNjYEHFZSKw4HQwtzHUZYS3oPLhAaYF40MD8ZPQFiWhhGQG8V",
      "buffPoint": "WQ9GQm1iNjYEHFZSKw4HQwtzGQYVUXccAwFvbThCYxNDUhF4Aw==",
      "obfuscateKey": { "key": "KXZse04/", "salt": "cHkqOSNd" },
      "lounge6BG": false
    }
  ]
}
```
주의:
- 최상위 키는 `body` (아카라이브 글의 `data.characters` 구조와 다름)
- `fame`은 **문자열**
- **유사 닉네임이 함께 검색됨** (예: "븜바" 검색 → 븜바, 븜바람, 븜바퀴 …). 반드시 `characterName == 입력 닉네임` AND `serverName == 서버코드`로 정확히 일치하는 행만 사용
- 공홈의 `characterId`는 **네오플 Open API의 characterId와 다르다는 제보**가 있음. 두 데이터를 합칠 땐 서버+닉네임으로 매칭할 것

### 3.5 복호화 로직
`equipmentPoint`, `buffPoint`는 난독화되어 있음. 공홈 JS 번들 `nameIndex.js` 내 함수(`pt`)를 분석해서 옮김.

알고리즘:
1. 고정 상수 4개 (nameIndex.js에 하드코딩, 각 6바이트 배열):
   - `ut = [94,105,48,89,125,105]`
   - `lt = [88,96,45,120,42,89]`
   - `ft = [104,95,52,69,43,59]`
   - `Bt = [115,110,42,59,33,42]`
2. XOR 키 문자열 `r = String.fromCharCode(base64decode(obfuscateKey.key) + ut + lt)`
3. 패딩 문자열 `n = String.fromCharCode(base64decode(obfuscateKey.salt) + ft + Bt)`
4. `o = base64decode(value)`
5. `k = TextEncoder(UTF-8).encode(r)` → `o[i] ^ k[i % k.length]`
6. 결과를 UTF-8 디코딩 → 앞뒤에서 `n.length`만큼 잘라낸 나머지가 숫자 문자열

공홈 JS 원본 흐름:
```
if (n.obfuscateKey) {
  key = n.obfuscateKey.key, salt = n.obfuscateKey.salt;
  n.bufferCharacter ? n.buffPoint = F(pt(n.buffPoint, key, salt))
                    : n.equipmentPoint = F(pt(n.equipmentPoint, key, salt));
}
```
(공홈은 버퍼면 버프력만, 딜러면 장비점수만 화면에 표시하지만 실제로는 두 값 모두 복호화 가능)

### 3.6 검증 결과
| 캐릭터 | 직업 | 명성 | 장비점수 | 버프력 | bufferCharacter |
|---|---|---|---|---|---|
| 바칼 븜바 (구구녕 모험단) | 眞 마도학자 | 126,844 | 404,040 | 0 | false |
| 바칼 구구녕 (구구녕 모험단) | 眞 크루세이더 | 119,610 | 215,545 | 122,893 | true |
| 바칼 범바다 (검증용) | 眞 브레이커 | 113,626 | 78,061 | 0 | false |

- 범바다의 복호화 값 78,061이 **공홈 화면 표시값과 일치**함을 확인
- Python 구현(`dfscore.decode_point`)도 위 원본 데이터로 동일 값 재현 확인 (404040 / 0)
- 비고: 딜러는 버프력이 0, 버퍼는 장비점수도 값이 있음

### 3.7 리스크
- **비공식 경로**: 넥슨이 언제든 막거나 구조를 바꿀 수 있음
- **복호화 상수 변경 가능성**: 공홈 JS가 바뀌면 상수/알고리즘이 바뀔 수 있음. 현재 코드는 복호화 결과가 숫자가 아니면 `DecodeError`로 감지 → 실행 실패(exit 2)로 알림
  - 개선안: 실행 시점에 공홈 `nameIndex.js`를 받아 상수를 정규식으로 추출하거나, 페이지 내 함수를 직접 호출하는 방식으로 자동 대응
- **차단 위험**: 과도한 요청 금지. 동시성·지연 유지
- 회사 네트워크(오피스키퍼)에서는 공홈 접속이 간헐적으로 차단된 적 있음. 테스트는 다른 네트워크에서 권장

---

## 4. 확정 아키텍처

```
[Cloud Scheduler] ──(2시간 주기)──▶ [Cloud Run Job: Playwright 크롤러]
                                        │ GET  /api/crawler/targets
                                        │ POST /api/crawler/results
                                        ▼
[사용자] ─▶ [Cloudflare Pages: React] ─▶ [Cloudflare Workers: API] ─▶ [Cloudflare D1]
                     │ 수동 갱신 버튼                │
                     └──────────────▶ Worker ──▶ Cloud Run Job 실행 트리거
```

| 역할 | 서비스 | 비고 |
|---|---|---|
| 프론트 | Cloudflare Pages, React(Vite) | 정적 자산은 무료·무제한 |
| API | Cloudflare Workers | 무료 하루 10만 요청. 초과 시 과금 없이 에러만 발생 → 별도 상한 불필요 |
| DB | Cloudflare D1 (SQLite) | 무료 |
| 크롤러 | GCP Cloud Run **Jobs** | Workers에서는 Playwright 실행 불가하므로 분리 |
| 스케줄 | GCP Cloud Scheduler | 시간대 Asia/Seoul. GitHub Actions 지연 문제 해결 |
| 비밀값 | Workers Secrets / GCP Secret Manager | `CRAWLER_TOKEN`, Claude API 키 등 |

### 4.1 갱신 주기 결정
- 500캐릭 1회 갱신: 동시 2개, 요청 간 0.4~0.9초 → **약 4~6분**
- **확정 (2026-11-09): 정기 갱신 6시간 주기**
  - cron: `0 2,8,14,20 * * *` (Asia/Seoul)
- **수동 갱신: 2가지 옵션**
  - **전체 갱신**: 등록된 모든 캐릭터
  - **모험단 갱신**: 선택한 모험단(`characters.adventure`)의 캐릭터만
- **IP당 30분 쿨타임** (두 옵션 공용 — 같은 IP는 둘 중 하나를 30분에 1회만 요청 가능)
  - Worker에서 `CF-Connecting-IP` 헤더로 IP 식별, 마지막 요청 시각을 D1에 기록
  - 이미 Job이 실행 중이면 새로 실행하지 않음 (여러 IP의 중복 실행 방지). 이 경우 쿨타임도 소모하지 않음

---

## 5. 전달 파일 설명

### 5.1 `dfscore.py` — 수집 모듈
- `Target(server, name)`: 한글 서버명 또는 코드 모두 허용
- `CharScore`: 결과 dataclass — `server, name, found, character_id, job, level, fame, is_buffer, equip_point, buff_point, score, score_type('equip'|'buff'), error`
  - `score` = 버퍼면 버프력, 딜러면 장비점수
- `decode_point(value, key, salt)`: 3.5의 복호화
- `crawl(targets, concurrency=2, min_delay_ms=400, max_delay_ms=900, chunk_size=50, retries=2)`
  - 공홈 페이지 1회 로드 → 50개 단위 청크로 `page.evaluate` 안에서 fetch
  - 실패 항목만 최대 2회 재시도 (5초 대기 + 페이지 reload)
  - `found=False, error=None` = 검색 결과 없음(닉변/삭제 등), `error` 있음 = 요청 실패

### 5.2 `run_update.py` — 정기 실행 엔트리포인트
- 환경변수: `WORKER_URL`, `CRAWLER_TOKEN`, (선택) `TARGETS_FILE`
- 흐름: Worker `GET /api/crawler/targets` → `crawl()` → Worker `POST /api/crawler/results`
- `TARGETS_FILE` 지정 시 로컬 JSON(`[{"server":"바칼","name":"븜바"}]`)으로 목록을 읽고 결과는 stdout 출력 (로컬 테스트용)
- 종료 코드: 0 정상 / 1 오류 과반 (차단 의심) / 2 복호화 실패 (공홈 로직 변경 의심)

### 5.3 `Dockerfile`
- 베이스 `mcr.microsoft.com/playwright/python:v1.48.0-jammy`, Playwright 1.48.0 고정
- Cloud Run Job 이미지용

### 5.4 로컬 테스트
```powershell
# Python 3.12 가상환경 (3.14는 playwright 1.48의 greenlet 빌드 실패)
uv venv --python 3.12 .venv
uv pip install --python .venv\Scripts\python.exe playwright==1.48.0
.venv\Scripts\python.exe -m playwright install chromium

# 공홈만 테스트 (stdout 출력)
$env:TARGETS_FILE="t.json"; .venv\Scripts\python.exe run_update.py
# Worker 연동 테스트 (worker에서 npm run dev 실행 중일 때)
$env:WORKER_URL="http://127.0.0.1:8787"; $env:CRAWLER_TOKEN="local-crawler-token"; $env:ADVENTURE="구구녕"
.venv\Scripts\python.exe run_update.py
```
- 2026-11-10 확인: 공홈 값 3.6과 일치, Worker 경유 D1 저장·crawl_runs 기록 정상
기대값: 3.6 표와 일치 (단, 실제 게임 내 장비 변경 시 달라질 수 있음)

---

## 6. 남은 작업 (TODO)

### 6.1 D1 스키마 (2026-11-09 논의 반영)

요구사항:
- 구분 단위는 **모험단** (사람/소유자 테이블 없음)
- 캐릭터 블록 표시: **모험단 / 닉네임 + 태그 이모지 / 점수(장비점수 또는 버프력)**
- 블록 클릭 → **"업둥" 체크** → 닉네임 오른쪽에 🌱 표시
- 캐릭터 등록·삭제·업둥 체크는 **누구나 가능**, 모든 작업은 로그로 남김
- **로그인 없이 작업자 식별**: 첫 방문 시 이름 입력 → 브라우저 localStorage에 `device_id`(UUID) + 이름 저장 → 쓰기 요청마다 헤더(`X-Device-Id`, `X-Actor-Name`)로 전송 → IP와 함께 로그 기록 (자기신고 방식이라 위조 가능하나 지인 규모에선 충분, 악용 시 device 차단)
  - **이름 고정 + 관리자 승인제** (2026-11-09, `migrations/0003_actor_approval.sql`): 이름은 처음 등록값으로 고정(서버가 헤더 이름 무시). 신규 기기는 `actors.approved=0` → 쓰기 403 "승인 대기". 관리자가 하단 "관리자" → 작업자 관리에서 승인/거절(차단). 관리자 비밀번호로 요청한 기기는 자동 승인. 캐시 삭제 시 새 기기로 취급되어 다시 승인 필요
  - API: `GET /api/actors/me`, `POST /api/actors/register {name}`, (관리자) `GET /api/actors`, `POST /api/actors/:deviceId/approve`, `POST /api/actors/:deviceId/block {blocked}`
- **업둥은 모험단당 개수 제한**, 제한값은 관리자가 결정 (기본값 + 모험단별 예외)
- **관리자 전용 데이터는 별도 테이블로 분리** (지금은 미사용, 확장용)

설계 원칙:
- 내부 `id`로 식별 → 닉변 시에도 태그·이력 유지
- 체크박스류는 컬럼이 아니라 **태그 테이블**로 → 새 체크 항목은 코드 수정 없이 행 추가로 확장
- 관리자 데이터는 1:1 테이블로 분리 → 공개 API는 조인하지 않음
- 삭제는 soft delete(`deleted_at`) + 감사 로그 → 누구나 수정 가능한 구조에서 복구 수단 확보
- 스키마 변경은 `wrangler d1 migrations`로 버전 관리

```sql
CREATE TABLE adventures (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE characters (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  adventure_id     INTEGER NOT NULL REFERENCES adventures(id),
  server           TEXT NOT NULL,           -- 서버 코드 (bakal 등)
  name             TEXT NOT NULL,           -- 닉네임
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
  last_crawled_at  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at       TEXT                     -- soft delete
);
CREATE UNIQUE INDEX ux_characters_server_name
  ON characters(server, name) WHERE deleted_at IS NULL;
CREATE INDEX ix_characters_adventure ON characters(adventure_id);

-- 체크박스형 표시 (업둥 등). 새 항목은 행 추가로 확장
CREATE TABLE tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,         -- 'updung'
  label       TEXT NOT NULL,                -- '업둥'
  emoji       TEXT,                         -- '🌱' (닉네임 오른쪽 표시)
  admin_only  INTEGER NOT NULL DEFAULT 0,   -- 1이면 관리자만 체크 가능
  max_per_adventure INTEGER NOT NULL DEFAULT 0,  -- 모험단당 최대 개수 기본값 (관리자 설정, 비우면 0)
  sort_order  INTEGER NOT NULL DEFAULT 0
);
-- 업둥 제한 초기값 0 (체크 불가), 관리자가 점차 늘림
INSERT INTO tags (key, label, emoji) VALUES ('updung', '업둥', '🌱');

-- 모험단별 태그 개수 제한 예외 (관리자 설정). 없으면 tags.max_per_adventure 사용
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

-- 관리자 전용 (현재 미사용, 확장용). 공개 API에서는 조회하지 않음
CREATE TABLE character_admin (
  character_id  INTEGER PRIMARY KEY REFERENCES characters(id),
  hidden        INTEGER NOT NULL DEFAULT 0, -- 목록에서 숨김
  locked        INTEGER NOT NULL DEFAULT 0, -- 일반 사용자 수정/삭제 금지
  note          TEXT,                       -- 관리자 메모
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

-- 갱신 실행 기록. 실행 중 판단 + IP 30분 쿨타임 + 실패 추적
CREATE TABLE crawl_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type  TEXT NOT NULL,              -- 'schedule' | 'manual' (trigger는 SQL 예약어라 회피)
  scope         TEXT NOT NULL,              -- 'all' | 'adventure'
  adventure_id  INTEGER REFERENCES adventures(id),
  requester_ip  TEXT,
  status        TEXT NOT NULL DEFAULT 'running',  -- running|success|failed
  total INTEGER, ok INTEGER, not_found INTEGER, error INTEGER,
  message       TEXT,                       -- 실패 사유
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT
);
CREATE INDEX ix_crawl_runs_ip ON crawl_runs(requester_ip, started_at);

-- 작업자 (로그인 없음, 브라우저별 device_id). 관리자가 차단 가능
CREATE TABLE actors (
  device_id   TEXT PRIMARY KEY,             -- 브라우저 localStorage UUID
  name        TEXT NOT NULL,                -- 사용자가 입력한 이름 (변경 가능)
  last_ip     TEXT,
  blocked     INTEGER NOT NULL DEFAULT 0,   -- 1이면 쓰기 차단
  first_seen  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT
);

-- 관리자가 바꾸는 전역 설정 (key-value). 새 설정은 행 추가로 확장
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO settings (key, value) VALUES ('refresh_cooldown_minutes', '30');

-- 등록/삭제/태그 변경 이력 (누구나 수정 가능하므로 추적·복구용)
CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_device_id TEXT,
  actor_name   TEXT,                        -- 작업 당시 이름 스냅샷
  actor_ip     TEXT,
  is_admin     INTEGER NOT NULL DEFAULT 0,
  action       TEXT NOT NULL,               -- 'character.create' | 'character.delete' | 'tag.set' | 'tag.unset' ...
  target_type  TEXT,
  target_id    INTEGER,
  detail       TEXT,                        -- JSON
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```
- 모험단명은 공홈 응답에 없음 → 등록 시 입력. 필요 시 네오플 Open API(`adventureName`)로 검증
- 관리자 인증: 초기엔 Worker Secret `ADMIN_PASSWORD`, 필요해지면 `admins` 테이블 추가
- 공대표 (`migrations/0002_raids.sql`, 2026-11-09 추가)
  - `raids(id, name UNIQUE, rounds)`: 공대표(예: 미카엘라 노말)와 기수 수. **생성·기수 추가는 관리자만**
  - `raid_slots(raid_id, round, party, slot, character_id)`: party = red|yellow|green, slot 0~2 딜러 / 3 버퍼. 행 없음 = 빈 자리. **칸 편집은 누구나** (audit_log 기록)
  - 캐릭터 삭제 시 해당 칸도 비움
  - 중복체크(한 기수에 같은 모험단 2명 이상 금지)와 파티 화력((딜러 합/10만)×(버프력/10만))은 프론트에서 계산
- **IP 수집 중단** (`migrations/0004_drop_ip.sql`, 2026-11-10): `crawl_runs.requester_ip`, `actors.last_ip`, `audit_log.actor_ip` 컬럼과 기존 값 삭제. 위 스키마의 IP 컬럼은 더 이상 없음

### 6.2 Worker API (제안)
| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/characters` | 없음 | 목록 (정렬/필터: 모험단, 직업, score_type) |
| POST | `/api/characters` | 작업자 헤더 필수 | 캐릭터 등록 (server, name, adventure) |
| DELETE | `/api/characters/:id` | 작업자 헤더 필수 | soft delete |
| PUT/DELETE | `/api/characters/:id/tags/:key` | 작업자 헤더 필수 (`admin_only` 태그는 관리자) | 업둥 등 태그 체크/해제. 모험단당 제한 초과 시 409 |
| GET | `/api/logs` | 없음 | 작업 로그 조회 (누가 언제 무엇을) |

- 쓰기 요청 공통: `X-Device-Id`, `X-Actor-Name` 헤더 필수, 모두 `audit_log` 기록
- 차단: 프론트는 모든 요청에 `X-Device-Id`를 보내고, `actors.blocked=1`인 기기는 **조회까지** 403 `{blocked:true}` → 차단 화면 (크롤러 경로 제외, 관리자 비밀번호 요청 예외). 브라우저 데이터를 지우면 새 기기로 취급되지만 다시 승인을 받아야 쓰기 가능
- 작업자 관리(관리자): `GET /api/actors`, `POST /:deviceId/approve`, `POST /:deviceId/block {blocked}`, `PUT /:deviceId {name}` 이름 변경, `DELETE /:deviceId` 삭제(그 기기는 이름 입력·승인부터 다시)
- `GET /api/version`: 변경 감지 값. 프론트가 10초(갱신 중 4초)마다 호출해 바뀌면 다시 불러옴 (탭이 안 보이면 중단)
- 업둥 제한 검사는 `INSERT ... SELECT ... WHERE (현재 개수) < 제한` 한 문장으로 처리해 동시 요청에도 초과 방지
| POST | `/api/refresh` | **관리자** (2026-11-10 변경: IP 쿨타임 대신 관리자 전용) | 수동 갱신 → Cloud Run Job 실행. body: `{"scope":"all"}` 또는 `{"scope":"adventure","adventure":"구구녕"}`. 진행 중(시작 30분 이내 running)이면 409. `/api/meta`의 `running`으로 진행 여부 표시 |
| GET | `/api/meta` | 없음 | 서버 목록, 태그 정의·제한, 마지막 성공 갱신 시각 |
| POST | `/api/crawler/start` | `Bearer CRAWLER_TOKEN` | body `{run_id?}` 또는 `{adventure?}` → `{run_id, targets:[{server,name}]}`. run_id 없으면 정기 실행으로 crawl_runs 생성 |
| POST | `/api/crawler/results` | `Bearer CRAWLER_TOKEN` | `{run_id, results: CharScore[]}` 반영(json_each로 쿼리 4개), 실패 시 `{run_id, error}` |
| GET | `/api/raids` | 없음 | 공대표 목록 |
| POST | `/api/raids` | 관리자(`X-Admin-Password`) | 공대표 생성 `{name}` |
| POST | `/api/raids/:id/rounds` | 관리자 | 기수 1개 추가 |
| GET | `/api/raids/:id/slots` | 없음 | 칸 목록 `[{round,party,slot,character_id}]` |
| PUT | `/api/raids/:id/slots` | 작업자 헤더 | 칸 채우기/바꾸기 `{round,party,slot,character_id}` |
| DELETE | `/api/raids/:id/slots?round&party&slot` | 작업자 헤더 | 칸 비우기 |
| POST | `/api/agent` | 공용 비밀번호 + 일일 한도 | Claude 에이전트 (추후) |

- CORS: Pages 도메인만 허용
- 수동 갱신: IP당 30분 쿨타임, Job 실행 중이면 중복 실행 안 함 (4.1 참고)
- Worker → Cloud Run Job 실행: GCP 서비스 계정으로 Cloud Run Admin API `jobs:run` 호출. `/api/refresh`가 crawl_runs 행(trigger_type='manual')을 먼저 만들고 override env `RUN_ID`로 전달 → `run_update.py`가 `/api/crawler/start {run_id}`로 대상 조회
- 실행 중 판단: `crawl_runs.status='running'`이고 시작 30분 이내 (크롤러가 죽어 running으로 남은 행은 무시)

### 6.3 프론트 (React + Vite)
- 모험단별 / 직업별 / 딜러·버퍼 분리 테이블, 점수 정렬
- 마지막 갱신 시각 표시, 수동 갱신 버튼 2개 (전체 갱신 / 모험단 갱신), 쿨타임 남은 시간 표시
- `not_found`/`error` 캐릭 표시 (닉변 감지용)
- 모바일 대응
- 환경변수: `VITE_API_URL`

### 6.4 GCP 설정
- Artifact Registry 저장소 생성 → 이미지 push
- Cloud Run Job 생성 (메모리 2GiB 권장, 리전 asia-northeast3 등), env: `WORKER_URL`, `CRAWLER_TOKEN`(Secret Manager)
- Cloud Scheduler: 4.1 cron, 시간대 Asia/Seoul, 대상 = Job 실행
- **예산 알림(Budget alert) 반드시 설정**

### 6.5 Claude 에이전트 (추후)
- Claude API 키는 **Worker Secret에만** 저장, 프론트 노출 금지
- 정식 로그인 대신 **공용 비밀번호 1개 + 하루 사용 횟수 제한(D1 또는 KV)**으로 시작
- Anthropic 콘솔에서 **월 사용 한도(spend limit)** 설정
- 용도 예: "레이드 파티 짜줘", "우리 모험단 버퍼 순위" 등 D1 데이터를 도구로 조회

### 6.6 개선 과제
- 복호화 상수 자동 추출 (3.7)
- 크롤러 실패 시 알림 (exit code 1/2 → Cloud Monitoring 알림 또는 Discord 웹훅)
- 기존 구글 시트의 캐릭터 목록을 D1로 일괄 이관하는 스크립트

---

## 6.7 마일스톤 (2026-11-09 확정)
| 단계 | 내용 | 완료 기준 |
|---|---|---|
| M0 준비 (크롤러 ✅, 로그인 남음) | Node/wrangler, gcloud 설치·로그인, 로컬 크롤러 테스트 | 3.6 값 재현 — 2026-11-10 완료 |
| M1 Worker + D1 ✅ | 스키마, 캐릭터 CRUD, 크롤러 API(`CRAWLER_TOKEN`) — `worker/` | 로컬 스모크 테스트 통과 (실제 크롤러 연동 테스트는 M0 후) |
| M2 프론트 (Worker·D1 배포 완료, Pages 남음) | 목록/정렬/등록·삭제, 상태 표시, 모바일, Pages 배포 — `web/` (Vite + React + Tailwind v4, Bento 스타일, 다크모드) | `*.pages.dev`에서 실데이터 확인 |
| M3 크롤러 배포 ✅ | `ADVENTURE` env 지원, Cloud Run Job, Scheduler(6시간), 예산 알림 (6.8 참고) | 2026-11-10 Job 직접 실행·Scheduler 강제 실행 모두 성공, 실서버 D1 반영 확인 |
| M4 수동 갱신 (코드 완료, GCP 연결 남음) | `/api/refresh`(전체/모험단, 관리자 전용), Worker→Job 트리거(`worker/src/gcp.ts`), 캐릭터 목록 탭 "갱신" 버튼. GCP 미설정 시 503 "갱신 서버(GCP)가 아직 설정되지 않았습니다". 연결하려면 Worker에 `GCP_PROJECT`, `GCP_REGION`, `GCP_JOB` vars와 `GCP_SA_KEY` secret(서비스 계정 키 JSON, Cloud Run Invoker/Developer 권한) 설정 | 버튼으로 갱신 반영 |
| M5 이관·운영 | 구글 시트 → D1 이관, 실패 알림 | 지인 공유 |
| M6 추후 | Claude 에이전트, 상수 자동 추출, 추이 그래프, 레이드 배정 | — |

---

## 6.8 배포 현황 (2026-11-10)
- D1 `dfloader` (APAC, id `be70c07b-a7b7-4785-9e81-b5cdb10b9d6b`), 마이그레이션 0001~0003 적용
- Worker `dfloader-api` → https://dfloader-api.dfloader-api.workers.dev (workers.dev 서브도메인은 대시보드에서 변경 가능)
- Secrets: `CRAWLER_TOKEN`, `ADMIN_PASSWORD` 설정됨 (값은 문서에 기록하지 않음, 변경: `npx wrangler secret put <이름>`)
  - 주의: PowerShell에서 `"값" | wrangler secret put`으로 넣으면 끝에 `\r`이 붙어 비교 실패함 → 대화형 입력이나 `wrangler secret bulk <json>` 사용
- 주의: 로컬 D1 파일은 `database_id` 기준으로 저장됨. id를 바꾸면 `wrangler dev`가 빈 로컬 DB를 봄 (2026-11-10 id 변경 시 기존 로컬 파일을 새 id 이름으로 복사해 복구)
- `ALLOWED_ORIGINS`: `https://df-raid-sheet.pages.dev` + localhost 전 포트
- GCP (2026-11-10): 프로젝트 `df-sheet-514301` (리전 asia-northeast3). 기존 `natural-treat-384410`은 API 키 유출 의심으로 Google이 정지 → 사용 안 함
  - 이미지: `asia-northeast3-docker.pkg.dev/df-sheet-514301/dfloader/crawler:latest` (Cloud Build, `.gcloudignore`로 3개 파일만 업로드)
  - Cloud Run Job `dfloader-crawler` (2GiB, timeout 30m, retries 0), SA `crawler-job`, env `WORKER_URL`, secret `CRAWLER_TOKEN`←Secret Manager `crawler-token`
  - Scheduler `dfloader-crawler-6h`: `0 2,8,14,20 * * *` Asia/Seoul, SA `scheduler-invoker`(Job에만 run.invoker)
  - 수동 갱신: SA `worker-trigger`(Job에만 run.jobsExecutorWithOverrides) 키 → Worker secret `GCP_SA_KEY`, vars `GCP_PROJECT/REGION/JOB`
  - Cloud Build 기본 SA(`…-compute@developer`)에 storage.objectViewer, artifactregistry.writer, logging.logWriter 부여 (새 프로젝트 기본 권한 없음)
  - 예산 알림: 월 5,000원 (50/90/100%)
  - 크롤러 이미지 재배포: `gcloud builds submit --tag <이미지> --region=asia-northeast3 .` 후 `gcloud run jobs update dfloader-crawler --image=<이미지> --region=asia-northeast3`
  - 주의: Python 기본 User-Agent(`Python-urllib`)는 Cloudflare가 1010으로 차단 → `run_update.py`가 `dfloader-crawler/1.0` 사용
- Pages `df-raid-sheet`: 최신 wrangler는 Pages를 Workers로 자동 위임하며 빌드 실패 → 기존 Pages 방식(`--force`)으로 배포
  ```powershell
  cd web
  $env:VITE_API_URL="https://dfloader-api.dfloader-api.workers.dev"; npm run build
  npx wrangler pages project create df-raid-sheet --production-branch main --force   # 최초 1회
  npx wrangler pages deploy dist --project-name df-raid-sheet --branch main --commit-dirty=true --force
  ```

---

## 7. 사용자 선호
- 답변은 **간결하게**, 배경 설명보다 핵심 명령/답 위주
- **존댓말** 사용
- 백엔드 언어·세부 구현은 Claude 판단에 맡김
