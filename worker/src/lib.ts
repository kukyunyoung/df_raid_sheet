import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

export type Bindings = {
  DB: D1Database
  ALLOWED_ORIGINS: string
  CRAWLER_TOKEN: string
  ADMIN_PASSWORD?: string
}

export type Actor = { deviceId: string; name: string; ip: string; isAdmin: boolean }

export type AppEnv = { Bindings: Bindings; Variables: { actor: Actor } }

export type Ctx = Context<AppEnv>

export const SERVERS: Record<string, string> = {
  카인: 'cain', 디레지에: 'diregie', 시로코: 'siroco', 프레이: 'prey',
  카시야스: 'casillas', 힐더: 'hilder', 안톤: 'anton', 바칼: 'bakal',
}
const SERVER_CODES = new Set(Object.values(SERVERS))

/** 한글 서버명 또는 코드 → 코드. 모르는 서버면 null */
export function toServerCode(s: string): string | null {
  const code = SERVERS[s] ?? s.toLowerCase()
  return SERVER_CODES.has(code) ? code : null
}

export function fail(c: Ctx, status: 400 | 401 | 403 | 404 | 409 | 429, message: string) {
  return c.json({ error: message }, status)
}

export function clientIp(c: Ctx): string {
  return c.req.header('CF-Connecting-IP') ?? ''
}

export function isAdmin(c: Ctx): boolean {
  const pw = c.env.ADMIN_PASSWORD
  return !!pw && c.req.header('X-Admin-Password') === pw
}

/** 쓰기 요청용: 헤더로 작업자 식별, actors 갱신, 차단 확인 */
export const requireActor = createMiddleware<AppEnv>(async (c, next) => {
  const deviceId = c.req.header('X-Device-Id') ?? ''
  let name = ''
  try {
    // 헤더는 ASCII만 허용되므로 프론트에서 encodeURIComponent 해서 보냄
    name = decodeURIComponent(c.req.header('X-Actor-Name') ?? '').trim()
  } catch {
    // 잘못된 인코딩은 이름 없음으로 처리
  }
  if (!/^[A-Za-z0-9-]{8,64}$/.test(deviceId) || !name || name.length > 20) {
    return fail(c, 400, '작업자 이름이 필요합니다')
  }

  const ip = clientIp(c)
  const row = await c.env.DB.prepare(
    `INSERT INTO actors (device_id, name, last_ip, last_seen) VALUES (?1, ?2, ?3, datetime('now'))
     ON CONFLICT(device_id) DO UPDATE SET
       name = excluded.name, last_ip = excluded.last_ip, last_seen = excluded.last_seen
     RETURNING blocked`,
  ).bind(deviceId, name, ip).first<{ blocked: number }>()
  if (row?.blocked) return fail(c, 403, '차단된 사용자입니다')

  c.set('actor', { deviceId, name, ip, isAdmin: isAdmin(c) })
  await next()
})

/** audit_log insert 문 (batch에 넣어서 쓰기와 함께 실행) */
export function auditStmt(
  c: Ctx, action: string, targetType: string, targetId: number, detail?: unknown,
): D1PreparedStatement {
  const a = c.get('actor')
  return c.env.DB.prepare(
    `INSERT INTO audit_log
       (actor_device_id, actor_name, actor_ip, is_admin, action, target_type, target_id, detail)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).bind(
    a.deviceId, a.name, a.ip, a.isAdmin ? 1 : 0,
    action, targetType, targetId, detail === undefined ? null : JSON.stringify(detail),
  )
}

/** 요청 body를 JSON 객체로 파싱. 실패 시 빈 객체 */
export async function jsonBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const v = await c.req.json()
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
