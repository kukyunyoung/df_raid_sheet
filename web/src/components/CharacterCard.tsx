import type { Character, Tag } from '../lib/api'
import { STATUS_TEXT, fmtNum } from '../lib/format'
import { cx } from './ui'

export function CharacterCard({
  c, tags, onClick,
}: {
  c: Character
  tags: Tag[]
  onClick: () => void
}) {
  const emojis = tags.filter((t) => t.emoji && c.tags.includes(t.key)).map((t) => t.emoji)
  const isBuff = c.score_type === 'buff'

  return (
    <button
      onClick={onClick}
      className={cx(
        'group flex min-w-0 flex-col rounded-2xl bg-white p-4 text-left sm:p-5 shadow-sm ring-1 ring-black/5 transition',
        'hover:-translate-y-0.5 hover:shadow-md hover:ring-indigo-600/20',
        'dark:bg-gray-900 dark:ring-white/10 dark:hover:ring-indigo-400/30',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-base font-semibold text-indigo-600 dark:text-indigo-400">
          {c.adventure}
        </p>
        {c.status !== 'ok' && (
          <span
            className={cx(
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1',
              c.status === 'pending'
                ? 'text-gray-500 ring-gray-200 dark:text-gray-400 dark:ring-white/10'
                : 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/20',
            )}
          >
            {STATUS_TEXT[c.status]}
          </span>
        )}
      </div>

      <p className="mt-1 truncate text-lg font-semibold tracking-tight sm:text-xl">
        {c.name}
        {emojis.length > 0 && <span className="ml-1.5">{emojis.join('')}</span>}
      </p>

      <p
        className={cx(
          'mt-3 text-lg font-semibold tracking-tight tabular-nums sm:text-xl',
          isBuff ? 'text-teal-600 dark:text-teal-400' : 'text-indigo-600 dark:text-indigo-400',
        )}
      >
        {fmtNum(c.score)}
      </p>
    </button>
  )
}
