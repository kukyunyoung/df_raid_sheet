import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { GcpConfig } from './gcp'

export type Bindings = {
  DB: D1Database
  ALLOWED_ORIGINS: string
  CRAWLER_TOKEN: string
  ADMIN_PASSWORD?: string
} & GcpConfig

export type Actor = { deviceId: string; name: string; isAdmin: boolean }

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

/** 요청 헤더의 기기 id. 형식이 틀리면 null */
export function deviceIdOf(c: Ctx): string | null {
  const id = c.req.header('X-Device-Id') ?? ''
  return /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null
}

export const BLOCKED_MESSAGE = '차단된 사용자입니다'

/** 차단된 기기는 읽기도 막음 (관리자 비밀번호 요청은 예외) */
export const rejectBlocked = createMiddleware<AppEnv>(async (c, next) => {
  const deviceId = deviceIdOf(c)
  if (deviceId && !isAdmin(c)) {
    const row = await c.env.DB.prepare('SELECT blocked FROM actors WHERE device_id = ?1')
      .bind(deviceId).first<{ blocked: number }>()
    if (row?.blocked) return c.json({ error: BLOCKED_MESSAGE, blocked: true }, 403)
  }
  await next()
})

export function isAdmin(c: Ctx): boolean {
  const pw = c.env.ADMIN_PASSWORD
  return !!pw && c.req.header('X-Admin-Password') === pw
}

/** 쓰기 요청용: 헤더로 작업자 식별, actors 갱신, 차단 확인 */
export const requireActor = createMiddleware<AppEnv>(async (c, next) => {
  const deviceId = deviceIdOf(c)
  let name = ''
  try {
    // 헤더는 ASCII만 허용되므로 프론트에서 encodeURIComponent 해서 보냄
    name = decodeURIComponent(c.req.header('X-Actor-Name') ?? '').trim()
  } catch {
    // 잘못된 인코딩은 이름 없음으로 처리
  }
  if (!deviceId || !name || name.length > 20) {
    return fail(c, 400, '작업자 이름이 필요합니다')
  }

  const admin = isAdmin(c)
  // 이름은 처음 등록한 값으로 고정 (이후 헤더로 다른 이름을 보내도 무시, 관리자만 변경)
  // 관리자 비밀번호로 요청한 기기는 자동 승인
  const row = await c.env.DB.prepare(
    `INSERT INTO actors (device_id, name, last_seen, approved) VALUES (?1, ?2, datetime('now'), ?3)
     ON CONFLICT(device_id) DO UPDATE SET
       last_seen = excluded.last_seen,
       approved = MAX(approved, excluded.approved)
     RETURNING blocked, name, approved`,
  ).bind(deviceId, name, admin ? 1 : 0).first<{ blocked: number; name: string; approved: number }>()
  if (row?.blocked && !admin) return fail(c, 403, BLOCKED_MESSAGE)
  if (!row?.approved) return fail(c, 403, '관리자 승인 대기 중입니다')

  c.set('actor', { deviceId, name: row.name, isAdmin: admin })
  await next()
})

/** audit_log insert 문 (batch에 넣어서 쓰기와 함께 실행) */
export function auditStmt(
  c: Ctx, action: string, targetType: string, targetId: number | null, detail?: unknown,
): D1PreparedStatement {
  const a = c.get('actor')
  return c.env.DB.prepare(
    `INSERT INTO audit_log
       (actor_device_id, actor_name, is_admin, action, target_type, target_id, detail)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).bind(
    a.deviceId, a.name, a.isAdmin ? 1 : 0,
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
