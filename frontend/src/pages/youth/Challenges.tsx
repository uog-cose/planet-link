import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { Card, Pill } from "../../components/ui";
import {
  Clock,
  Gamepad2,
  Play,
  CheckCircle2,
  LockKeyhole,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router-dom";
import { QuestArt } from "../../components/QuestArt";
function Countdown({ until }: { until?: string | null }) {
  const [r, setR] = useState("");
  useEffect(() => {
    const f = () => {
      if (!until) {
        setR("");
        return;
      }
      const n = Math.max(0, new Date(until).getTime() - Date.now());
      const d = Math.floor(n / 86400000),
        h = Math.floor((n % 86400000) / 3600000),
        m = Math.floor((n % 3600000) / 60000);
      const seconds = Math.ceil(n / 1000);
      setR(
        d
          ? `${d}d ${h}h ${m}m`
          : h
            ? `${h}h ${m}m`
            : seconds < 60
              ? "<1m"
              : `${Math.ceil(seconds / 60)}m`,
      );
    };
    f();
    const i = setInterval(f, 1000);
    return () => clearInterval(i);
  }, [until]);
  return r ? <Pill icon={Clock}>{r}</Pill> : null;
}
export function Challenges() {
  const [items, setItems] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  useEffect(() => {
    api<any>("/challenges/")
      .then((x) => setItems(Array.isArray(x.items) ? x.items : []))
      .catch(() => setItems([]));
  }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank: any = { live: 0, upcoming: 1, completed: 2, unavailable: 3 };
    return items
      .filter(
        (c) =>
          c.status !== "unavailable" &&
          (filter === "all" || c.status === filter) &&
          (!q ||
            `${c.title} ${c.description || ""} ${c.gameType || c.shape || ""}`
              .toLowerCase()
              .includes(q)),
      )
      .sort(
        (a, b) =>
          (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
          String(a.title).localeCompare(String(b.title)),
      );
  }, [items, query, filter]);
  const visibleItems = useMemo(
    () => items.filter((c) => c.status !== "unavailable"),
    [items],
  );
  const counts = useMemo(
    () =>
      visibleItems.reduce(
        (a, c) => {
          a[c.status] = (a[c.status] || 0) + 1;
          return a;
        },
        { all: visibleItems.length } as Record<string, number>,
      ),
    [visibleItems],
  );
  const recommended = useMemo(
    () =>
      visibleItems.find((c) => c.status === "live") ||
      visibleItems.find((c) => c.status === "upcoming"),
    [visibleItems],
  );
  return (
    <div className="page games-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">YOUR GAMES</span>
          <h2>Games</h2>
          <p>
            These are the games and activities assigned to you or your group.
          </p>
        </div>
        <Gamepad2 size={34} />
      </div>
      <Card className="games-toolbar">
        <div className="games-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games…"
            aria-label="Search games"
          />
        </div>
        <div className="games-filters" role="group" aria-label="Filter games">
          {["all", "live", "upcoming", "completed"].map((k) => (
            <button
              type="button"
              key={k}
              className={filter === k ? "active" : ""}
              onClick={() => setFilter(k)}
            >
              {k === "all" ? "All" : k[0].toUpperCase() + k.slice(1)}{" "}
              <span>{counts[k] || 0}</span>
            </button>
          ))}
        </div>
      </Card>
      {recommended && (
        <Card className="recommended-game-card">
          <div>
            <span className="eyebrow">RECOMMENDED FOR YOU</span>
            <h3>{recommended.title}</h3>
            <p>
              {recommended.description || "A great next step in your quest."}
            </p>
          </div>
          {recommended.status === "live" ? (
            <Link
              className="button primary"
              to={
                recommended.kind === "drawing"
                  ? `/drawings?assignmentId=${recommended.assignmentId}`
                  : `/games/${recommended.assignmentId}`
              }
            >
              Continue <Play size={17} />
            </Link>
          ) : (
            <Pill icon={Clock}>Coming up</Pill>
          )}
        </Card>
      )}
      <div className="games-list-meta">
        <span>
          {filtered.length} of {visibleItems.length} games
        </span>
        {query && <span>Search: “{query}”</span>}
      </div>
      {filtered.length ? (
        <div className="challenge-list">
          {filtered.map((c) => (
            <Card key={c.id} className={`challenge-row lifecycle-${c.status}`}>
              <div className="challenge-icon">
                {c.gameConfig?.art ? (
                  <img src={c.gameConfig.art} alt="" />
                ) : (
                  <QuestArt
                    kind={
                      c.kind === "drawing"
                        ? "drawing"
                        : c.gameType === "reaction"
                          ? "reaction"
                          : c.gameType === "sequence"
                            ? "sequence"
                            : c.gameType === "visual_memory"
                              ? "visual"
                              : c.gameType === "typing"
                                ? "typing"
                                : "games"
                    }
                    alt=""
                  />
                )}
              </div>
              <div className="grow">
                <div className="upcoming-meta">
                  <Pill>{c.status}</Pill>
                  {c.status === "upcoming" ? (
                    <Countdown until={c.startAt} />
                  ) : c.status === "live" ? (
                    <Countdown until={c.endAt} />
                  ) : null}
                </div>
                <h3>{c.title}</h3>
                <p>{c.description}</p>
                <div className="upcoming-meta">
                  <Pill>{c.gameType || c.shape || "challenge"}</Pill>
                  {c.kind === "drawing" && (
                    <Pill>
                      {c.attemptsRemaining}/{c.retries} attempts
                    </Pill>
                  )}
                  {c.endAt && c.status !== "completed" && (
                    <small>Until {new Date(c.endAt).toLocaleString()}</small>
                  )}
                </div>
              </div>
              <div className="challenge-action">
                {c.status === "live" && c.kind === "drawing" ? (
                  <Link
                    className="button secondary"
                    to={`/drawings?assignmentId=${c.assignmentId}`}
                  >
                    <Play size={18} />
                    Play
                  </Link>
                ) : c.status === "live" && c.gameType ? (
                  <Link
                    className="button secondary"
                    to={`/games/${c.assignmentId}`}
                  >
                    <Play size={18} />
                    Play
                  </Link>
                ) : c.status === "completed" ? (
                  <Pill icon={CheckCircle2}>Completed</Pill>
                ) : c.status === "upcoming" ? (
                  <Pill icon={Clock}>Coming up</Pill>
                ) : (
                  <Pill icon={LockKeyhole}>Unavailable</Pill>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="null-card games-empty">
          <div>
            <strong>
              {visibleItems.length
                ? "No games match your search"
                : "No games assigned yet"}
            </strong>
            <p>
              {items.length
                ? "Try another search or filter."
                : "Your youth worker will add games here when they are ready."}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
