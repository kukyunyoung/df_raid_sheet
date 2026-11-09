import { type FormEvent, useState } from 'react'
import { getActorName } from '../lib/actor'
import { Button, Field, Modal, inputClass } from './ui'

/** 첫 방문 시 이름 입력. 등록/삭제/체크 기록에 이 이름이 남음 */
export function NameDialog({
  open, onSave, onClose,
}: {
  open: boolean
  onSave: (name: string) => void
  onClose: () => void
}) {
  // App에서 열릴 때마다 새로 마운트되므로 현재 이름으로 초기화됨
  const [name, setName] = useState(getActorName)
  const hasName = !!getActorName()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onSave(name.trim())
  }

  return (
    <Modal open={open} onClose={onClose} title="이름을 알려주세요" dismissable={hasName}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          캐릭터 등록·삭제·체크 기록에 이 이름이 함께 남습니다. 로그인은 필요 없지만,
          한 번 정한 이름은 바꿀 수 없습니다.
        </p>
        <Field label="이름">
          <input className={inputClass} value={name} maxLength={20} autoFocus required
            onChange={(e) => setName(e.target.value)} placeholder="예) 구구녕" />
        </Field>
        <div className="flex justify-end gap-2">
          {hasName && <Button type="button" onClick={onClose}>취소</Button>}
          <Button type="submit" variant="primary">저장</Button>
        </div>
      </form>
    </Modal>
  )
}
