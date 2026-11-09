import { Hono } from 'hono'
import { type AppEnv, auditStmt, fail, isAdmin, jsonBody, requireActor, str, toServerCode } from './lib'

const app = new Hono<AppEnv>()

type CharacterRow = {
  id: number
  adventure_id: number
  adventure: string
  server: string
  name: string
  locked: number
}

async function findActive(db: D1Database, id: number) {
  return db.prepare(
    `SELECT c.id, c.adventure_id, a.name AS adventure, c.server, c.name,
            COALESCE(ca.locked, 0) AS locked
     FROM characters c
     JOIN adventures a ON a.id = c.adventure_id
     LEFT JOIN character_admin ca ON ca.character_id = c.id
     WHERE c.id = ?1 AND c.deleted_at IS NULL`,
  ).bind(id).first<CharacterRow>()
}

// 목록 (숨김 제외). 필터/정렬은 프론트에서 처리
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, a.name AS adventure, c.server, c.name, c.job, c.level, c.fame,
            c.is_buffer, c.equip_point, c.buff_point, c.score, c.score_type,
            c.status, c.last_crawled_at,
            (SELECT json_group_array(t.key) FROM character_tags ct
               JOIN tags t ON t.id = ct.tag_id
              WHERE ct.character_id = c.id) AS tags
     FROM characters c
     JOIN adventures a ON a.id = c.adventure_id
     LEFT JOIN character_admin ca ON ca.character_id = c.id
     WHERE c.deleted_at IS NULL AND COALESCE(ca.hidden, 0) = 0
     ORDER BY a.name, c.score DESC`,
  ).all<Record<string, unknown> & { tags: string; is_buffer: number | null }>()

  return c.json(results.map((r) => ({
    ...r,
    is_buffer: r.is_buffer === null ? null : !!r.is_buffer,
    tags: JSON.parse(r.tags) as string[],
  })))
})

// 등록 (누구나). 삭제됐던 캐릭이면 복구
app.post('/', requireActor, async (c) => {
  const body = await jsonBody(c)
  const server = toServerCode(str(body.server))
  const name = str(body.name)
  const adventure = str(body.adventure)
  if (!server) return fail(c, 400, '서버가 올바르지 않습니다')
  if (!name || name.length > 20) return fail(c, 400, '닉네임이 올바르지 않습니다')
  if (!adventure || adventure.length > 20) return fail(c, 400, '모험단명이 올바르지 않습니다')

  const db = c.env.DB
  const active = await db.prepare(
    'SELECT id FROM characters WHERE server = ?1 AND name = ?2 AND deleted_at IS NULL',
  ).bind(server, name).first()
  if (active) return fail(c, 409, '이미 등록된 캐릭터입니다')

  const adv = await db.prepare(
    `INSERT INTO adventures (name) VALUES (?1)
     ON CONFLICT(name) DO UPDATE SET name = excluded.name
     RETURNING id`,
  ).bind(adventure).first<{ id: number }>()

  const deleted = await db.prepare(
    `SELECT id FROM characters WHERE server = ?1 AND name = ?2 AND deleted_at IS NOT NULL
     ORDER BY deleted_at DESC LIMIT 1`,
  ).bind(server, name).first<{ id: number }>()

  let id: number
  if (deleted) {
    await db.prepare('UPDATE characters SET deleted_at = NULL, adventure_id = ?1 WHERE id = ?2')
      .bind(adv!.id, deleted.id).run()
    id = deleted.id
  } else {
    const row = await db.prepare(
      'INSERT INTO characters (adventure_id, server, name) VALUES (?1, ?2, ?3) RETURNING id',
    ).bind(adv!.id, server, name).first<{ id: number }>()
    id = row!.id
  }

  await auditStmt(c, 'character.create', 'character', id,
    { server, name, adventure, restored: !!deleted }).run()
  return c.json({ id, restored: !!deleted }, 201)
})

// 삭제 (누구나, soft delete). 태그는 해제
app.delete('/:id{[0-9]+}', requireActor, async (c) => {
  const id = Number(c.req.param('id'))
  const ch = await findActive(c.env.DB, id)
  if (!ch) return fail(c, 404, '캐릭터를 찾을 수 없습니다')
  if (ch.locked && !isAdmin(c)) return fail(c, 403, '관리자가 잠근 캐릭터입니다')

  const { results: tags } = await c.env.DB.prepare(
    `SELECT t.key FROM character_tags ct JOIN tags t ON t.id = ct.tag_id
     WHERE ct.character_id = ?1`,
  ).bind(id).all<{ key: string }>()

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE characters SET deleted_at = datetime('now') WHERE id = ?1`).bind(id),
    c.env.DB.prepare('DELETE FROM character_tags WHERE character_id = ?1').bind(id),
    auditStmt(c, 'character.delete', 'character', id, {
      server: ch.server, name: ch.name, adventure: ch.adventure, tags: tags.map((t) => t.key),
    }),
  ])
  return c.json({ ok: true })
})

