import { type FormEvent, useState } from 'react'
import { getAdminPassword } from '../lib/actor'
import { Button, Field, Modal, inputClass } from './ui'

/**
 * 관리자 작업 확인창. withName이면 이름 입력칸(공대표 추가)도 표시.
 * 관리자 비밀번호는 저장돼 있지 않을 때만 물어봄
 */
export function AdminDialog({
  title, withName, submitLabel, onSubmit, onClose,
}: {
  title: string
  withName?: boolean
  submitLabel: string
  onSubmit: (v: { name: string; password: string }) => Promise<boolean>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const needPassword = !getAdminPassword()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const ok = await onSubmit({ name: name.trim(), password })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        {withName && (
          <Field label="공대표 이름">
            <input className={inputClass} value={name} required maxLength={30} autoFocus
              onChange={(e) => setName(e.target.value)} placeholder="예) 미카엘라 노말" />
          </Field>
        )}
        {needPassword && (
          <Field label="관리자 비밀번호">
            <input className={inputClass} type="password" value={password} required autoFocus={!withName}
              onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        {!withName && !needPassword && (
          <p className="text-sm text-gray-600 dark:text-gray-400">계속하시겠습니까?</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>취소</Button>
          <Button type="submit" variant="primary" disabled={busy}>{submitLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}
