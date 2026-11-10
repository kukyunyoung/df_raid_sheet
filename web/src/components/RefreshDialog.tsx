import { type FormEvent, useState } from 'react'
import { getAdminPassword } from '../lib/actor'
import type { RefreshScope } from '../lib/api'
import { fmtDateTime, timeAgo } from '../lib/format'
import { Button, Field, Modal, cx, inputClass } from './ui'

/** 수동 갱신 (관리자). 전체 또는 모험단 하나 */
export function RefreshDialog({
  adventures, lastSuccess, onSubmit, onClose,
}: {
  adventures: string[]
  lastSuccess: string | null
  onSubmit: (scope: RefreshScope, password: string) => Promise<boolean>
  onClose: () => void
}) {
  const [scope, setScope] = useState<'all' | 'adventure'>('all')
  const [adventure, setAdventure] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const needPassword = !getAdminPassword()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const ok = await onSubmit(scope === 'all' ? { scope } : { scope, adventure }, password)
    setBusy(false)
    if (ok) onClose()
  }

  const option = (value: 'all' | 'adventure', label: string) => (
    <label className={cx(
      'flex flex-1 cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-sm font-medium ring-1 transition',
      scope === value
        ? 'bg-indigo-50 text-indigo-700 ring-indigo-600/30 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/30'
        : 'text-gray-600 ring-gray-200 hover:bg-gray-50 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/5',
    )}>
      <input type="radio" className="sr-only" checked={scope === value} onChange={() => setScope(value)} />
      {label}
    </label>
  )

  return (
    <Modal open onClose={onClose} title="점수 갱신">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          공식 홈페이지에서 장비점수·버프력을 다시 가져옵니다. 전체 갱신은 5분 정도 걸립니다.
          <br />
          마지막 갱신: {timeAgo(lastSuccess)} ({fmtDateTime(lastSuccess)})
        </p>
        <div className="flex gap-2">
          {option('all', '전체')}
          {option('adventure', '모험단')}
        </div>
        {scope === 'adventure' && (
          <Field label="갱신할 모험단">
            <select className={inputClass} value={adventure} required onChange={(e) => setAdventure(e.target.value)}>
              <option value="" disabled>모험단 선택</option>
              {adventures.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
        )}
        {needPassword && (
          <Field label="관리자 비밀번호">
            <input className={inputClass} type="password" value={password} required
              onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>취소</Button>
          <Button type="submit" variant="primary" disabled={busy}>갱신 시작</Button>
        </div>
      </form>
    </Modal>
  )
}
