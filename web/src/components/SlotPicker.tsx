import { useState } from 'react'
import type { Character, SlotPos } from '../lib/api'
import { fmtNum } from '../lib/format'
import { PARTIES, SLOT_LABELS, isBufferSlot } from '../lib/raid'
import { Field, Modal, cx, inputClass } from './ui'

type Props = {
  pos: SlotPos
  /** 수정이면 현재 캐릭터 (모험단 미리 선택) */
  current: Character | null
  chars: Character[]
  /** 이 기수에 이미 배치된 캐릭터 id */
  placedIds: Set<number>
  onPick: (c: Character) => void
  onClose: () => void
}

/** 칸에 넣을 캐릭터 선택: 모험단 선택 → 그 모험단 캐릭 목록 */
export function SlotPicker({ pos, current, chars, placedIds, onPick, onClose }: Props) {
  const [adventure, setAdventure] = useState(current?.adventure ?? '')
  const buffer = isBufferSlot(pos.slot)

  const adventures = [...new Set(chars.map((c) => c.adventure))].sort((a, b) => a.localeCompare(b, 'ko'))
  const list = chars
    .filter((c) => c.adventure === adventure)
    // 딜러 칸에는 딜러, 버퍼 칸에는 버퍼 (아직 갱신 전인 캐릭은 양쪽 다)
    .filter((c) => (buffer ? c.score_type !== 'equip' : c.score_type !== 'buff'))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

  const partyLabel = PARTIES.find((p) => p.key === pos.party)?.label
  const title = `${pos.round}기 ${partyLabel} 파티 · ${SLOT_LABELS[pos.slot]} ${current ? '수정' : '추가'}`

  return (
    <Modal open onClose={onClose} title={title}>
      <Field label="모험단">
        <select className={inputClass} value={adventure} autoFocus={!current}
          onChange={(e) => setAdventure(e.target.value)}>
          <option value="" disabled>모험단 선택</option>
          {adventures.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </Field>

      {adventure && (
        <ul className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-xl ring-1 ring-gray-200 dark:divide-white/5 dark:ring-white/10">
          {list.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              이 모험단에 {buffer ? '버퍼' : '딜러'}가 없습니다.
            </li>
          )}
          {list.map((c) => {
            const isCurrent = c.id === current?.id
            const placed = !isCurrent && placedIds.has(c.id)
            return (
              <li key={c.id}>
                <button
                  disabled={placed || isCurrent}
                  onClick={() => onPick(c)}
                  className={cx(
                    'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition',
                    'enabled:hover:bg-gray-50 disabled:cursor-not-allowed dark:enabled:hover:bg-white/5',
                    placed && 'opacity-40',
                    isCurrent && 'bg-indigo-50/60 dark:bg-indigo-400/10',
                  )}
                >
                  <span className="min-w-0 truncate font-medium">
                    {c.name}
                    {isCurrent && <span className="ml-2 text-xs text-gray-500">현재</span>}
                    {placed && <span className="ml-2 text-xs text-gray-500">이 기수에 있음</span>}
                  </span>
                  <span
                    className={cx(
                      'shrink-0 font-semibold tabular-nums',
                      c.score_type === 'buff' ? 'text-teal-600 dark:text-teal-400' : 'text-indigo-600 dark:text-indigo-400',
                    )}
                  >
                    {fmtNum(c.score)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
