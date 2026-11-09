"""
던파 공홈 장비점수/버프력 수집 모듈

공홈 캐릭터 검색 페이지를 Playwright로 연 뒤, 페이지 안에서
/world/character/fetch 를 호출해 결과를 받고 장비점수/버프력을 복호화한다.

사용 예:
    import asyncio
    from dfscore import Target, crawl

    results = asyncio.run(crawl([Target("바칼", "븜바"), Target("바칼", "구구녕")]))
"""
from __future__ import annotations

import asyncio
import base64
import logging
from dataclasses import dataclass, asdict
from typing import Optional

from playwright.async_api import async_playwright

log = logging.getLogger("dfscore")

SEARCH_PAGE = "https://df.nexon.com/world/character"

SERVERS = {
    "카인": "cain", "디레지에": "diregie", "시로코": "siroco", "프레이": "prey",
    "카시야스": "casillas", "힐더": "hilder", "안톤": "anton", "바칼": "bakal",
}

# 공홈 JS(nameIndex.js)에 하드코딩된 복호화 상수
# 공홈이 업데이트되면 바뀔 수 있음 → decode 결과가 숫자가 아니면 에러로 감지
_UT = [94, 105, 48, 89, 125, 105]
_LT = [88, 96, 45, 120, 42, 89]
_FT = [104, 95, 52, 69, 43, 59]
_BT = [115, 110, 42, 59, 33, 42]


class DecodeError(Exception):
    """복호화 결과가 숫자가 아님 (공홈 로직 변경 가능성)"""


@dataclass
class Target:
    server: str  # 한글 서버명 ("바칼") 또는 코드 ("bakal")
    name: str

    @property
    def server_code(self) -> str:
        return SERVERS.get(self.server, self.server)


@dataclass
class CharScore:
    server: str
    name: str
    found: bool
    character_id: Optional[str] = None
    job: Optional[str] = None
    level: Optional[int] = None
    fame: Optional[int] = None
    is_buffer: Optional[bool] = None
    equip_point: Optional[int] = None
    buff_point: Optional[int] = None
    score: Optional[int] = None          # 딜러=장비점수, 버퍼=버프력
    score_type: Optional[str] = None     # "equip" | "buff"
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


def decode_point(value: str, key: str, salt: str) -> int:
    """공홈 JS의 복호화 함수(pt)를 그대로 옮긴 것"""
    if not value:
        return 0
    # JS: String.fromCharCode(bytes) 후 TextEncoder(UTF-8)로 인코딩
    xor_key = (base64.b64decode(key) + bytes(_UT + _LT)).decode("latin1").encode("utf-8")
    pad = (base64.b64decode(salt) + bytes(_FT + _BT)).decode("latin1")

    data = base64.b64decode(value)
    plain = bytes(b ^ xor_key[i % len(xor_key)] for i, b in enumerate(data))
    text = plain.decode("utf-8", errors="replace")
    num = text[len(pad):len(text) - len(pad)]

    if not num.isdigit():
        raise DecodeError(f"복호화 결과가 숫자가 아님: {num!r}")
    return int(num)


def _parse(target: Target, raw: dict) -> CharScore:
    base = CharScore(server=target.server, name=target.name, found=False)

    if raw.get("error") or raw.get("status") != 200:
        base.error = raw.get("error") or f"HTTP {raw.get('status')}"
        return base

    rows = (raw.get("data") or {}).get("body") or []
    # 유사 닉네임 제외: 서버 + 닉네임 정확히 일치
    row = next((r for r in rows
                if r.get("characterName") == target.name
                and r.get("serverName") == target.server_code), None)
    if not row:
        return base  # 검색 결과 없음 (닉변/삭제 등)

    key = row.get("obfuscateKey") or {}
    equip = decode_point(row.get("equipmentPoint"), key.get("key", ""), key.get("salt", ""))
    buff = decode_point(row.get("buffPoint"), key.get("key", ""), key.get("salt", ""))
    is_buffer = bool(row.get("bufferCharacter"))

    return CharScore(
        server=target.server,
        name=target.name,
        found=True,
        character_id=row.get("characterId"),
        job=row.get("jobGrowName"),
        level=row.get("level"),
        fame=int(row["fame"]) if row.get("fame") else None,
        is_buffer=is_buffer,
        equip_point=equip,
        buff_point=buff,
        score=buff if is_buffer else equip,
        score_type="buff" if is_buffer else "equip",
    )


# 페이지 안에서 실행되는 JS: 동시성 제한 + 랜덤 지연으로 fetch
_FETCH_JS = """
async ({items, concurrency, minDelay, maxDelay}) => {
  const out = new Array(items.length);
  let next = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const it = items[i];
      try {
        const url = '/world/character/fetch?serverName=' + it.server
                  + '&characName=' + encodeURIComponent(it.name);
        const r = await fetch(url, {credentials: 'include'});
        out[i] = {status: r.status, data: r.ok ? await r.json() : null};
      } catch (e) {
        out[i] = {status: 0, error: String(e)};
      }
      await sleep(minDelay + Math.random() * (maxDelay - minDelay));
    }
  }
  await Promise.all(Array.from({length: concurrency}, worker));
  return out;
}
"""


async def crawl(
    targets: list[Target],
    concurrency: int = 2,
    min_delay_ms: int = 400,
    max_delay_ms: int = 900,
    chunk_size: int = 50,
    retries: int = 2,
) -> list[CharScore]:
    """등록된 캐릭터 전체를 갱신해서 CharScore 리스트로 반환"""
    results: list[CharScore] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(locale="ko-KR")
        await page.goto(SEARCH_PAGE, wait_until="domcontentloaded")

        for start in range(0, len(targets), chunk_size):
            chunk = targets[start:start + chunk_size]
            pending = list(range(len(chunk)))
            parsed: dict[int, CharScore] = {}

            for attempt in range(retries + 1):
                items = [{"server": chunk[i].server_code, "name": chunk[i].name} for i in pending]
                raws = await page.evaluate(_FETCH_JS, {
                    "items": items, "concurrency": concurrency,
                    "minDelay": min_delay_ms, "maxDelay": max_delay_ms,
                })
                failed = []
                for i, raw in zip(pending, raws):
                    res = _parse(chunk[i], raw)
                    parsed[i] = res
                    if res.error:
                        failed.append(i)
                if not failed:
                    break
                pending = failed
                log.warning("재시도 %d회차: %d건", attempt + 1, len(failed))
                await asyncio.sleep(5)
                await page.reload(wait_until="domcontentloaded")

            results.extend(parsed[i] for i in range(len(chunk)))
            log.info("진행 %d/%d", min(start + chunk_size, len(targets)), len(targets))

        await browser.close()

    return results
