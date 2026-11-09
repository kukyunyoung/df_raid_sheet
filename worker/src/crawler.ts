import { Hono } from 'hono'
import { type AppEnv, fail, jsonBody, str } from './lib'

// Cloud Run Job(run_update.py) 전용 API
const app = new Hono<AppEnv>()

app.use('*', async (c, next) => {
  const token = c.env.CRAWLER_TOKEN
  if (!token || c.req.header('Authorization') !== `Bearer ${token}`) {
    return fail(c, 401, '인증 실패')
  }
  await next()
})

type RunRow = { id: number; scope: string; adventure_id: number | null; status: string }

// 실행 시작: crawl_runs 행 확보 후 대상 목록 반환
// - 수동 갱신: /api/refresh가 만든 run_id를 env로 받아 전달
// - 정기 갱신: run_id 없이 호출 → 여기서 생성 (adventure 지정 시 해당 모험단만)
app.post('/start', async (c) => {
  const body = await jsonBody(c)
  const db = c.env.DB
  let run: RunRow | null

  if (body.run_id != null) {
    run = await db.prepare('SELECT id, scope, adventure_id, status FROM crawl_runs WHERE id = ?1')
      .bind(Number(body.run_id)).first<RunRow>()
    if (!run) return fail(c, 404, `run ${body.run_id} 없음`)
  } else {
    const adventure = str(body.adventure)
    let adventureId: number | null = null
    if (adventure) {
      const adv = await db.prepare('SELECT id FROM adventures WHERE name = ?1')
        .bind(adventure).first<{ id: number }>()
      if (!adv) return fail(c, 404, `모험단 ${adventure} 없음`)
      adventureId = adv.id
    }
    run = await db.prepare(
      `INSERT INTO crawl_runs (trigger_type, scope, adventure_id) VALUES ('schedule', ?1, ?2)
       RETURNING id, scope, adventure_id, status`,
    ).bind(adventureId ? 'adventure' : 'all', adventureId).first<RunRow>()
  }

  const { results: targets } = await db.prepare(
    `SELECT server, name FROM characters
     WHERE deleted_at IS NULL AND (?1 IS NULL OR adventure_id = ?1)
     ORDER BY id`,
  ).bind(run!.adventure_id).all<{ server: string; name: string }>()

  return c.json({ run_id: run!.id, targets })
})

// 크롤러 결과(CharScore.to_dict() 배열)를 json_each로 한 번에 반영
const RESULTS_CTE = `WITH r AS (
  SELECT json_extract(value, '$.server')       AS server,
         json_extract(value, '$.name')         AS name,
         json_extract(value, '$.found')        AS found,
         json_extract(value, '$.error')        AS error,
         json_extract(value, '$.character_id') AS character_id,
         json_extract(value, '$.job')          AS job,
         json_extract(value, '$.level')        AS level,
         json_extract(value, '$.fame')         AS fame,
         json_extract(value, '$.is_buffer')    AS is_buffer,
         json_extract(value, '$.equip_point')  AS equip_point,
         json_extract(value, '$.buff_point')   AS buff_point,
         json_extract(value, '$.score')        AS score,
         json_extract(value, '$.score_type')   AS score_type
  FROM json_each(?1)
)`
const MATCH = 'characters.server = r.server AND characters.name = r.name AND characters.deleted_at IS NULL'

type CharScore = { found?: boolean; error?: string | null }

app.post('/results', async (c) => {
  const body = await jsonBody(c)
  const runId = Number(body.run_id)
  const db = c.env.DB
  const run = await db.prepare('SELECT id FROM crawl_runs WHERE id = ?1').bind(runId).first()
  if (!run) return fail(c, 404, `run ${body.run_id} 없음`)

  // 크롤러 자체 실패 (복호화 실패 등)
  if (body.error) {
    await db.prepare(
      `UPDATE crawl_runs SET status = 'failed', message = ?2, finished_at = datetime('now')
       WHERE id = ?1`,
    ).bind(runId, String(body.error).slice(0, 500)).run()
    return c.json({ ok: true })
  }

  const results = Array.isArray(body.results) ? (body.results as CharScore[]) : []
  const ok = results.filter((r) => r.found).length
  const error = results.filter((r) => r.error).length
  const notFound = results.length - ok - error
  // 오류가 과반이면 차단 의심 → 실패 처리 (run_update.py exit 1과 같은 기준)
  const status = error > results.length / 2 ? 'failed' : 'success'
  const json = JSON.stringify(results)

  await db.batch([
    // 이력: 값이 바뀐 캐릭만 (반드시 characters 갱신 전에 실행)
    db.prepare(`${RESULTS_CTE}
      INSERT INTO score_history (character_id, fame, equip_point, buff_point)
      SELECT characters.id, r.fame, r.equip_point, r.buff_point
      FROM r JOIN characters ON ${MATCH}
      WHERE r.found AND (characters.fame IS NOT r.fame
                         OR characters.equip_point IS NOT r.equip_point
                         OR characters.buff_point IS NOT r.buff_point)`).bind(json),
    db.prepare(`${RESULTS_CTE}
      UPDATE characters SET
        df_character_id = r.character_id, job = r.job, level = r.level, fame = r.fame,
        is_buffer = r.is_buffer, equip_point = r.equip_point, buff_point = r.buff_point,
        score = r.score, score_type = r.score_type,
        status = 'ok', last_crawled_at = datetime('now')
      FROM r WHERE ${MATCH} AND r.found`).bind(json),
    // 미발견/오류: 점수는 유지하고 상태만 변경
    db.prepare(`${RESULTS_CTE}
      UPDATE characters SET
        status = CASE WHEN r.error IS NOT NULL THEN 'error' ELSE 'not_found' END,
        last_crawled_at = CASE WHEN r.error IS NOT NULL THEN characters.last_crawled_at
                               ELSE datetime('now') END
      FROM r WHERE ${MATCH} AND NOT r.found`).bind(json),
    db.prepare(
      `UPDATE crawl_runs SET status = ?2, total = ?3, ok = ?4, not_found = ?5, error = ?6,
         finished_at = datetime('now')
       WHERE id = ?1`,
    ).bind(runId, status, results.length, ok, notFound, error),
  ])

  return c.json({ ok: true, status })
})

export default app
