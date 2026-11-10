import { actorHeaders } from './actor'

const BASE = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '')

export type Character = {
  id: number
  adventure: string
  server: string
  name: string
  job: string | null
  level: number | null
  fame: number | null
  is_buffer: boolean | null
  equip_point: number | null
  buff_point: number | null
  score: number | null
  score_type: 'equip' | 'buff' | null
  status: 'pending' | 'ok' | 'not_found' | 'error'
  last_crawled_at: string | null
  tags: string[]
}

export type Tag = {
  key: string
  label: string
  emoji: string | null
  admin_only: number
  max_per_adventure: number
}

export type Meta = {
  servers: { code: string; label: string }[]
  tags: Tag[]
  tag_limits: { adventure: string; tag: string; max_count: number }[]
  last_success: { finished_at: string; scope: string } | null
  /** 진행 중인 갱신 (시작 30분 이내) */
  running: { started_at: string; scope: string } | null
}

export type RefreshScope = { scope: 'all' } | { scope: 'adventure'; adventure: string }

export type LogEntry = {
  id: number
  actor_name: string
  is_admin: number
  action: string
  target_type: string | null
  target_id: number | null
  detail: Record<string, unknown> | null
  created_at: string
}

export type Me = { registered: boolean; name: string | null; approved: boolean; blocked: boolean }

export type ActorInfo = {
  device_id: string
  name: string
  approved: number
  blocked: number
  first_seen: string
  last_seen: string | null
  /** 같은 이름을 쓰는 다른 기기 수 */
  same_name: number
}

export type Raid = { id: number; name: string; rounds: number }

export type PartyKey = 'red' | 'yellow' | 'green'

/** 공대표 칸 위치. slot 0~2 딜러, 3 버퍼 */
export type SlotPos = { round: number; party: PartyKey; slot: number }

export type RaidSlot = SlotPos & { character_id: number }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** 차단된 기기로 판정되면 호출 (App이 차단 화면으로 전환) */
let blockedHandler: (() => void) | null = null
export function onBlocked(fn: (() => void) | null) {
  blockedHandler = fn
}

// 모든 요청에 기기 id를 보냄 (차단된 기기는 조회도 불가)
async function request<T>(method: string, path: string, body?: unknown, _write = false): Promise<T> {
  const headers: Record<string, string> = actorHeaders()
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(BASE + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없습니다')
  }
  const data = await res.json().catch(() => null)
  if (res.status === 403 && data?.blocked) blockedHandler?.()
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `요청 실패 (${res.status})`)
  return data as T
}

export const api = {
  meta: () => request<Meta>('GET', '/api/meta'),
  /** 변경 감지용 (값이 바뀌면 다시 불러오기) */
  version: () => request<{ v: string; running: boolean }>('GET', '/api/version'),
  characters: () => request<Character[]>('GET', '/api/characters'),
  logs: (limit = 20) => request<LogEntry[]>('GET', `/api/logs?limit=${limit}`),
  addCharacter: (b: { server: string; name: string; adventure: string }) =>
    request<{ id: number; restored: boolean }>('POST', '/api/characters', b, true),
  deleteCharacter: (id: number) => request('DELETE', `/api/characters/${id}`, undefined, true),
  setTag: (id: number, key: string, on: boolean) =>
    request(on ? 'PUT' : 'DELETE', `/api/characters/${id}/tags/${key}`, undefined, true),

  me: () => request<Me>('GET', '/api/actors/me', undefined, true),
  register: (name: string) => request<Me>('POST', '/api/actors/register', { name }, true),
  actors: () => request<ActorInfo[]>('GET', '/api/actors', undefined, true),
  approveActor: (deviceId: string) =>
    request('POST', `/api/actors/${deviceId}/approve`, undefined, true),
  blockActor: (deviceId: string, blocked: boolean) =>
    request('POST', `/api/actors/${deviceId}/block`, { blocked }, true),
  renameActor: (deviceId: string, name: string) =>
    request('PUT', `/api/actors/${deviceId}`, { name }, true),
  deleteActor: (deviceId: string) => request('DELETE', `/api/actors/${deviceId}`, undefined, true),

  refresh: (body: RefreshScope) => request<{ run_id: number }>('POST', '/api/refresh', body, true),

  raids: () => request<Raid[]>('GET', '/api/raids'),
  createRaid: (name: string) => request<Raid>('POST', '/api/raids', { name }, true),
  addRound: (raidId: number) => request<Raid>('POST', `/api/raids/${raidId}/rounds`, undefined, true),
  raidSlots: (raidId: number) => request<RaidSlot[]>('GET', `/api/raids/${raidId}/slots`),
  setSlot: (raidId: number, pos: SlotPos, characterId: number) =>
    request('PUT', `/api/raids/${raidId}/slots`, { ...pos, character_id: characterId }, true),
  clearSlot: (raidId: number, pos: SlotPos) =>
    request('DELETE', `/api/raids/${raidId}/slots?round=${pos.round}&party=${pos.party}&slot=${pos.slot}`,
      undefined, true),
}
