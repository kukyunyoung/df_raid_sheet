import { type ReactNode, useState } from 'react'
import { type ActorInfo, api } from '../lib/api'
import { fmtDateTime, timeAgo } from '../lib/format'
import { Button, Modal, inputClass } from './ui'

/** 관리자: 작업자 승인/차단/이름 수정/삭제 */
export function AdminPanel({
  actors, onClose, run,
}: {
  actors: ActorInfo[]
  onClose: () => void
  run: (fn: () => Promise<unknown>) => Promise<boolean>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const pending = actors.filter((a) => !a.approved && !a.blocked)
  const others = actors.filter((a) => a.approved || a.blocked)

  const startEdit = (a: ActorInfo) => {
    setEditing(a.device_id)
    setDraft(a.name)
  }
  const saveEdit = async (a: ActorInfo) => {
    const name = draft.trim()
    if (!name || name === a.name) return setEditing(null)
    if (await run(() => api.renameActor(a.device_id, name))) setEditing(null)
  }
  const remove = (a: ActorInfo) => {
    if (confirm(`${a.name} 작업자를 삭제할까요?\n그 기기는 이름 입력과 승인부터 다시 해야 합니다.`))
      run(() => api.deleteActor(a.device_id))
  }

  const small = 'px-3 py-1.5'

  const row = (a: ActorInfo, actions: ReactNode) => (
    <li key={a.device_id} className="flex items-center justify-between gap-3 py-3">
      {editing === a.device_id ? (
        <form
          className="flex min-w-0 flex-1 gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            saveEdit(a)
          }}
        >
          <input
            autoFocus
            maxLength={20}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(null))}
            className={`${inputClass} min-w-0 flex-1 py-1.5`}
          />
          <Button type="submit" variant="primary" className={small}>저장</Button>
          <Button type="button" className={small} onClick={() => setEditing(null)}>취소</Button>
        </form>
      ) : (
        <>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {a.name}
              {a.blocked ? <span className="ml-2 text-xs font-medium text-rose-600 dark:text-rose-400">차단됨</span> : null}
              {a.same_name > 0 && (
                <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                  같은 이름 {a.same_name}명 더 있음
                </span>
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {fmtDateTime(a.first_seen)} 등록
              {a.last_seen ? ` · ${timeAgo(a.last_seen)} 활동` : ''}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {actions}
            <Button className={small} onClick={() => startEdit(a)}>수정</Button>
            <Button variant="danger" className={small} onClick={() => remove(a)}>삭제</Button>
          </div>
        </>
      )}
    </li>
  )

  return (
    <Modal open onClose={onClose} title="작업자 관리">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">승인 대기 {pending.length}</h3>
      {pending.length === 0 ? (
        <p className="py-4 text-sm text-gray-500 dark:text-gray-400">대기 중인 요청이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-white/5">
          {pending.map((a) =>
            row(a, (
              <>
                <Button variant="primary" className={small}
                  onClick={() => run(() => api.approveActor(a.device_id))}>승인</Button>
                <Button className={small}
                  onClick={() => run(() => api.blockActor(a.device_id, true))}>거절</Button>
              </>
            )),
          )}
        </ul>
      )}

      <h3 className="mt-6 text-sm font-semibold text-gray-500 dark:text-gray-400">승인됨 · 차단됨</h3>
      <ul className="divide-y divide-gray-100 dark:divide-white/5">
        {others.map((a) =>
          row(a, a.blocked ? (
            <Button className={small} onClick={() => run(() => api.blockActor(a.device_id, false))}>
              차단 해제
            </Button>
          ) : (
            <Button className={small}
              onClick={() => run(() => api.blockActor(a.device_id, true))}>차단</Button>
          )),
        )}
      </ul>

      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  )
}
