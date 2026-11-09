"""
정기 갱신 실행 스크립트 (Cloud Run Job / Cloud Scheduler에서 호출)

1. Worker API에 실행 시작 알림 → run_id와 대상 캐릭터 목록 수신
2. dfscore.crawl()로 갱신
3. 결과를 Worker API로 전송 → D1 저장

환경변수:
    WORKER_URL     예) https://xxx.workers.dev
    CRAWLER_TOKEN  Worker와 공유하는 비밀 토큰
    RUN_ID         (선택) 수동 갱신 시 Worker가 만든 crawl_runs id
    ADVENTURE      (선택) 해당 모험단만 갱신 (정기 실행에서 RUN_ID 없이 쓸 때)
    TARGETS_FILE   (선택) Worker 대신 로컬 JSON에서 목록 읽기 [{"server":"바칼","name":"븜바"}, ...]
"""
import asyncio
import json
import logging
import os
import sys
import time
import urllib.request

from dfscore import Target, crawl, DecodeError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("run_update")

WORKER_URL = os.environ.get("WORKER_URL", "").rstrip("/")
TOKEN = os.environ.get("CRAWLER_TOKEN", "")


def _request(method: str, path: str, body=None):
    req = urllib.request.Request(
        WORKER_URL + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"null")


def start_run() -> tuple[int | None, list[Target]]:
    """(run_id, 대상). 로컬 테스트(TARGETS_FILE)면 run_id 없음"""
    path = os.environ.get("TARGETS_FILE")
    if path:
        with open(path, encoding="utf-8") as f:
            rows = json.load(f)
        return None, [Target(r["server"], r["name"]) for r in rows]

    body = {}
    if os.environ.get("RUN_ID"):
        body["run_id"] = int(os.environ["RUN_ID"])
    if os.environ.get("ADVENTURE"):
        body["adventure"] = os.environ["ADVENTURE"]
    res = _request("POST", "/api/crawler/start", body)
    return res["run_id"], [Target(r["server"], r["name"]) for r in res["targets"]]


def main() -> int:
    run_id, targets = start_run()
    log.info("run %s, 대상 %d캐릭", run_id, len(targets))
    t0 = time.time()

    try:
        results = asyncio.run(crawl(targets))
    except DecodeError as e:
        log.error("복호화 실패 — 공홈 로직 변경 가능성: %s", e)
        if run_id is not None:
            _request("POST", "/api/crawler/results", {"run_id": run_id, "error": f"decode: {e}"})
        return 2
    except Exception as e:
        # 실행 기록이 running으로 남지 않도록 실패를 알린 뒤 종료
        if run_id is not None:
            _request("POST", "/api/crawler/results", {"run_id": run_id, "error": repr(e)})
        raise

    ok = [r for r in results if r.found]
    missing = [r for r in results if not r.found and not r.error]
    errors = [r for r in results if r.error]
    log.info("완료 %.0fs | 성공 %d, 미발견 %d, 오류 %d",
             time.time() - t0, len(ok), len(missing), len(errors))

    if run_id is not None:
        _request("POST", "/api/crawler/results",
                 {"run_id": run_id, "results": [r.to_dict() for r in results]})
    else:
        print(json.dumps([r.to_dict() for r in results], ensure_ascii=False, indent=2))

    # 오류가 절반 이상이면 실패로 처리 (차단 등 감지용)
    return 1 if len(errors) > len(results) / 2 else 0


if __name__ == "__main__":
    sys.exit(main())
