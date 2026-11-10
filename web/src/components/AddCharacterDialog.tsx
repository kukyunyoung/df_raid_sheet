import { type FormEvent, useState } from 'react'
import { ApiError, type Meta, api } from '../lib/api'
import { Button, Field, Modal, inputClass } from './ui'

type Props = {
  open: boolean
  meta: Meta
  adventures: string[]
  onClose: () => void
  run: (fn: () => Promise<unknown>) => Promise<boolean>
}

type Row = { key: number; server: string; name: string }

let nextKey = 1
const newRow = (server = 'bakal'): Row => ({ key: nextKey++, server, name: '' })

/** 캐릭터 등록. 모험단 하나에 서버+닉네임 행을 여러 개 넣어 일괄 등록 (닉네임 빈 행은 무시) */
export function AddCharacterDialog({ open, meta, adventures, onClose, run }: Props) {
  const [adventure, setAdventure] = useState('')
  const [rows, setRows] = useState<Row[]>(() => [newRow()])
  const [busy, setBusy] = useState(false)

  const filled = rows.filter((r) => r.name.trim())

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  // + 누른 행 바로 아래에 같은 서버로 새 행 추가
  const addAfter = (key: number) =>
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key)
      return [...rs.slice(0, i + 1), newRow(rs[i].server), ...rs.slice(i + 1)]
    })

  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (filled.length === 0) return
    setBusy(true)
    const failed: { row: Row; reason: string }[] = []
    await run(async () => {
      for (const row of filled) {
        try {
          await api.addCharacter({ server: row.server, name: row.name.trim(), adventure: adventure.trim() })
        } catch (err) {
          failed.push({ row, reason: err instanceof ApiError ? err.message : '실패' })
        }
      }
      if (failed.length > 0) {
        const ok = filled.length - failed.length
        const lines = failed.map((f) => `${f.row.name.trim()}: ${f.reason}`)
        throw new ApiError(0, `${ok}명 등록, ${failed.length}명 실패\n${lines.join('\n')}`)
      }
    })
    setBusy(false)

    if (failed.length === 0) {
      // 같은 모험단을 이어서 등록하기 쉽게 모험단은 유지
      setRows([newRow(rows[0].server)])
      onClose()
    } else {
      // 실패한 행만 남겨서 고쳐 다시 등록할 수 있게
      setRows(failed.map((f) => f.row))
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

        <div>
          <div className="mb-1.5 grid grid-cols-[7rem_1fr_4.25rem] gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <span>서버</span>
            <span>닉네임</span>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[7rem_1fr_4.25rem] items-center gap-2">
                <select className={inputClass} value={r.server} aria-label={`${i + 1}번째 서버`}
                  onChange={(e) => update(r.key, { server: e.target.value })}>
                  {meta.servers.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
                <input className={inputClass} value={r.name} maxLength={20} aria-label={`${i + 1}번째 닉네임`}
                  autoFocus={i > 0 && i === rows.length - 1}
                  onChange={(e) => update(r.key, { name: e.target.value })} placeholder="캐릭터 닉네임" />
                <div className="flex gap-1">
                  <button type="button" onClick={() => addAfter(r.key)} aria-label="행 추가" title="행 추가"
                    className="flex size-8 items-center justify-center rounded-lg text-lg leading-none text-gray-500 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-white">
                    +
                  </button>
                  {rows.length > 1 && (
                    <button type="button" onClick={() => remove(r.key)} aria-label="행 삭제" title="행 삭제"
                      className="flex size-8 items-center justify-center rounded-lg text-lg leading-none text-gray-400 hover:bg-gray-50 hover:text-rose-600 dark:hover:bg-white/5 dark:hover:text-rose-400">
                      −
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          닉네임이 빈 행은 건너뜁니다. 점수는 다음 갱신 때 채워집니다.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>취소</Button>
          <Button type="submit" variant="primary" disabled={busy || filled.length === 0}>
            {filled.length > 1 ? `${filled.length}명 등록` : '등록'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
