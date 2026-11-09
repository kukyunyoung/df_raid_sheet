import { Hono } from 'hono'
import { cors } from 'hono/cors'
import characters from './characters'
import crawler from './crawler'
import { type AppEnv, SERVERS, isAdmin } from './lib'

const app = new Hono<AppEnv>()

app.use('/api/*', (c, next) => {
  const origins = c.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  return cors({
    origin: (origin) => (origins.includes(origin) ? origin : null),
    allowHeaders: ['Content-Type', 'X-Device-Id', 'X-Actor-Name', 'X-Admin-Password'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })(c, next)
})

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: '서버 오류' }, 500)
})

// 화면 구성용 정보: 서버 목록, 태그 정의/제한, 마지막 갱신
app.get('/api/meta', async (c) => {
  const db = c.env.DB
  const [tags, limits, lastRun] = await db.batch<Record<string, unknown>>([
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
  ])
  return c.json({
    servers: Object.entries(SERVERS).map(([label, code]) => ({ code, label })),
    tags: tags.results,
    tag_limits: limits.results,
    last_success: lastRun.results[0] ?? null,
  })
})

// 작업 로그. IP/device는 관리자에게만
app.get('/api/logs', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 100, 500)
  const before = Number(c.req.query('before')) || Number.MAX_SAFE_INTEGER
  const { results } = await c.env.DB.prepare(
    `SELECT id, actor_name, actor_ip, actor_device_id, is_admin, action,
            target_type, target_id, detail, created_at
     FROM audit_log WHERE id < ?1 ORDER BY id DESC LIMIT ?2`,
  ).bind(before, limit).all<Record<string, unknown> & { detail: string | null }>()

  const admin = isAdmin(c)
  return c.json(results.map(({ actor_ip, actor_device_id, detail, ...r }) => ({
    ...r,
    detail: detail ? JSON.parse(detail) : null,
    ...(admin ? { actor_ip, actor_device_id } : {}),
  })))
})

app.route('/api/characters', characters)
app.route('/api/crawler', crawler)

export default app
