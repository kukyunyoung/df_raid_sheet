import type { LogEntry, Tag } from '../lib/api'
import { describeLog, timeAgo } from '../lib/format'

export function ActivityFeed({ logs, tags }: { logs: LogEntry[]; tags: Tag[] }) {
  if (logs.length === 0) {
    return <p className="py-6 text-sm text-gray-500 dark:text-gray-400">아직 작업 기록이 없습니다.</p>
  }
  return (
    <ul className="divide-y divide-gray-100 dark:divide-white/5">
      {logs.map((l) => (
        <li key={l.id} className="py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold">{l.actor_name}</p>
            <time className="shrink-0 text-xs text-gray-400">{timeAgo(l.created_at)}</time>
          </div>
          <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-gray-400">
            {describeLog(l, tags)}
          </p>
        </li>
      ))}
    </ul>
  )
}
