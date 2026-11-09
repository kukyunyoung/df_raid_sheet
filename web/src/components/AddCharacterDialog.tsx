import { type FormEvent, useState } from 'react'
import { type Meta, api } from '../lib/api'
import { Button, Field, Modal, inputClass } from './ui'

type Props = {
  open: boolean
  meta: Meta
  adventures: string[]
  onClose: () => void
  run: (fn: () => Promise<unknown>) => Promise<boolean>
}

export function AddCharacterDialog({ open, meta, adventures, onClose, run }: Props) {
  const [server, setServer] = useState('bakal')
  const [name, setName] = useState('')
  const [adventure, setAdventure] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const ok = await run(() => api.addCharacter({ server, name: name.trim(), adventure: adventure.trim() }))
    setBusy(false)
    if (ok) {
      // 같은 모험단 캐릭을 이어서 등록하기 쉽게 모험단/서버는 유지
      setName('')
      onClose()
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="캐릭터 등록">
      <form onSubmit={submit} className="space-y-4">
        <Field label="모험단">
          <input className={inputClass} list="adventure-list" value={adventure} required maxLength={20}
            onChange={(e) => setAdventure(e.target.value)} placeholder="모험단명" />
          <datalist id="adventure-list">
            {adventures.map((a) => <option key={a} value={a} />)}
          </datalist>
        </Field>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="서버">
            <select className={inputClass} value={server} onChange={(e) => setServer(e.target.value)}>
              {meta.servers.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="닉네임">
            <input className={inputClass} value={name} required maxLength={20}
              onChange={(e) => setName(e.target.value)} placeholder="캐릭터 닉네임" />
          </Field>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          점수는 다음 갱신 때 채워집니다.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>취소</Button>
          <Button type="submit" variant="primary" disabled={busy}>등록</Button>
        </div>
      </form>
    </Modal>
  )
}
