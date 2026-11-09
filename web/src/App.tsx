import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityFeed } from "./components/ActivityFeed";
import { AddCharacterDialog } from "./components/AddCharacterDialog";
import { AdminDialog } from "./components/AdminDialog";
import { CharacterCard } from "./components/CharacterCard";
import { CharacterDialog } from "./components/CharacterDialog";
import { NameDialog } from "./components/NameDialog";
import { RaidBoard } from "./components/RaidBoard";
import { RaidSelect } from "./components/RaidSelect";
import { Pager } from "./components/Pager";
import { SlotPicker } from "./components/SlotPicker";
import {
  PARTY_STYLE,
  buildRounds,
  findDuplicates,
  partyPower,
} from "./lib/raid";
import { Button, Card, Eyebrow, Modal, cx, inputClass } from "./components/ui";
import { AdminPanel } from "./components/AdminPanel";
import {
  getActorName,
  getAdminPassword,
  setActorName,
  setAdminPassword,
} from "./lib/actor";
import {
  type ActorInfo,
  type Me,
  type Character,
  type LogEntry,
  type Meta,
  type Raid,
  type RaidSlot,
  type SlotPos,
  ApiError,
  api,
} from "./lib/api";
import { fmtDateTime, timeAgo } from "./lib/format";

type ScoreFilter = "all" | "equip" | "buff";
type SortKey = "score" | "fame" | "name";
type View = "raid" | "list";
type Toast = { id: number; text: string; tone: "success" | "error" };

const RAID_KEY = "dfl.raidId";
function savedRaidId(): number | null {
  try {
    return Number(localStorage.getItem(RAID_KEY)) || null;
  } catch {
    return null;
  }
}

