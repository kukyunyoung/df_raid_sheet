import { Hono } from 'hono'
import { type AppEnv, type Ctx, auditStmt, clientIp, fail, isAdmin, jsonBody, requireActor, str } from './lib'

// 작업자 등록/승인. 이름 입력 → 승인 대기 → 관리자 승인 후 쓰기 가능
const app = new Hono<AppEnv>()

type ActorRow = { name: string; approved: number; blocked: number }

const deviceIdOf = (c: Ctx) => {
  const id = c.req.header('X-Device-Id') ?? ''
  return /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null
}

const toStatus = (r: ActorRow | null) =>
  r
    ? { registered: true, name: r.name, approved: !!r.approved, blocked: !!r.blocked }
    : { registered: false, name: null, approved: false, blocked: false }

// 내 상태
app.get('/me', async (c) => {
  const deviceId = deviceIdOf(c)
  if (!deviceId) return c.json(toStatus(null))
  const row = await c.env.DB.prepare('SELECT name, approved, blocked FROM actors WHERE device_id = ?1')
    .bind(deviceId).first<ActorRow>()
  return c.json(toStatus(row))
})

// 이름 등록 (승인 대기로 생성). 이미 등록된 기기면 기존 이름 유지
app.post('/register', async (c) => {
  const deviceId = deviceIdOf(c)
  const name = str((await jsonBody(c)).name)
  if (!deviceId) return fail(c, 400, '기기 정보가 올바르지 않습니다')
  if (!name || name.length > 20) return fail(c, 400, '이름이 올바르지 않습니다')

  const row = await c.env.DB.prepare(
    `INSERT INTO actors (device_id, name, last_ip, last_seen) VALUES (?1, ?2, ?3, datetime('now'))
     ON CONFLICT(device_id) DO UPDATE SET last_ip = excluded.last_ip, last_seen = excluded.last_seen
     RETURNING name, approved, blocked`,
  ).bind(deviceId, name, clientIp(c)).first<ActorRow>()
  return c.json(toStatus(row))
})

// 이하 관리자 전용
app.use('/', async (c, next) => (isAdmin(c) ? next() : fail(c, 403, '관리자 비밀번호가 필요합니다')))
app.use('/:deviceId/*', async (c, next) => (isAdmin(c) ? next() : fail(c, 403, '관리자 비밀번호가 필요합니다')))

// 작업자 목록 (승인 대기 먼저). 같은 이름의 다른 기기가 있으면 표시
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT device_id, name, approved, blocked, last_ip, first_seen, last_seen,
            (SELECT COUNT(*) FROM actors b WHERE b.name = a.name AND b.device_id <> a.device_id) AS same_name
     FROM actors a
     ORDER BY approved, blocked, first_seen DESC`,
  ).all()
  return c.json(results)
})

async function setFlag(c: Ctx, column: 'approved' | 'blocked', value: number, action: string) {
  const deviceId = c.req.param('deviceId')
  const row = await c.env.DB.prepare(
    `UPDATE actors SET ${column} = ?2 WHERE device_id = ?1 RETURNING name`,
  ).bind(deviceId, value).first<{ name: string }>()
  if (!row) return fail(c, 404, '작업자를 찾을 수 없습니다')
  await auditStmt(c, action, 'actor', null, { device_id: deviceId, actor: row.name }).run()
  return c.json({ ok: true })
}

app.post('/:deviceId/approve', requireActor, (c) => setFlag(c, 'approved', 1, 'actor.approve'))
app.post('/:deviceId/block', requireActor, async (c) => {
  const blocked = (await jsonBody(c)).blocked !== false
  return setFlag(c, 'blocked', blocked ? 1 : 0, blocked ? 'actor.block' : 'actor.unblock')
})

export default app
