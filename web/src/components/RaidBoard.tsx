import type { Character, SlotPos, Tag } from '../lib/api'
import { PARTY_STYLE, type Party, SLOT_LABELS } from '../lib/raid'
import { CharacterCard } from './CharacterCard'
import { cx } from './ui'

const actionClass =
  'flex size-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-200 ' +
  'hover:text-gray-900 dark:bg-gray-700 dark:text-gray-200 dark:ring-white/15 dark:hover:text-white'

/** 레이드 파티 표: 행 = 레드/옐로/그린, 열 = 딜러 3 + 버퍼 1 */
export function RaidBoard({
  round, parties, tags, onSelect, onPick, onClear,
}: {
  round: number
  parties: Party[]
  tags: Tag[]
  onSelect: (c: Character) => void
  /** 빈 칸 추가 또는 수정 → 캐릭터 선택창 */
  onPick: (pos: SlotPos, current: Character | null) => void
  onClear: (pos: SlotPos) => void
}) {
  return (
    <div className="space-y-4">
      {/* 열 머리글 (넓은 화면) */}
      <div className="hidden grid-cols-[5rem_repeat(4,minmax(0,1fr))] gap-4 px-1 lg:grid">
        <span />
        {SLOT_LABELS.map((l, i) => (
          <span key={i} className="text-xs font-medium text-gray-500 dark:text-gray-400">{l}</span>
        ))}
      </div>

      {parties.map((p) => {
        const style = PARTY_STYLE[p.key]
        return (
          <section key={p.key} className="grid gap-3 lg:grid-cols-[5rem_repeat(4,minmax(0,1fr))] lg:gap-4">
            <div className="flex items-center gap-2 lg:flex-col lg:items-start lg:justify-center">
              <span className={cx('size-2.5 rounded-full', style.dot)} />
              <span className={cx('text-sm font-semibold', style.text)}>{p.label} 파티</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:contents">
              {p.slots.map((c, i) => {
                const pos: SlotPos = { round, party: p.key, slot: i }
                return c ? (
                  <div key={i} className="group/slot relative grid">
                    <CharacterCard c={c} tags={tags} onClick={() => onSelect(c)} />
                    <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 transition group-hover/slot:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                      <button className={actionClass} title="수정" aria-label="수정" onClick={() => onPick(pos, c)}>
                        <PencilIcon />
                      </button>
                      <button className={cx(actionClass, 'hover:text-rose-600 dark:hover:text-rose-400')}
                        title="삭제" aria-label="삭제" onClick={() => onClear(pos)}>
                        <XIcon />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    key={i}
                    onClick={() => onPick(pos, null)}
                    className={cx(
                      'flex min-h-28 items-center justify-center gap-1 rounded-2xl border border-dashed border-gray-300 text-sm font-medium text-gray-400 transition',
                      'hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-600',
                      'dark:border-white/15 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-400/5 dark:hover:text-indigo-400',
                    )}
                  >
                    <span className="text-base leading-none">+</span> 추가
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5" aria-hidden>
      <path d="m2.695 14.762-1.262 3.155a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.886L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.419a4 4 0 0 0-.885 1.343Z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  )
}
