import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { t } from "../../i18n";
import { Button, Card, ConfirmDialog, Pill } from "../../components/ui";
import { SearchSelect } from "../../components/SearchSelect";
import { MultiSearchSelect } from "../../components/MultiSearchSelect";
import { CalendarField } from "../../components/CalendarField";
import { useToast } from "../../components/ToastProvider";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Gamepad2,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";

const shapes = ["circle", "triangle", "rectangle", "pentagon", "hexagon"];
const defaultRanges = [
  { min: 80, max: 100, xp: 100 },
  { min: 60, max: 79, xp: 75 },
  { min: 40, max: 59, xp: 50 },
  { min: 20, max: 39, xp: 25 },
  { min: 0, max: 19, xp: 10 },
];

const GAME_ARTS: Record<string, { label: string; src: string }[]> = {
  drawing: [
    { label: "Sketch", src: "/quest-media/graphics/drawing.svg" },
    { label: "Explorer", src: "/quest-media/graphics/quest-explorer.svg" },
  ],
  reaction: [
    { label: "Pulse", src: "/quest-media/graphics/reaction.svg" },
    { label: "Energy", src: "/quest-media/graphics/streak-flame.svg" },
  ],
  sequence: [
    { label: "Sequence", src: "/quest-media/graphics/sequence.svg" },
    { label: "Memory", src: "/quest-media/graphics/memory.svg" },
  ],
  number_memory: [
    { label: "Numbers", src: "/quest-media/graphics/type.svg" },
    { label: "Memory", src: "/quest-media/graphics/memory.svg" },
  ],
  visual_memory: [
    { label: "Visual", src: "/quest-media/graphics/visual.svg" },
    { label: "Map", src: "/quest-media/graphics/map-grid.svg" },
  ],
  typing: [
    { label: "Type", src: "/quest-media/graphics/type.svg" },
    { label: "Quest", src: "/quest-media/graphics/quest-explorer.svg" },
  ],
  activity: [
    { label: "Quest", src: "/quest-media/graphics/quest-explorer.svg" },
    { label: "Community", src: "/quest-media/graphics/community.svg" },
  ],
};
const kinds = [
  { value: "drawing", label: "Drawing" },
  { value: "reaction", label: "Reaction" },
  { value: "sequence", label: "Sequence memory" },
  { value: "number_memory", label: "Number memory" },
  { value: "visual_memory", label: "Visual memory" },
  { value: "typing", label: "Typing" },
];
const pad = (n: number) => String(n).padStart(2, "0");
const localNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localPlusHours = (hours: number) => {
  const d = new Date(Date.now() + hours * 3600000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const normalizeDateTime = (value: string) => {
  if (value === "NOW") return "NOW";
  if (!value) return "";
  const [date, raw = "09:00"] = value.split("T");
  const [h = "09", m = "00"] = raw.split(":");
  return `${date}T${pad(Number(h) || 0)}:${pad(Number(m) || 0)}`;
};
function defaultScoring(kind: string, config: any) {
  const d = Number(config?.difficulty ?? 6),
    digits = Number(config?.digits || 7),
    size = Number(config?.gridSize || 4),
    count = Number(config?.targetCount || Math.max(3, size));
  if (kind === "reaction")
    return [
      { maxMs: 250, xp: 100 },
      { maxMs: 300, xp: 80 },
      { maxMs: 350, xp: 60 },
      { maxMs: 400, xp: 45 },
      { maxMs: 450, xp: 30 },
      { maxMs: 5000, xp: 15 },
    ];
  if (kind === "sequence")
    return [
      { min: d, xp: 100 },
      { min: Math.max(1, d - 2), xp: 80 },
      { min: Math.max(1, d - 4), xp: 60 },
      { min: 1, xp: 30 },
    ];
  if (kind === "number_memory")
    return [
      { min: digits, xp: 100 },
      { min: Math.max(4, digits - 1), xp: 80 },
      { min: Math.max(4, digits - 2), xp: 55 },
      { min: 4, xp: 25 },
    ];
  if (kind === "visual_memory")
    return [
      { min: count, xp: 100 },
      { min: Math.max(2, count - 1), xp: 70 },
      { min: 2, xp: 35 },
    ];
  if (kind === "typing")
    return [
      { minWpm: 80, xp: 100 },
      { minWpm: 65, xp: 80 },
      { minWpm: 50, xp: 60 },
      { minWpm: 35, xp: 40 },
      { minWpm: 20, xp: 20 },
    ];
  return [
    { min: 80, max: 100, xp: 100 },
    { min: 60, max: 79, xp: 75 },
    { min: 40, max: 59, xp: 50 },
    { min: 20, max: 39, xp: 25 },
    { min: 0, max: 19, xp: 10 },
  ];
}
function validateScoring(kind: string, rows: any[]) {
  if (!Array.isArray(rows) || !rows.length)
    return "Add at least one scoring rule.";
  if (
    rows.some(
      (r) =>
        !Number.isFinite(Number(r.xp)) ||
        Number(r.xp) < 0 ||
        Number(r.xp) > 5000,
    )
  )
    return "XP must be between 0 and 5000.";
  if (
    kind === "reaction" &&
    rows.some(
      (r) =>
        !Number.isFinite(Number(r.maxMs)) ||
        Number(r.maxMs) < 80 ||
        Number(r.maxMs) > 5000,
    )
  )
    return "Reaction thresholds must be 80–5000 ms.";
  if (
    ["sequence", "number_memory", "visual_memory"].includes(kind) &&
    rows.some((r) => !Number.isFinite(Number(r.min)) || Number(r.min) < 1)
  )
    return "Result thresholds must be positive.";
  if (
    kind === "typing" &&
    rows.some(
      (r) =>
        !Number.isFinite(Number(r.minWpm)) ||
        Number(r.minWpm) < 0 ||
        Number(r.minWpm) > 200,
    )
  )
    return "WPM thresholds must be 0–200.";
  return "";
}

export function GameEditor() {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<any>({
    games: [],
    groups: [],
    youth: [],
    assignments: [],
  });
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [step, setStep] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [assignmentPanel, setAssignmentPanel] = useState<
    "assign" | "revoke" | ""
  >("");
  const [gameId, setGameId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("drawing");
  const [xpReward, setXpReward] = useState(100);
  const [startAt, setStartAt] = useState("NOW");
  const [endAt, setEndAt] = useState(localPlusHours(24));
  const [shape, setShape] = useState("circle");
  const [retries, setRetries] = useState(3);
  const [scoringPolicy, setScoringPolicy] = useState<"best" | "last">("best");
  const [ranges, setRanges] = useState<any[]>(defaultRanges);
  const [target, setTarget] = useState("group");
  const [targetId, setTargetId] = useState("");
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [gameConfig, setGameConfig] = useState<any>({});
  const [confirm, setConfirm] = useState<any>(null);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const { show } = useToast();
  const load = async () => {
    try {
      const x = await api<any>("/staff/games/");
      setData({
        games: x.games || [],
        groups: x.groups || [],
        youth: x.youth || [],
        assignments: x.assignments || [],
      });
    } catch (e) {
      show(e instanceof Error ? e.message : "Unable to load games", "error");
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!editorOpen) return;
    requestAnimationFrame(() =>
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, [editorOpen, gameId]);
  const libraryGames = useMemo(
    () =>
      data.games.filter((g: any) => {
        const q = libraryQuery.trim().toLowerCase();
        return (
          (libraryFilter === "all" || g.kind === libraryFilter) &&
          (!q || `${g.title} ${g.description || ""}`.toLowerCase().includes(q))
        );
      }),
    [data.games, libraryQuery, libraryFilter],
  );
  const selectedAssignments = useMemo(
    () =>
      gameId
        ? data.assignments.filter(
            (x: any) => String(x.game_id) === String(gameId),
          )
        : [],
    [data.assignments, gameId],
  );
  const activeSelectedAssignments = selectedAssignments.filter(
    (x: any) => x.active,
  );
  const rangeError = validateScoring(kind, ranges);
  function resetForm() {
    setGameId("");
    setTitle("");
    setDescription("");
    setKind("drawing");
    setXpReward(100);
    setStartAt("NOW");
    setEndAt(localPlusHours(24));
    setShape("circle");
    setRetries(3);
    setScoringPolicy("best");
    setRanges(defaultScoring("drawing", {}));
    setGameConfig({});
    setTarget("group");
    setTargetId("");
    setTargetIds([]);
    setStep(1);
    setEditorOpen(false);
    setAssignmentPanel("");
  }
  function startNewGame() {
    resetForm();
    setEditorOpen(true);
    setAssignmentPanel("assign");
  }
  function selectGame(id: string) {
    setGameId(id);
    setEditorOpen(true);
    setAssignmentPanel("");
    const g = data.games.find((x: any) => String(x.id) === id);
    if (!g) {
      resetForm();
      setEditorOpen(true);
      return;
    }
    setTitle(g.title);
    setDescription(g.description || "");
    setKind(g.kind);
    setXpReward(Number(g.xp_reward || 0));
    setStartAt(normalizeDateTime(g.start_at) || localNow());
    setEndAt(normalizeDateTime(g.end_at) || localPlusHours(24));
    setShape(g.shape || "circle");
    setRanges(
      g.game_config?.scoring?.length
        ? g.game_config.scoring.map((x: any) => ({ ...x }))
        : defaultScoring(g.kind, g.game_config),
    );
    setRetries(g.retries_per_player || 3);
    setScoringPolicy(g.scoring_policy === "last" ? "last" : "best");
    setGameConfig(g.game_config || {});
    setStep(1);
  }
  function setRange(i: number, key: string, value: string) {
    const clean = value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
    setRanges((r) =>
      r.map((x, j) =>
        j === i ? { ...x, [key]: clean === "" ? "" : Number(clean) } : x,
      ),
    );
  }
  function setConfig(key: string, value: any) {
    setGameConfig((x: any) => {
      const next = { ...x, [key]: value };
      if (
        ["difficulty", "digits", "gridSize", "targetCount"].includes(key) &&
        (!x.scoring || !x.scoring.length)
      )
        setRanges(defaultScoring(kind, next));
      return next;
    });
  }
  function setScore(i: number, key: string, value: string) {
    const clean = value.replace(/[^0-9.]/g, "");
    setRanges((r) =>
      r.map((x, j) =>
        j === i ? { ...x, [key]: clean === "" ? "" : Number(clean) } : x,
      ),
    );
  }
  function resetScoring(nextKind: string) {
    setRanges(defaultScoring(nextKind, gameConfig));
  }
  async function saveGame() {
    if (!title.trim()) return show("Add a game title.", "error");
    if (!startAt || !endAt)
      return show("Choose both a start and end date/time.", "error");
    if (
      startAt !== "NOW" &&
      new Date(startAt).getTime() >= new Date(endAt).getTime()
    )
      return show("End date/time must be after the start date/time.", "error");
    if (rangeError) return show(rangeError, "error");
    if (
      !gameId &&
      ((target === "group" && !targetId) ||
        (target === "youth" && !targetIds.length))
    )
      return show("Choose who receives the new game.", "error");
    const payload: any = {
      gameId: gameId ? Number(gameId) : undefined,
      title: title.trim(),
      description,
      kind,
      xpReward,
      startAt: normalizeDateTime(startAt),
      endAt: normalizeDateTime(endAt),
      shape: kind === "drawing" ? shape : "circle",
      scoreRanges: ranges,
      retries,
      scoringPolicy,
      gameConfig: { ...gameConfig, scoring: ranges },
    };
    if (!gameId)
      Object.assign(
        payload,
        target === "group"
          ? { groupId: Number(targetId) }
          : { profileIds: targetIds.map(Number) },
      );
    try {
      await api("/staff/games/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      show(gameId ? "Game updated." : "Game created and assigned.", "success");
      resetForm();
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "Unable to save game", "error");
    }
  }
  async function action(body: any, success: string) {
    try {
      await api("/staff/games/", {
        method: "POST",
        body: JSON.stringify(body),
      });
      show(success, "success");
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "Game action failed", "error");
    }
  }
  async function assignSelectedGame() {
    if (!gameId) return show("Select a game first.", "error");
    if (
      (target === "group" && !targetId) ||
      (target === "youth" && !targetIds.length)
    )
      return show("Choose who should receive this game.", "error");
    const body: any = { gameId: Number(gameId) };
    if (target === "group") body.groupId = Number(targetId);
    else body.profileIds = targetIds.map(Number);
    await action(body, "Game assigned.");
    setTargetId("");
    setTargetIds([]);
    setAssignmentPanel("assign");
  }
  async function reassign() {
    if (!editingAssignment || !targetId) return;
    await action(
      {
        action: "reassign_assignment",
        assignmentId: editingAssignment.id,
        ...(target === "group"
          ? { groupId: Number(targetId) }
          : { profileId: Number(targetId) }),
      },
      "Game reassigned.",
    );
    setEditingAssignment(null);
    setTargetId("");
  }
  const configPanel =
    kind === "reaction" ? (
      <div className="soft-card game-config-box">
        <strong>Fairness tuning</strong>
        <p className="muted">
          The server accepts 80–5000 ms. Around 250 ms is top-tier; 550 ms is
          the lower scoring floor, so every result has a clear performance band.
        </p>
      </div>
    ) : kind === "sequence" ? (
      <label>
        Sequence length
        <input
          type="number"
          min="1"
          value={gameConfig.difficulty ?? 6}
          onChange={(e) =>
            setConfig("difficulty", Math.max(1, Number(e.target.value) || 1))
          }
        />
      </label>
    ) : kind === "number_memory" ? (
      <label>
        Digits
        <input
          type="number"
          min="4"
          max="12"
          value={gameConfig.digits || 7}
          onChange={(e) =>
            setConfig(
              "digits",
              Math.max(4, Math.min(12, Number(e.target.value) || 7)),
            )
          }
        />
      </label>
    ) : kind === "visual_memory" ? (
      <>
        <label>
          Grid size
          <select
            value={gameConfig.gridSize || 4}
            onChange={(e) => setConfig("gridSize", Number(e.target.value))}
          >
            <option value="3">3 × 3</option>
            <option value="4">4 × 4</option>
            <option value="5">5 × 5</option>
            <option value="6">6 × 6</option>
          </select>
        </label>
        <label>
          Target squares
          <input
            type="number"
            min="2"
            max="20"
            value={gameConfig.targetCount || 4}
            onChange={(e) =>
              setConfig(
                "targetCount",
                Math.max(2, Math.min(20, Number(e.target.value) || 4)),
              )
            }
          />
        </label>
      </>
    ) : kind === "typing" ? (
      <label className="grid-span-2">
        Typing passage
        <textarea
          value={gameConfig.text || ""}
          onChange={(e) => setConfig("text", e.target.value.slice(0, 500))}
          placeholder="Leave blank to use the standard passage."
        />
      </label>
    ) : null;
  return (
    <div className="page games-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">{t("games").toUpperCase()}</span>
          <h2>Games & assignments</h2>
          <p>
            Keep drawing games and add fair, server-scored cognitive challenges
            with configurable XP rules.
          </p>
        </div>
        <Gamepad2 size={34} />
      </div>
      <Card className="game-library-card">
        <div className="section-head">
          <div>
            <span className="eyebrow">GAME LIBRARY</span>
            <h3>Available games</h3>
            <p className="muted">
              Select a game to open edit mode. From the selected game you can
              edit, assign it to people or groups, and manage active
              assignments.
            </p>
          </div>
          <div className="top-actions">
            <Pill>{libraryGames.length}</Pill>
            <Button icon={Plus} onClick={startNewGame}>
              Create new game
            </Button>
          </div>
        </div>
        <div className="game-library-filter">
          <label className="games-search">
            <span className="sr-only">Search games</span>
            <input
              value={libraryQuery}
              onChange={(e) => setLibraryQuery(e.target.value)}
              placeholder="Search games…"
            />
          </label>
          <div className="segmented-tabs">
            {["all", ...kinds.map((k) => k.value)].map((k) => (
              <button
                type="button"
                key={k}
                className={libraryFilter === k ? "active" : ""}
                onClick={() => setLibraryFilter(k)}
              >
                {k === "all"
                  ? "All"
                  : kinds.find((x) => x.value === k)?.label || k}
              </button>
            ))}
          </div>
        </div>
        <div className="admin-game-grid">
          {libraryGames.map((g: any, i: number) => {
            const count = data.assignments.filter(
              (a: any) => String(a.game_id) === String(g.id) && a.active,
            ).length;
            return (
              <button
                type="button"
                className={`admin-game-tile tone-${["mint", "sun", "lilac", "aqua", "peach"][i % 5]} ${String(g.id) === gameId ? "selected" : ""}`}
                key={g.id}
                onClick={() => selectGame(String(g.id))}
              >
                <span className="admin-game-tile-art">
                  {g.game_config?.art ? (
                    <img src={g.game_config.art} alt="" />
                  ) : (
                    <Gamepad2 size={24} />
                  )}
                </span>
                <span>
                  <strong>{g.title}</strong>
                  <small>
                    {kinds.find((k) => k.value === g.kind)?.label || g.kind} ·{" "}
                    {g.active ? "Available" : "Inactive"}
                  </small>
                  <small>
                    {count} active {count === 1 ? "assignment" : "assignments"}{" "}
                    · Click to edit
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            );
          })}
        </div>
        {!libraryGames.length && (
          <div className="empty-state">No games match these filters.</div>
        )}
      </Card>
      {editorOpen && (
        <div ref={editorRef} className="game-editor-scroll-target">
          <Card className="game-editor-card">
            <div className="section-head">
              <div>
                <span className="eyebrow">
                  {gameId ? "SELECTED GAME" : "NEW GAME"}
                </span>
                <h3>{gameId ? title || "Edit game" : "Create a new game"}</h3>
                <p className="muted">
                  {gameId
                    ? "Edit the game definition, assign it, or manage its active assignments from this workspace."
                    : "Build the game first, then assign it to a group or selected young people."}
                </p>
              </div>
              <div className="top-actions">
                <Button variant="ghost" icon={XCircle} onClick={resetForm}>
                  Close
                </Button>
                {gameId && (
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    onClick={() =>
                      setConfirm({
                        kind: "delete-game",
                        id: Number(gameId),
                        title,
                      })
                    }
                  >
                    Delete game
                  </Button>
                )}
              </div>
            </div>
            <div className="selected-game-actions">
              <div>
                <strong>{gameId ? "Game actions" : "Game setup"}</strong>
                <span className="muted">
                  {gameId
                    ? `${activeSelectedAssignments.length} active ${activeSelectedAssignments.length === 1 ? "assignment" : "assignments"}`
                    : "Create the definition before assigning it."}
                </span>
              </div>
              <div className="top-actions">
                <Button
                  variant={step === 1 ? "secondary" : "ghost"}
                  icon={Edit3}
                  onClick={() => {
                    setStep(1);
                    setAssignmentPanel("");
                  }}
                >
                  {gameId ? "Edit" : "Details"}
                </Button>
                <Button
                  variant={
                    step === 4 && assignmentPanel === "assign"
                      ? "secondary"
                      : "ghost"
                  }
                  icon={UserPlus}
                  onClick={() => {
                    setStep(4);
                    setAssignmentPanel("assign");
                  }}
                >
                  Assign
                </Button>
                {gameId && (
                  <Button
                    variant={
                      step === 4 && assignmentPanel === "revoke"
                        ? "secondary"
                        : "ghost"
                    }
                    icon={XCircle}
                    onClick={() => {
                      setStep(4);
                      setAssignmentPanel("revoke");
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            </div>
            <div className="game-editor-inner">
              <div className="wizard-steps">
                {["Game", "Scoring", "Availability", "Assign"].map((x, i) => (
                  <button
                    type="button"
                    key={x}
                    className={
                      step === i + 1 ? "wizard-step active" : "wizard-step"
                    }
                    onClick={() => {
                      setStep(i + 1);
                      if (i === 3) setAssignmentPanel("assign");
                    }}
                  >
                    <b>{i + 1}</b>
                    {x}
                  </button>
                ))}
              </div>
              <div className="game-editor-toolbar">
                <label className="game-selector">
                  Existing game
                  <select
                    value={gameId}
                    onChange={(e) =>
                      e.target.value
                        ? selectGame(e.target.value)
                        : startNewGame()
                    }
                  >
                    <option value="">Create new game</option>
                    {data.games.map((g: any) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                        {g.active ? "" : " · inactive"}
                      </option>
                    ))}
                  </select>
                </label>
                {gameId && (
                  <Button icon={Edit3} onClick={saveGame}>
                    Save changes
                  </Button>
                )}
              </div>
              {step === 1 && (
                <div className="wizard-panel">
                  <div className="game-art-picker">
                    <div className="section-head">
                      <div>
                        <span className="eyebrow">GAME ART</span>
                        <h3>Choose a visual for this game</h3>
                        <p className="muted">
                          Use the built-in illustrations matched to the game
                          type. Nothing external is required.
                        </p>
                      </div>
                      <Gamepad2 />
                    </div>
                    <div className="game-art-grid">
                      {(GAME_ARTS[kind] || GAME_ARTS.activity).map((a) => (
                        <button
                          type="button"
                          key={a.src}
                          className={`game-art-option ${gameConfig.art === a.src ? "selected" : ""}`}
                          onClick={() => setConfig("art", a.src)}
                        >
                          <img src={a.src} alt="" />
                          <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid-2">
                    <label>
                      Game title
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Reaction challenge"
                      />
                    </label>
                    <label>
                      Game type
                      <select
                        value={kind}
                        onChange={(e) => {
                          const k = e.target.value;
                          setKind(k);
                          setGameConfig({});
                          setRanges(defaultScoring(k, {}));
                        }}
                      >
                        {kinds.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid-span-2">
                      Instructions
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Explain what the young person should do."
                      />
                    </label>
                    {kind === "drawing" && (
                      <label>
                        Target shape
                        <select
                          value={shape}
                          onChange={(e) => setShape(e.target.value)}
                        >
                          {shapes.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {configPanel}
                    <div className="soft-card game-finish-rule">
                      <strong>Configured rounds</strong>
                      <p className="muted">
                        Players can submit whenever they feel finished. The
                        server enforces the configured number of rounds for each
                        assignment.
                      </p>
                    </div>
                  </div>
                  <div className="top-actions">
                    {gameId && (
                      <Button icon={Edit3} onClick={saveGame}>
                        Save changes
                      </Button>
                    )}
                    <Button icon={ChevronRight} onClick={() => setStep(2)}>
                      Scoring
                    </Button>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="wizard-panel">
                  <div className="section-head">
                    <div>
                      <h3>
                        {kind === "reaction"
                          ? "Reaction time → XP"
                          : kind === "typing"
                            ? "Typing speed → XP"
                            : kind === "sequence"
                              ? "Sequence level → XP"
                              : kind === "number_memory"
                                ? "Digits remembered → XP"
                                : kind === "visual_memory"
                                  ? "Squares remembered → XP"
                                  : "Performance → XP"}
                      </h3>
                      <p className="muted">
                        {kind === "reaction"
                          ? "Set the maximum reaction time that earns each XP amount. Faster is better."
                          : kind === "typing"
                            ? "Set minimum WPM thresholds. Faster accurate typing earns more XP."
                            : kind === "sequence"
                              ? "Set the minimum sequence level completed for each XP amount."
                              : kind === "number_memory"
                                ? "Set the minimum number of digits correctly remembered for each XP amount."
                                : kind === "visual_memory"
                                  ? "Set the minimum correctly remembered squares for each XP amount."
                                  : "Drawing accuracy uses percentage bands."}
                      </p>
                    </div>
                    {rangeError ? (
                      <Pill>{rangeError}</Pill>
                    ) : (
                      <Pill icon={CheckCircle2}>Scoring ready</Pill>
                    )}
                  </div>
                  {kind === "drawing"
                    ? ranges.map((r, i) => (
                        <div className="grid-3" key={i}>
                          <input
                            aria-label="Minimum performance"
                            type="number"
                            min="0"
                            max="100"
                            value={r.min}
                            onChange={(e) => setScore(i, "min", e.target.value)}
                          />
                          <input
                            aria-label="Maximum performance"
                            type="number"
                            min="0"
                            max="100"
                            value={r.max}
                            onChange={(e) => setScore(i, "max", e.target.value)}
                          />
                          <div>
                            <input
                              aria-label="XP for range"
                              type="number"
                              min="0"
                              max="5000"
                              value={r.xp}
                              onChange={(e) =>
                                setScore(i, "xp", e.target.value)
                              }
                            />
                            <Button
                              variant="ghost"
                              icon={Trash2}
                              aria-label="Remove scoring range"
                              onClick={() =>
                                setRanges(ranges.filter((_, j) => j !== i))
                              }
                            />
                          </div>
                        </div>
                      ))
                    : ranges.map((r, i) => (
                        <div className="grid-3 game-score-rule" key={i}>
                          <label>
                            {kind === "reaction"
                              ? "Max ms"
                              : kind === "typing"
                                ? "Min WPM"
                                : "Minimum result"}
                            <input
                              type="number"
                              min="0"
                              max={
                                kind === "reaction"
                                  ? 5000
                                  : kind === "typing"
                                    ? 200
                                    : 100
                              }
                              value={
                                kind === "reaction"
                                  ? r.maxMs
                                  : kind === "typing"
                                    ? r.minWpm
                                    : r.min
                              }
                              onChange={(e) =>
                                setScore(
                                  i,
                                  kind === "reaction"
                                    ? "maxMs"
                                    : kind === "typing"
                                      ? "minWpm"
                                      : "min",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                          <label>
                            XP awarded
                            <input
                              type="number"
                              min="0"
                              max="5000"
                              value={r.xp}
                              onChange={(e) =>
                                setScore(i, "xp", e.target.value)
                              }
                            />
                          </label>
                          <div>
                            <span className="muted">
                              {kind === "reaction"
                                ? "e.g. 250 ms → 100 XP"
                                : kind === "typing"
                                  ? "e.g. 80 WPM → 100 XP"
                                  : "e.g. target result → XP"}
                            </span>
                            <Button
                              variant="ghost"
                              icon={Trash2}
                              aria-label="Remove scoring rule"
                              onClick={() =>
                                setRanges(ranges.filter((_, j) => j !== i))
                              }
                            />
                          </div>
                        </div>
                      ))}
                  <Button
                    variant="secondary"
                    icon={Plus}
                    onClick={() =>
                      setRanges([
                        ...ranges,
                        kind === "reaction"
                          ? { maxMs: 5000, xp: 0 }
                          : kind === "typing"
                            ? { minWpm: 0, xp: 0 }
                            : { min: 0, xp: 0 },
                      ])
                    }
                  >
                    Add rule
                  </Button>
                  <div className="top-actions">
                    <Button
                      variant="secondary"
                      icon={ChevronLeft}
                      onClick={() => setStep(1)}
                    >
                      Back
                    </Button>
                    <Button
                      icon={ChevronRight}
                      disabled={!!rangeError}
                      onClick={() => setStep(3)}
                    >
                      Availability
                    </Button>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="wizard-panel">
                  <div className="grid-2">
                    <CalendarField
                      label="Start date/time"
                      value={startAt}
                      onChange={setStartAt}
                    />
                    <CalendarField
                      label="End date/time"
                      value={endAt}
                      onChange={setEndAt}
                    />
                  </div>
                  <Card className="soft-card">
                    <strong>Scheduling and fairness</strong>
                    <p className="muted">
                      Each attempt is tied to an assignment. Existing attempts
                      and XP transactions remain immutable history if the game
                      is edited or reassigned.
                    </p>
                  </Card>
                  <div className="top-actions">
                    <Button
                      variant="secondary"
                      icon={ChevronLeft}
                      onClick={() => setStep(2)}
                    >
                      Back
                    </Button>
                    <Button
                      icon={ChevronRight}
                      onClick={() => {
                        setStep(4);
                        setAssignmentPanel("assign");
                      }}
                    >
                      Assignment
                    </Button>
                  </div>
                </div>
              )}
              {step === 4 && (
                <div className="wizard-panel">
                  <div className="assignment-mode-tabs">
                    <button
                      type="button"
                      className={assignmentPanel === "assign" ? "active" : ""}
                      onClick={() => setAssignmentPanel("assign")}
                    >
                      <UserPlus size={16} />
                      Assign game
                    </button>
                    {gameId && (
                      <button
                        type="button"
                        className={assignmentPanel === "revoke" ? "active" : ""}
                        onClick={() => setAssignmentPanel("revoke")}
                      >
                        <XCircle size={16} />
                        Manage assignments
                      </button>
                    )}
                  </div>
                  {assignmentPanel !== "revoke" ? (
                    <div className="grid-2">
                      <label>
                        Assign to
                        <select
                          value={target}
                          onChange={(e) => {
                            setTarget(e.target.value);
                            setTargetId("");
                            setTargetIds([]);
                          }}
                        >
                          <option value="group">{t("group")}</option>
                          <option value="youth">Young people</option>
                        </select>
                      </label>
                      {target === "group" ? (
                        <SearchSelect
                          label="Recipient group"
                          value={targetId}
                          onChange={setTargetId}
                          placeholder={t("choose")}
                          searchPlaceholder="Search group…"
                          options={data.groups.map((x: any) => ({
                            value: x.id,
                            label: x.name,
                          }))}
                        />
                      ) : (
                        <MultiSearchSelect
                          label="Young people"
                          values={targetIds}
                          onChange={setTargetIds}
                          placeholder="Choose players"
                          searchPlaceholder="Search players…"
                          options={data.youth.map((x: any) => ({
                            value: x.id,
                            label: x.gamertag,
                          }))}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="selected-assignments-panel">
                      <div className="section-head">
                        <div>
                          <span className="eyebrow">ACTIVE ASSIGNMENTS</span>
                          <h3>Who currently has this game?</h3>
                          <p className="muted">
                            Revoke an assignment here. Historical attempts
                            remain attached to their original assignment
                            lifecycle.
                          </p>
                        </div>
                        <Pill>{activeSelectedAssignments.length}</Pill>
                      </div>
                      {activeSelectedAssignments.length ? (
                        activeSelectedAssignments.map((a: any) => (
                          <div className="game-assignment-row" key={a.id}>
                            <div>
                              <strong>
                                {a.target_group__name ||
                                  a.target_profile__gamertag ||
                                  "Unknown recipient"}
                              </strong>
                              <small>
                                Assigned{" "}
                                {a.assigned_at
                                  ? new Date(a.assigned_at).toLocaleString()
                                  : ""}
                              </small>
                            </div>
                            <div className="top-actions">
                              <Button
                                variant="secondary"
                                icon={UserPlus}
                                onClick={() => {
                                  setEditingAssignment(a);
                                  setTarget(
                                    a.target_group_id ? "group" : "youth",
                                  );
                                  setTargetId(
                                    String(
                                      a.target_group_id ||
                                        a.target_profile_id ||
                                        "",
                                    ),
                                  );
                                }}
                              >
                                Reassign
                              </Button>
                              <Button
                                variant="ghost"
                                icon={XCircle}
                                onClick={() =>
                                  setConfirm({ kind: "revoke", id: a.id })
                                }
                              >
                                Revoke
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">
                          <Gamepad2 />
                          <p>This game has no active assignments.</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="game-preview">
                    <div className="game-preview-shape">
                      <Gamepad2 size={42} />
                    </div>
                    <span className="eyebrow">PLAYER PREVIEW</span>
                    <h3>{title || "Your game"}</h3>
                    <p>
                      {description ||
                        "The player-facing instructions will appear here."}
                    </p>
                    <div className="upcoming-meta">
                      <Pill>{xpReward} XP max</Pill>
                      <Pill>Play when ready</Pill>
                      <Pill>
                        {kinds.find((k) => k.value === kind)?.label || kind}
                      </Pill>
                    </div>
                    {endAt && (
                      <small>
                        Valid until {new Date(endAt).toLocaleString()}
                      </small>
                    )}
                  </div>
                  <div className="top-actions">
                    <Button
                      variant="secondary"
                      icon={ChevronLeft}
                      onClick={() => setStep(3)}
                    >
                      Back
                    </Button>
                    {!gameId ? (
                      <Button icon={Send} onClick={saveGame}>
                        Create & assign
                      </Button>
                    ) : assignmentPanel !== "revoke" ? (
                      <Button
                        icon={UserPlus}
                        disabled={
                          (target === "group" && !targetId) ||
                          (target === "youth" && !targetIds.length)
                        }
                        onClick={assignSelectedGame}
                      >
                        Assign game
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
      {editingAssignment && (
        <Card className="reassign-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">REASSIGN</span>
              <h3>{editingAssignment.game__title}</h3>
              <p className="muted">
                Move this active assignment to another player or group. This
                creates a fresh assignment lifecycle and preserves the old
                history.
              </p>
            </div>
            <Button
              variant="ghost"
              icon={XCircle}
              onClick={() => setEditingAssignment(null)}
            >
              Close
            </Button>
          </div>
          <div className="grid-2">
            <label>
              Recipient type
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setTargetId("");
                }}
              >
                <option value="group">Group</option>
                <option value="youth">Young person</option>
              </select>
            </label>
            <SearchSelect
              label="New recipient"
              value={targetId}
              onChange={setTargetId}
              placeholder="Choose"
              searchPlaceholder="Search…"
              options={(target === "group" ? data.groups : data.youth).map(
                (x: any) => ({ value: x.id, label: x.name || x.gamertag }),
              )}
            />
          </div>
          <Button icon={UserPlus} disabled={!targetId} onClick={reassign}>
            Save reassignment
          </Button>
        </Card>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.kind === "delete-game"
            ? "Delete game?"
            : "Revoke assignment?"
        }
        body={
          confirm?.kind === "delete-game"
            ? `“${confirm?.title || "This game"}” will be removed from active use. Existing assignment and attempt history remains available.`
            : "The young person will no longer have this game assigned. Historical records remain visible."
        }
        confirmLabel={
          confirm?.kind === "delete-game" ? "Delete game" : "Revoke assignment"
        }
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          await action(
            c.kind === "delete-game"
              ? { action: "delete_game", gameId: c.id }
              : { action: "revoke_assignment", assignmentId: c.id },
            c.kind === "delete-game"
              ? "Game deleted."
              : "Game assignment revoked.",
          );
          if (c.kind === "delete-game") resetForm();
        }}
      />
    </div>
  );
}
