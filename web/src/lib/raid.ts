import type { Character, PartyKey, RaidSlot } from './api'

export type Party = {
  key: PartyKey
  label: string
  /** 딜러 3 + 버퍼 1. 빈 자리는 null */
  slots: (Character | null)[]
}

export const PARTIES: { key: PartyKey; label: string }[] = [
  { key: 'red', label: '레드' },
  { key: 'yellow', label: '옐로' },
  { key: 'green', label: '그린' },
]

export const PARTY_STYLE: Record<PartyKey, { dot: string; text: string }> = {
  red: { dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  yellow: { dot: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' },
  green: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
}

export const SLOT_LABELS = ['딜러', '딜러', '딜러', '버퍼']
export const isBufferSlot = (slot: number) => slot === 3

/** 칸 목록 → 기수별 파티 표. 목록에 없는 캐릭(숨김 등)은 빈 자리로 */
export function buildRounds(rounds: number, slots: RaidSlot[], chars: Character[]): Party[][] {
  const byId = new Map(chars.map((c) => [c.id, c]))
  const table = Array.from({ length: rounds }, () =>
    PARTIES.map((p): Party => ({ ...p, slots: [null, null, null, null] })),
  )
  for (const s of slots) {
    const party = table[s.round - 1]?.find((p) => p.key === s.party)
    if (party) party.slots[s.slot] = byId.get(s.character_id) ?? null
  }
  return table
}

/** 파티 화력 = (딜러 합 / 10만) × (버프력 / 10만). 버퍼가 없으면 null */
export function partyPower(p: Party): number | null {
  const buffer = p.slots[3]
  if (!buffer?.score) return null
  const dealSum = p.slots.slice(0, 3).reduce((s, c) => s + (c?.score ?? 0), 0)
  return (dealSum / 100_000) * (buffer.score / 100_000)
}

export type DuplicateIssue = { round: number; adventure: string; names: string[] }

/** 한 기수(공대) 안에 같은 모험단 캐릭터가 2명 이상이면 문제 */
export function findDuplicates(rounds: Party[][]): DuplicateIssue[] {
  const issues: DuplicateIssue[] = []
  rounds.forEach((parties, i) => {
    const byAdventure = new Map<string, string[]>()
    for (const c of parties.flatMap((p) => p.slots)) {
      if (!c) continue
      byAdventure.set(c.adventure, [...(byAdventure.get(c.adventure) ?? []), c.name])
    }
    for (const [adventure, names] of byAdventure) {
      if (names.length > 1) issues.push({ round: i + 1, adventure, names })
    }
  })
  return issues
}
