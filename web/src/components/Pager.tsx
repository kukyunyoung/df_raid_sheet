import { type KeyboardEvent, useRef, useState } from 'react'
import { cx } from './ui'

const arrowClass =
  'flex size-8 items-center justify-center rounded-lg text-gray-500 ring-1 ring-gray-200 transition ' +
  'hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 ' +
  'disabled:hover:bg-transparent dark:text-gray-400 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-white'

/** [<] [1/4] [>] — 가운데를 누르면 현재 번호만 선택되고, 숫자 입력 후 Enter로 이동 */
export function Pager({
  page, total, onChange,
}: {
  page: number
  total: number
  onChange: (page: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<string | null>(null)
  // 클릭으로 포커스될 때 mouseup이 선택을 풀지 않도록
  const keepSelection = useRef(false)

  const go = (p: number) => onChange(Math.min(total, Math.max(1, p)))

  const selectPage = () => {
    inputRef.current?.setSelectionRange(0, String(page).length)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const n = parseInt(draft ?? '', 10)
      if (!Number.isNaN(n)) go(n)
      inputRef.current?.blur()
    } else if (e.key === 'Escape') {
      inputRef.current?.blur()
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button className={arrowClass} disabled={page <= 1} onClick={() => go(page - 1)} aria-label="이전 기수">
        <Chevron dir="left" />
      </button>
      <input
        ref={inputRef}
        inputMode="numeric"
        aria-label="기수 이동"
        className={cx(
          'h-8 w-16 rounded-lg bg-white text-center text-sm font-medium tabular-nums ring-1 ring-gray-200',
          'focus:outline-2 focus:outline-indigo-600 dark:bg-white/5 dark:ring-white/10',
        )}
        value={draft ?? `${page}/${total}`}
        onChange={(e) => setDraft(e.target.value)}
        onMouseDown={() => {
          keepSelection.current = document.activeElement !== inputRef.current
        }}
        onFocus={() => {
          setDraft(`${page}/${total}`)
          requestAnimationFrame(selectPage)
        }}
        onMouseUp={(e) => {
          if (keepSelection.current) {
            e.preventDefault()
            keepSelection.current = false
            selectPage()
          }
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={onKeyDown}
      />
      <button className={arrowClass} disabled={page >= total} onClick={() => go(page + 1)} aria-label="다음 기수">
        <Chevron dir="right" />
      </button>
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={dir === 'left'
          ? 'M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z'
          : 'M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z'}
      />
    </svg>
  )
}
