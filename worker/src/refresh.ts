import { Hono } from 'hono'
import { GcpNotConfigured, runCrawlerJob } from './gcp'
import { type AppEnv, auditStmt, fail, isAdmin, jsonBody, requireActor, str } from './lib'

// 수동 갱신 (관리자). 정기 갱신은 Cloud Scheduler가 6시간마다 별도로 실행
const app = new Hono<AppEnv>()

/** 시작 30분 이내의 running 행 = 진행 중 (크롤러가 죽어 남은 행은 무시) */
export const RUNNING_SQL = `SELECT started_at, scope FROM crawl_runs
  WHERE status = 'running' AND started_at > datetime('now', '-30 minutes')
  ORDER BY id DESC LIMIT 1`

app.post('/', requireActor, async (c) => {
  if (!isAdmin(c)) return fail(c, 403, '관리자 비밀번호가 필요합니다')
  const body = await jsonBody(c)
  const db = c.env.DB

  let adventureId: number | null = null
  let adventure = ''
  if (body.scope === 'adventure') {
    adventure = str(body.adventure)
    const adv = await db.prepare('SELECT id FROM adventures WHERE name = ?1').bind(adventure).first<{ id: number }>()
    if (!adv) return fail(c, 404, '모험단을 찾을 수 없습니다')
    adventureId = adv.id
  } else if (body.scope !== 'all') {
    return fail(c, 400, '갱신 범위가 올바르지 않습니다')
  }

  if (await db.prepare(RUNNING_SQL).first()) return fail(c, 409, '이미 갱신 중입니다')

  const run = await db.prepare(
    `INSERT INTO crawl_runs (trigger_type, scope, adventure_id)
     VALUES ('manual', ?1, ?2) RETURNING id`,
  ).bind(adventureId ? 'adventure' : 'all', adventureId).first<{ id: number }>()

  try {
    await runCrawlerJob(c.env, run!.id)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.prepare(
      `UPDATE crawl_runs SET status = 'failed', message = ?2, finished_at = datetime('now') WHERE id = ?1`,
    ).bind(run!.id, message).run()
    if (e instanceof GcpNotConfigured) return c.json({ error: message }, 503)
    console.error(e)
    return c.json({ error: '갱신 서버 실행에 실패했습니다' }, 502)
  }

  await auditStmt(c, 'refresh.request', 'crawl_run', run!.id,
    { scope: adventureId ? 'adventure' : 'all', adventure: adventure || null }).run()
  return c.json({ run_id: run!.id })
})

export default app