type TagRow = { id: number; key: string; admin_only: number }

async function loadTagTarget(c: Parameters<typeof fail>[0]) {
  const id = Number(c.req.param('id'))
  const key = c.req.param('key')!
  const tag = await c.env.DB.prepare('SELECT id, key, admin_only FROM tags WHERE key = ?1')
    .bind(key).first<TagRow>()
  if (!tag) return { error: fail(c, 404, '없는 태그입니다') }
  if (tag.admin_only && !isAdmin(c)) return { error: fail(c, 403, '관리자만 변경할 수 있습니다') }

  const ch = await findActive(c.env.DB, id)
  if (!ch) return { error: fail(c, 404, '캐릭터를 찾을 수 없습니다') }
  if (ch.locked && !isAdmin(c)) return { error: fail(c, 403, '관리자가 잠근 캐릭터입니다') }
  return { tag, ch }
}

// 태그 체크 (업둥 등). 모험단당 제한은 insert 한 문장 안에서 검사
app.put('/:id{[0-9]+}/tags/:key', requireActor, async (c) => {
  const t = await loadTagTarget(c)
  if ('error' in t) return t.error
  const { tag, ch } = t
  const db = c.env.DB

  const limitSql = `COALESCE(
      (SELECT max_count FROM adventure_tag_limits WHERE adventure_id = ?3 AND tag_id = ?2),
      (SELECT max_per_adventure FROM tags WHERE id = ?2))`
  const countSql = `(SELECT COUNT(*) FROM character_tags ct
      JOIN characters c2 ON c2.id = ct.character_id
     WHERE ct.tag_id = ?2 AND c2.adventure_id = ?3 AND c2.deleted_at IS NULL)`

  const res = await db.prepare(
    `INSERT INTO character_tags (character_id, tag_id)
     SELECT ?1, ?2 WHERE ${countSql} < ${limitSql}
     ON CONFLICT DO NOTHING`,
  ).bind(ch.id, tag.id, ch.adventure_id).run()

  if (res.meta.changes === 0) {
    const exists = await db.prepare(
      'SELECT 1 FROM character_tags WHERE character_id = ?1 AND tag_id = ?2',
    ).bind(ch.id, tag.id).first()
    if (exists) return c.json({ ok: true })
    const lim = await db.prepare(`SELECT ${limitSql} AS max`)
      .bind(null, tag.id, ch.adventure_id).first<{ max: number }>()
    return fail(c, 409, `이 모험단은 최대 ${lim?.max ?? 0}개까지 체크할 수 있습니다`)
  }

  await auditStmt(c, 'tag.set', 'character', ch.id,
    { tag: tag.key, server: ch.server, name: ch.name, adventure: ch.adventure }).run()
  return c.json({ ok: true })
})

// 태그 해제
app.delete('/:id{[0-9]+}/tags/:key', requireActor, async (c) => {
  const t = await loadTagTarget(c)
  if ('error' in t) return t.error
  const { tag, ch } = t

  const res = await c.env.DB.prepare(
    'DELETE FROM character_tags WHERE character_id = ?1 AND tag_id = ?2',
  ).bind(ch.id, tag.id).run()
  if (res.meta.changes > 0) {
    await auditStmt(c, 'tag.unset', 'character', ch.id,
      { tag: tag.key, server: ch.server, name: ch.name, adventure: ch.adventure }).run()
  }
  return c.json({ ok: true })
})

export default app
