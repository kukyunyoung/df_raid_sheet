import { useEffect, useRef, useState } from 'react'
import type { Raid } from '../lib/api'
import { cx } from './ui'

/** 공대표 선택 드롭다운. 맨 아래 "+ 추가"는 관리자용 */
export function RaidSelect({
  raids, value, onChange, onAdd,
}: {
  raids: Raid[]
  value: Raid | null
  onChange: (id: number) => void
  onAdd: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="-mx-1.5 flex items-center gap-1 rounded-md px-1.5 text-lg font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-400/10"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {value?.name ?? '공대표 선택'}
        <svg viewBox="0 0 20 20" fill="currentColor" className={cx('size-5 transition', open && 'rotate-180')} aria-hidden>
          <path fillRule="evenodd" clipRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-40 mt-2 w-56 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10">
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {raids.map((r) => (
              <li key={r.id}>
                <button
                  role="option"
                  aria-selected={r.id === value?.id}
                  onClick={() => {
                    onChange(r.id)
                    setOpen(false)
                  }}
                  className={cx(
                    'flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5',
                    r.id === value?.id && 'font-semibold text-indigo-600 dark:text-indigo-400',
                  )}
                >
                  {r.name}
                  <span className="text-xs text-gray-400 tabular-nums">{r.rounds}기</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              setOpen(false)
              onAdd()
            }}
            className="flex w-full items-center gap-1.5 border-t border-gray-100 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-white/5 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <span className="text-base leading-none">+</span> 추가
          </button>
        </div>
      )}
    </div>
  )
}
