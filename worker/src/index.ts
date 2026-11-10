import { Hono } from 'hono'
import { cors } from 'hono/cors'
import actors from './actors'
import characters from './characters'
import crawler from './crawler'
import raids from './raids'
import refresh, { RUNNING_SQL } from './refresh'
import { type AppEnv, SERVERS, isAdmin, rejectBlocked } from './lib'

const app = new Hono<AppEnv>()

/** 'http://localhost:*' 처럼 포트 자리에 *를 쓰면 모든 포트 허용 */
function originAllowed(origin: string, allowed: string[]): boolean {
  return allowed.some((a) =>
    a.endsWith(':*') ? origin.startsWith(a.slice(0, -1)) && /^\d+$/.test(origin.slice(a.length - 1)) : a === origin,
  )
}

app.use('/api/*', (c, next) => {
  const origins = c.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  return cors({
    origin: (origin) => (originAllowed(origin, origins) ? origin : null),
    allowHeaders: ['Content-Type', 'X-Device-Id', 'X-Actor-Name', 'X-Admin-Password'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })(c, next)
})

// 차단된 기기는 조회도 불가 (크롤러는 토큰 인증이라 제외)
app.use('/api/*', (c, next) =>
  c.req.method === 'OPTIONS' || c.req.path.startsWith('/api/crawler/') ? next() : rejectBlocked(c, next))

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: '서버 오류' }, 500)
})

// 화면 구성용 정보: 서버 목록, 태그 정의/제한, 마지막 갱신
app.get('/api/meta', async (c) => {
  const db = c.env.DB
  const [tags, limits, lastRun, running] = await db.batch<Record<string, unknown>>([
    db.prepare(
      `SELECT key, label, emoji, admin_only, max_per_adventure FROM tags ORDER BY sort_order, id`,
    ),
    db.prepare(
      `SELECT a.name AS adventure, t.key AS tag, l.max_count
       FROM adventure_tag_limits l
       JOIN adventures a ON a.id = l.adventure_id
       JOIN tags t ON t.id = l.tag_id`,
    ),
    db.prepare(
      `SELECT finished_at, scope FROM crawl_runs
       WHERE status = 'success' ORDER BY finished_at DESC LIMIT 1`,
    ),
    db.prepare(RUNNING_SQL),
  ])
  return c.json({
    servers: Object.entries(SERVERS).map(([label, code]) => ({ code, label })),
    tags: tags.results,
    tag_limits: limits.results,
    last_success: lastRun.results[0] ?? null,
    running: running.results[0] ?? null,
  })
})

// 실시간 반영용 변경 감지. 화면이 주기적으로 호출하고 값이 바뀌면 전체를 다시 불러옴
// (모든 쓰기는 audit_log, 갱신은 crawl_runs, 이름 신청은 actors에 흔적이 남음)
app.get('/api/version', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT
       (SELECT COALESCE(MAX(id), 0) FROM audit_log) AS log,
       (SELECT COALESCE(MAX(id), 0) || '.' || COALESCE(SUM(status = 'running'), 0)
          FROM crawl_runs) AS run,
       (SELECT COUNT(*) || '.' || COALESCE(SUM(approved), 0) || '.' || COALESCE(SUM(blocked), 0)
          FROM actors) AS act,
       EXISTS(${RUNNING_SQL}) AS running`,
  ).first<{ log: number; run: string; act: string; running: number }>()
  return c.json({ v: `${row!.log}|${row!.run}|${row!.act}`, running: !!row!.running })
})

// 작업 로그. 기기 id는 관리자에게만
app.get('/api/logs', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 100, 500)
  const before = Number(c.req.query('before')) || Number.MAX_SAFE_INTEGER
  const { results } = await c.env.DB.prepare(
    `SELECT id, actor_name, actor_device_id, is_admin, action,
            target_type, target_id, detail, created_at
     FROM audit_log WHERE id < ?1 ORDER BY id DESC LIMIT ?2`,
  ).bind(before, limit).all<Record<string, unknown> & { detail: string | null }>()

  const admin = isAdmin(c)
  return c.json(results.map(({ actor_device_id, detail, ...r }) => ({
    ...r,
    detail: detail ? JSON.parse(detail) : null,
    ...(admin ? { actor_device_id } : {}),
  })))
})

app.route('/api/actors', actors)
app.route('/api/characters', characters)
app.route('/api/crawler', crawler)
app.route('/api/raids', raids)
app.route('/api/refresh', refresh)

export default app
