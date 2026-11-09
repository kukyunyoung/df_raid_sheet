import { Hono } from 'hono'
import { type AppEnv, type Ctx, auditStmt, fail, isAdmin, jsonBody, requireActor, str } from './lib'

const app = new Hono<AppEnv>()

const PARTIES = ['red', 'yellow', 'green']

type RaidRow = { id: number; name: string; rounds: number }

async function findRaid(c: Ctx) {
  return c.env.DB.prepare('SELECT id, name, rounds FROM raids WHERE id = ?1')
    .bind(Number(c.req.param('id'))).first<RaidRow>()
}

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, rounds FROM raids ORDER BY sort_order, id',
  ).all<RaidRow>()
  return c.json(results)
})

// 공대표 생성 (관리자)
app.post('/', requireActor, async (c) => {
  if (!isAdmin(c)) return fail(c, 403, '관리자 비밀번호가 필요합니다')
  const name = str((await jsonBody(c)).name)
  if (!name || name.length > 30) return fail(c, 400, '공대표 이름이 올바르지 않습니다')

  const row = await c.env.DB.prepare(
    'INSERT INTO raids (name) VALUES (?1) ON CONFLICT(name) DO NOTHING RETURNING id, name, rounds',
  ).bind(name).first<RaidRow>()
  if (!row) return fail(c, 409, '이미 있는 이름입니다')

  await auditStmt(c, 'raid.create', 'raid', row.id, { raid: name }).run()
  return c.json(row, 201)
})

// 기수 추가 (관리자)
app.post('/:id{[0-9]+}/rounds', requireActor, async (c) => {
  if (!isAdmin(c)) return fail(c, 403, '관리자 비밀번호가 필요합니다')
  const raid = await findRaid(c)
  if (!raid) return fail(c, 404, '공대표를 찾을 수 없습니다')

  const rounds = raid.rounds + 1
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE raids SET rounds = ?2 WHERE id = ?1').bind(raid.id, rounds),
    auditStmt(c, 'raid.round_add', 'raid', raid.id, { raid: raid.name, round: rounds }),
  ])
  return c.json({ ...raid, rounds })
})

app.get('/:id{[0-9]+}/slots', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.round, s.party, s.slot, s.character_id
     FROM raid_slots s JOIN characters ch ON ch.id = s.character_id
     WHERE s.raid_id = ?1 AND ch.deleted_at IS NULL`,
  ).bind(Number(c.req.param('id'))).all()
  return c.json(results)
})

/** body/query의 칸 위치 검증 */
function parseSlot(raid: RaidRow, v: Record<string, unknown>) {
  const round = Number(v.round)
  const party = String(v.party ?? '')
  const slot = Number(v.slot)
  if (!Number.isInteger(round) || round < 1 || round > raid.rounds) return null
  if (!PARTIES.includes(party)) return null
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) return null
  return { round, party, slot }
}

async function currentOccupant(db: D1Database, raidId: number, p: { round: number; party: string; slot: number }) {
  return db.prepare(
    `SELECT ch.id, ch.name, a.name AS adventure FROM raid_slots s
     JOIN characters ch ON ch.id = s.character_id
     JOIN adventures a ON a.id = ch.adventure_id
     WHERE s.raid_id = ?1 AND s.round = ?2 AND s.party = ?3 AND s.slot = ?4`,
  ).bind(raidId, p.round, p.party, p.slot).first<{ id: number; name: string; adventure: string }>()
}

// 칸 채우기/바꾸기 (누구나)
app.put('/:id{[0-9]+}/slots', requireActor, async (c) => {
  const raid = await findRaid(c)
  if (!raid) return fail(c, 404, '공대표를 찾을 수 없습니다')
  const body = await jsonBody(c)
  const pos = parseSlot(raid, body)
  if (!pos) return fail(c, 400, '칸 위치가 올바르지 않습니다')

  const db = c.env.DB
  const ch = await db.prepare(
    `SELECT ch.id, ch.name, a.name AS adventure FROM characters ch
     JOIN adventures a ON a.id = ch.adventure_id
     WHERE ch.id = ?1 AND ch.deleted_at IS NULL`,
  ).bind(Number(body.character_id)).first<{ id: number; name: string; adventure: string }>()
  if (!ch) return fail(c, 404, '캐릭터를 찾을 수 없습니다')

  const prev = await currentOccupant(db, raid.id, pos)
  await db.batch([
    db.prepare(
      `INSERT INTO raid_slots (raid_id, round, party, slot, character_id) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(raid_id, round, party, slot) DO UPDATE SET
         character_id = excluded.character_id, updated_at = datetime('now')`,
    ).bind(raid.id, pos.round, pos.party, pos.slot, ch.id),
    auditStmt(c, 'slot.set', 'raid', raid.id, {
      raid: raid.name, ...pos, name: ch.name, adventure: ch.adventure,
      prev: prev ? { name: prev.name, adventure: prev.adventure } : null,
    }),
  ])
  return c.json({ ok: true })
})

// 칸 비우기 (누구나)
app.delete('/:id{[0-9]+}/slots', requireActor, async (c) => {
  const raid = await findRaid(c)
  if (!raid) return fail(c, 404, '공대표를 찾을 수 없습니다')
  const pos = parseSlot(raid, c.req.query())
  if (!pos) return fail(c, 400, '칸 위치가 올바르지 않습니다')

  const db = c.env.DB
  const prev = await currentOccupant(db, raid.id, pos)
  if (!prev) return c.json({ ok: true })
  await db.batch([
    db.prepare('DELETE FROM raid_slots WHERE raid_id = ?1 AND round = ?2 AND party = ?3 AND slot = ?4')
      .bind(raid.id, pos.round, pos.party, pos.slot),
    auditStmt(c, 'slot.clear', 'raid', raid.id, {
      raid: raid.name, ...pos, name: prev.name, adventure: prev.adventure,
    }),
  ])
  return c.json({ ok: true })
})

export default app