const SORTS: Record<SortKey, (a: Character, b: Character) => number> = {
  score: (a, b) => (b.score ?? -1) - (a.score ?? -1),
  fame: (a, b) => (b.fame ?? -1) - (a.fame ?? -1),
  name: (a, b) => a.name.localeCompare(b.name, "ko"),
};

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [chars, setChars] = useState<Character[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const showToast = (text: string, tone: Toast["tone"] = "error") =>
    setToast({ id: Date.now(), text, tone });
  const [view, setView] = useState<View>("raid");
  const [round, setRound] = useState(1);
  const [raids, setRaids] = useState<Raid[]>([]);
  const [raidId, setRaidId] = useState<number | null>(savedRaidId);
  const [slots, setSlots] = useState<RaidSlot[]>([]);
  const [picker, setPicker] = useState<{
    pos: SlotPos;
    current: Character | null;
  } | null>(null);
  const [adminAction, setAdminAction] = useState<
    "create" | "round" | "login" | null
  >(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [actorList, setActorList] = useState<ActorInfo[]>([]);

  const pendingCount = actorList.filter((a) => !a.approved && !a.blocked).length;
  const [me, setMe] = useState<Me | null>(null);
  const [actor, setActor] = useState(getActorName());
  const [nameOpen, setNameOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [adventure, setAdventure] = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [sort, setSort] = useState<SortKey>("score");

  const reload = useCallback(async () => {
    try {
      const [m, c, l, r, my] = await Promise.all([
        api.meta(),
        api.characters(),
        api.logs(5),
        api.raids(),
        api.me(),
      ]);
      setMeta(m);
      setChars(c);
      setLogs(l);
      setRaids(r);
      setMe(my);
      // 이름은 서버에 등록된 값이 기준 (없으면 이름 입력)
      if (my.registered && my.name) {
        setActorName(my.name);
        setActor(my.name);
      } else {
        setNameOpen(true);
      }
      if (getAdminPassword())
        api.actors().then(setActorList).catch(() => setActorList([]));
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "불러오지 못했습니다");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 선택된 공대표 (저장된 게 없거나 사라졌으면 첫 번째)
  const raid = raids.find((r) => r.id === raidId) ?? raids[0] ?? null;
  const roundNow = Math.min(round, raid?.rounds ?? 1);
  const raidIdRef = useRef<number | null>(null);

  const loadSlots = useCallback(async () => {
    const id = raidIdRef.current;
    if (id === null) return setSlots([]);
    try {
      setSlots(await api.raidSlots(id));
    } catch {
      // 연결 오류는 reload 쪽에서 표시
    }
  }, []);

  useEffect(() => {
    raidIdRef.current = raid?.id ?? null;
    loadSlots();
  }, [raid?.id, loadSlots]);

  const selectRaid = (id: number) => {
    setRaidId(id);
    setRound(1);
    try {
      localStorage.setItem(RAID_KEY, String(id));
    } catch {
      // 저장 불가여도 선택은 유지
    }
  };

  const table = useMemo(
    () => (raid ? buildRounds(raid.rounds, slots, chars) : []),
    [raid, slots, chars],
  );
  const parties = table[roundNow - 1] ?? [];

  useEffect(() => {
    if (logsOpen)
      api
        .logs(100)
        .then(setAllLogs)
        .catch(() => setAllLogs([]));
  }, [logsOpen]);

  /** 쓰기 작업 공통: 이름 확인 → 실행 → 새로고침. 성공 여부 반환 */
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      if (!getActorName()) {
        setNameOpen(true);
        return false;
      }
      try {
        await fn();
        await Promise.all([reload(), loadSlots()]);
        return true;
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : "요청에 실패했습니다");
        await Promise.all([reload(), loadSlots()]);
        return false;
      }
    },
    [reload, loadSlots],
  );

  /** 관리자 작업 (로그인 / 공대표 생성 / 기수 추가) */
  const submitAdmin = async ({
    name,
    password,
  }: {
    name: string;
    password: string;
  }) => {
    if (!getActorName()) {
      setNameOpen(true);
      return false;
    }
    if (password) setAdminPassword(password);
    try {
      if (adminAction === "login") {
        setActorList(await api.actors());
        setAdminOpen(true);
        return true;
      } else if (adminAction === "create") {
        const r = await api.createRaid(name);
        selectRaid(r.id);
        showToast(`${r.name} 공대표를 만들었습니다`, "success");
      } else if (raid) {
        const r = await api.addRound(raid.id);
        setRound(r.rounds);
        showToast(`${r.rounds}기를 추가했습니다`, "success");
      }
      await reload();
      return true;
    } catch (e) {
      // 새로 입력한 비밀번호는 확인에 성공했을 때만 기억
      if (password || (e instanceof ApiError && e.status === 403))
        setAdminPassword("");
      if (e instanceof ApiError && e.status === 403) {
        showToast("관리자 비밀번호가 맞지 않습니다");
      } else {
        showToast(e instanceof ApiError ? e.message : "요청에 실패했습니다");
      }
      return false;
    }
  };

  /** 모든 기수를 돌며 한 공대에 같은 모험단 캐릭이 2명 이상인지 확인 */
  const checkDuplicates = () => {
    const issues = findDuplicates(table);
    if (issues.length === 0) {
      showToast(`중복 없음 (${table.length}개 기수 확인)`, "success");
      return;
    }
    const lines = issues
      .slice(0, 5)
      .map((i) => `${i.round}기 ${i.adventure}: ${i.names.join(", ")}`);
    if (issues.length > 5) lines.push(`외 ${issues.length - 5}건`);
    showToast(`모험단 중복 ${issues.length}건\n${lines.join("\n")}`);
  };

  const adventures = useMemo(
    () =>
      [...new Set(chars.map((c) => c.adventure))].sort((a, b) =>
        a.localeCompare(b, "ko"),
      ),
    [chars],
  );

  const visible = useMemo(() => {
    const q = query.trim();
    return chars
      .filter((c) => !adventure || c.adventure === adventure)
      .filter((c) => scoreFilter === "all" || c.score_type === scoreFilter)
      .filter((c) => !q || c.name.includes(q) || c.adventure.includes(q))
      .sort(SORTS[sort]);
  }, [chars, adventure, scoreFilter, query, sort]);

  const dealers = chars.filter((c) => c.score_type === "equip").length;
  const buffers = chars.filter((c) => c.score_type === "buff").length;
  const selected = chars.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>공대표</Eyebrow>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            빗자루공대
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              onClick={() => setAdminOpen(true)}
              className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 ring-1 ring-amber-600/20 hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/20"
            >
              승인 요청 {pendingCount}
            </button>
          )}
          {/* 이름은 처음 한 번만 정하고 바꿀 수 없음 */}
          {actor ? (
            <span className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-gray-600 ring-1 ring-gray-200 dark:text-gray-300 dark:ring-white/10">
              {actor}
              {me?.blocked ? (
                <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  차단됨
                </span>
              ) : (
                me &&
                !me.approved && (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    승인 대기
                  </span>
                )
              )}
            </span>
          ) : (
            <button
              onClick={() => setNameOpen(true)}
              className="rounded-full px-3 py-1.5 text-sm text-gray-600 ring-1 ring-gray-200 hover:bg-white dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/5"
            >
              이름 설정
            </button>
          )}
          <Button
            variant="primary"
            onClick={() => setAddOpen(true)}
            disabled={!meta}
          >
            캐릭터 등록
          </Button>
        </div>
      </header>

      <nav className="mt-6 flex gap-6 border-b border-gray-200 dark:border-white/10">
        {(
          [
            ["raid", "레이드 파티"],
            ["list", "캐릭터 목록"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={cx(
              "-mb-px border-b-2 pb-3 text-sm font-semibold transition",
              view === k
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {loadError && (
        <Card className="mt-6 p-4 text-sm text-red-600 dark:text-red-400">
          {loadError}{" "}
          <button className="ml-2 font-semibold underline" onClick={reload}>
            다시 시도
          </button>
        </Card>
      )}

      {view === "raid" && (
        <section className="mt-8">
          <div className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3">
            <div>
              <RaidSelect
                raids={raids}
                value={raid}
                onChange={selectRaid}
                onAdd={() => setAdminAction("create")}
              />
              {raid && (
                <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {roundNow}기
                </h2>
              )}
            </div>
            {raid && (
            <>
            <div className="flex items-center gap-1.5">
              <Pager
                page={roundNow}
                total={raid.rounds}
                onChange={setRound}
              />
              <Button
                className="h-8 px-2.5"
                onClick={() => setAdminAction("round")}
                title="기수 추가 (관리자)"
              >
                + 기수
              </Button>
            </div>
            <div className="flex items-center gap-4">
              <Button onClick={checkDuplicates}>중복체크</Button>
              {/* 파티 화력: (딜러 합/10만) × (버프력/10만) */}
              <div className="flex items-center gap-3" title="파티 화력">
                {parties.map((p) => {
                  const power = partyPower(p);
                  return (
                    <span key={p.key} className="flex items-center gap-1.5">
                      <span
                        className={cx(
                          "size-2.5 rounded-full",
                          PARTY_STYLE[p.key].dot,
                        )}
                      />
                      <span className="text-sm font-semibold tabular-nums">
                        {power === null ? "—" : power.toFixed(2)}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
            </>
            )}
          </div>
          {raid ? (
            <RaidBoard
              round={roundNow}
              parties={parties}
              tags={meta?.tags ?? []}
              onSelect={(c) => setSelectedId(c.id)}
              onPick={(pos, current) => setPicker({ pos, current })}
              onClear={(pos) => run(() => api.clearSlot(raid.id, pos))}
            />
          ) : (
            meta && (
              <Card className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
                공대표가 없습니다. 위 드롭다운의 + 추가로 만들 수 있습니다
                (관리자).
              </Card>
            )
          )}
        </section>
      )}

      {picker && raid && (
        <SlotPicker
          pos={picker.pos}
          current={picker.current}
          chars={chars}
          placedIds={
            new Set(
              parties.flatMap((p) => p.slots).flatMap((c) => (c ? [c.id] : [])),
            )
          }
          onClose={() => setPicker(null)}
          onPick={async (c) => {
            if (await run(() => api.setSlot(raid.id, picker.pos, c.id)))
              setPicker(null);
          }}
        />
      )}
      {adminAction && (
        <AdminDialog
          title={
            adminAction === "login"
              ? "관리자"
              : adminAction === "create"
                ? "공대표 추가"
                : "기수 추가"
          }
          withName={adminAction === "create"}
          submitLabel={
            adminAction === "login"
              ? "확인"
              : adminAction === "create"
                ? "추가"
                : `${(raid?.rounds ?? 0) + 1}기 추가`
          }
          onSubmit={submitAdmin}
          onClose={() => setAdminAction(null)}
        />
      )}
      {adminOpen && (
        <AdminPanel
          actors={actorList}
          onClose={() => setAdminOpen(false)}
          run={run}
        />
      )}

      {view === "list" && (
        <>
          {/* 상단 bento */}
          <section className="mt-8 grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col lg:col-span-2">
              <div className="p-6 sm:p-8">
                <Eyebrow>현황</Eyebrow>
                <h2 className="mt-2 text-xl font-medium tracking-tight">
                  모험단 스펙 한눈에 보기
                </h2>
                <p className="mt-2 max-w-xl text-sm/6 text-gray-600 dark:text-gray-400">
                  딜러는 공식 홈페이지 장비점수, 버퍼는 버프력 기준입니다.
                  6시간마다 자동으로 갱신됩니다.
                </p>
                {adventures.length > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {adventures.map((a) => {
                      const active = adventure === a;
                      return (
                        <button
                          key={a}
                          onClick={() => setAdventure(active ? "" : a)}
                          className={cx(
                            "rounded-full px-3 py-1 text-sm ring-1 transition",
                            active
                              ? "bg-indigo-600 text-white ring-indigo-600"
                              : "text-gray-700 ring-gray-200 hover:bg-gray-50 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/5",
                          )}
                        >
                          {a}
                          <span
                            className={cx(
                              "ml-1.5 tabular-nums",
                              active ? "text-indigo-200" : "text-gray-400",
                            )}
                          >
                            {chars.filter((c) => c.adventure === a).length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <dl className="mt-auto grid grid-cols-2 border-t border-gray-100 sm:grid-cols-4 dark:border-white/5">
                {[
                  ["등록 캐릭터", String(chars.length), ""],
                  ["모험단", String(adventures.length), ""],
                  ["딜러 / 버퍼", `${dealers} / ${buffers}`, ""],
                  [
                    "마지막 갱신",
                    timeAgo(meta?.last_success?.finished_at),
                    fmtDateTime(meta?.last_success?.finished_at),
                  ],
                ].map(([label, value, sub], i) => (
                  <div
                    key={label}
                    className={cx(
                      "px-6 py-5 sm:px-8",
                      i % 2 === 1 &&
                        "border-l border-gray-100 dark:border-white/5",
                      i >= 2 &&
                        "border-t border-gray-100 sm:border-t-0 dark:border-white/5",
                      i === 2 && "sm:border-l",
                    )}
                  >
                    <dt className="text-sm text-gray-500 dark:text-gray-400">
                      {label}
                    </dt>
                    <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                      {value}
                    </dd>
                    {sub && <dd className="text-xs text-gray-400">{sub}</dd>}
                  </div>
                ))}
              </dl>
            </Card>

            <Card className="p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">최근 작업</h2>
                <button
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                  onClick={() => setLogsOpen(true)}
                >
                  전체 보기
                </button>
              </div>
              <div className="mt-2">
                <ActivityFeed logs={logs} tags={meta?.tags ?? []} />
              </div>
            </Card>
          </section>

          {/* 필터 */}
          <section className="mt-10 flex flex-wrap items-center gap-3">
            <input
              className={cx(inputClass, "w-full sm:w-56")}
              placeholder="닉네임·모험단 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className={cx(inputClass, "w-auto")}
              value={adventure}
              onChange={(e) => setAdventure(e.target.value)}
            >
              <option value="">모든 모험단</option>
              {adventures.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-white/5">
              {(
                [
                  ["all", "전체"],
                  ["equip", "딜러"],
                  ["buff", "버퍼"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setScoreFilter(k)}
                  className={cx(
                    "rounded-md px-3 py-1 text-sm font-medium transition",
                    scoreFilter === k
                      ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white"
                      : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              className={cx(inputClass, "w-auto sm:ml-auto")}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="score">점수순</option>
              <option value="fame">명성순</option>
              <option value="name">이름순</option>
            </select>
          </section>

          {/* 캐릭터 블록 */}
          <section className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((c) => (
              <CharacterCard
                key={c.id}
                c={c}
                tags={meta?.tags ?? []}
                onClick={() => setSelectedId(c.id)}
              />
            ))}
          </section>
          {meta && visible.length === 0 && (
            <Card className="mt-4 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {chars.length === 0
                ? "등록된 캐릭터가 없습니다. 오른쪽 위에서 캐릭터를 등록해 주세요."
                : "조건에 맞는 캐릭터가 없습니다."}
            </Card>
          )}
        </>
      )}

      {meta && (
        <>
          <CharacterDialog
            character={selected}
            all={chars}
            meta={meta}
            onClose={() => setSelectedId(null)}
            run={run}
          />
          <AddCharacterDialog
            open={addOpen}
            meta={meta}
            adventures={adventures}
            onClose={() => setAddOpen(false)}
            run={run}
          />
        </>
      )}
      <NameDialog
        key={String(nameOpen)}
        open={nameOpen}
        onClose={() => setNameOpen(false)}
        onSave={async (n) => {
          try {
            const my = await api.register(n);
            setMe(my);
            setActorName(my.name ?? n);
            setActor(my.name ?? n);
            setNameOpen(false);
            if (!my.approved)
              showToast(
                "등록했습니다. 관리자 승인 후 편집할 수 있습니다",
                "success",
              );
          } catch (e) {
            showToast(
              e instanceof ApiError ? e.message : "요청에 실패했습니다",
            );
          }
        }}
      />
      <footer className="mt-16 flex justify-end">
        <button
          onClick={() =>
            getAdminPassword() ? setAdminOpen(true) : setAdminAction("login")
          }
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          관리자
        </button>
      </footer>
      <Modal
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        title="작업 기록"
      >
        <ActivityFeed logs={allLogs} tags={meta?.tags ?? []} />
      </Modal>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div
            key={toast.id}
            onAnimationEnd={() => setToast(null)}
            className={cx(
              "flex max-w-md animate-toast items-start gap-2.5 rounded-xl px-4 py-3 text-sm whitespace-pre-line shadow-lg ring-1",
              "bg-white text-gray-900 ring-black/5 dark:bg-gray-800 dark:text-white dark:ring-white/10",
            )}
          >
            <span
              className={cx(
                "mt-1.5 size-2 shrink-0 rounded-full",
                toast.tone === "success" ? "bg-emerald-500" : "bg-rose-500",
              )}
            />
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}
