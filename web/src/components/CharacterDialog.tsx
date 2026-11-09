import { useState } from 'react'
import { type Character, type Meta, api } from '../lib/api'
import { STATUS_TEXT, fmtDateTime, fmtNum } from '../lib/format'
import { Button, Modal, cx } from './ui'

type Props = {
  character: Character | null
  all: Character[]
  meta: Meta
  onClose: () => void
  /** 쓰기 작업 래퍼 (이름 확인, 에러 표시, 목록 새로고침) */
  run: (fn: () => Promise<unknown>) => Promise<boolean>
}

export function CharacterDialog({ character: c, all, meta, onClose, run }: Props) {
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  if (!c) return null

  const serverLabel = meta.servers.find((s) => s.code === c.server)?.label ?? c.server
  const tags = meta.tags.filter((t) => !t.admin_only)

  const limitOf = (key: string) =>
    meta.tag_limits.find((l) => l.adventure === c.adventure && l.tag === key)?.max_count ??
    meta.tags.find((t) => t.key === key)?.max_per_adventure ?? 0
  const usedOf = (key: string) =>
    all.filter((x) => x.adventure === c.adventure && x.tags.includes(key)).length

  const act = async (fn: () => Promise<unknown>, closeAfter = false) => {
    setBusy(true)
    const ok = await run(fn)
    setBusy(false)
    if (ok && closeAfter) close()
  }
  const close = () => {
    setConfirmDelete(false)
    onClose()
  }

  const rows: [string, string][] = [
    ['서버', serverLabel],
    ['직업', c.job ?? '—'],
    ['레벨', fmtNum(c.level)],
    ['명성', fmtNum(c.fame)],
    ['장비점수', fmtNum(c.equip_point)],
    ['버프력', fmtNum(c.buff_point)],
    ['상태', STATUS_TEXT[c.status]],
    ['마지막 갱신', fmtDateTime(c.last_crawled_at)],
  ]

  return (
    <Modal open onClose={close} title={c.name}>
      <p className="-mt-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400">{c.adventure}</p>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-gray-200 ring-1 ring-gray-200 dark:bg-white/10 dark:ring-white/10">
        {rows.map(([k, v]) => (
          <div key={k} className="bg-white px-4 py-3 dark:bg-gray-900">
            <dt className="text-xs text-gray-500 dark:text-gray-400">{k}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {c.status === 'not_found' && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          공식 홈페이지에서 검색되지 않습니다. 닉네임이 바뀌었는지 확인해 주세요.
        </p>
      )}

      {tags.length > 0 && (
        <div className="mt-5 space-y-2">
          {tags.map((t) => {
            const checked = c.tags.includes(t.key)
            const limit = limitOf(t.key)
            const used = usedOf(t.key)
            const full = !checked && used >= limit
            return (
              <label
                key={t.key}
                className={cx(
                  'flex items-center justify-between rounded-xl px-4 py-3 ring-1 ring-gray-200 dark:ring-white/10',
                  full ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5',
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-indigo-600"
                    checked={checked}
                    disabled={busy || full}
                    onChange={(e) => act(() => api.setTag(c.id, t.key, e.target.checked))}
                  />
                  <span className="text-sm font-medium">
                    {t.label} {t.emoji}
                  </span>
                </span>
                <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
                  모험단 {used}/{limit}
                </span>
              </label>
            )
          })}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-2">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <Button variant="danger" disabled={busy}
              onClick={() => act(() => api.deleteCharacter(c.id), true)}>
              삭제 확인
            </Button>
            <Button onClick={() => setConfirmDelete(false)}>취소</Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>삭제</Button>
        )}
        <Button onClick={close}>닫기</Button>
      </div>
    </Modal>
  )
}
