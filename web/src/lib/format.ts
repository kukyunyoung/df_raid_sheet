import type { Character, LogEntry, Tag } from './api'

export const fmtNum = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('ko-KR')

/** D1의 'YYYY-MM-DD HH:MM:SS'(UTC) → Date */
export const parseUtc = (s: string) => new Date(s.replace(' ', 'T') + 'Z')

export function timeAgo(s: string | null | undefined): string {
  if (!s) return '없음'
  const sec = Math.max(0, (Date.now() - parseUtc(s).getTime()) / 1000)
  if (sec < 60) return '방금'
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`
  return `${Math.floor(sec / 86400)}일 전`
}

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—'
  return parseUtc(s).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export const STATUS_TEXT: Record<Character['status'], string> = {
  pending: '갱신 대기',
  ok: '정상',
  not_found: '검색 안 됨',
  error: '조회 실패',
}

const PARTY_LABEL: Record<string, string> = { red: '레드', yellow: '옐로', green: '그린' }

export function describeLog(log: LogEntry, tags: Tag[]): string {
  const d = (log.detail ?? {}) as Record<string, unknown>
  const who = `${d.adventure ?? ''} ${d.name ?? ''}`.trim()
  const tagLabel = tags.find((t) => t.key === d.tag)?.label ?? String(d.tag ?? '')
  switch (log.action) {
    case 'character.create':
      return `${who} ${d.restored ? '복구' : '등록'}`
    case 'character.delete':
      return `${who} 삭제`
    case 'tag.set':
      return `${who} ${tagLabel} 체크`
    case 'tag.unset':
      return `${who} ${tagLabel} 해제`
    case 'actor.approve':
      return `작업자 ${d.actor} 승인`
    case 'actor.block':
      return `작업자 ${d.actor} 차단`
    case 'actor.unblock':
      return `작업자 ${d.actor} 차단 해제`
    case 'raid.create':
      return `공대표 ${d.raid} 추가`
    case 'raid.round_add':
      return `${d.raid} ${d.round}기 추가`
    case 'slot.set':
      return `${d.raid} ${d.round}기 ${PARTY_LABEL[String(d.party)] ?? ''} ${who} 배치`
    case 'slot.clear':
      return `${d.raid} ${d.round}기 ${PARTY_LABEL[String(d.party)] ?? ''} ${who} 제외`
    default:
      return `${log.action} ${who}`
  }
}
