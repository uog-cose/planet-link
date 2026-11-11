import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";

type ProgrammeOption = { id: number | string; name: string; location?: string };

type Props = {
  items: ProgrammeOption[];
  value: string;
  onChange: (id: string) => void;
  total?: number;
};

export function PublicProgramPicker({
  items,
  value,
  onChange,
  total = items.length,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProgrammeOption[]>(items);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => setResults(items), [items]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const search = useMemo(() => query.trim(), [query]);
  useEffect(() => {
    if (!open || !search) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSearching(true);
      setError("");
      api<{ items: ProgrammeOption[]; total: number }>(
        `/public/instances/?q=${encodeURIComponent(search)}&_=${Date.now()}`,
        { cache: "no-store" },
      )
        .then((x) => setResults(Array.isArray(x.items) ? x.items : []))
        .catch((e) => setError(e instanceof Error ? e.message : t("errorBody")))
        .finally(() => setSearching(false));
    }, 220);
    return () => window.clearTimeout(timer.current);
  }, [open, search]);
  const selected =
    results.find((x) => String(x.id) === String(value)) ||
    items.find((x) => String(x.id) === String(value));
  const visible = useMemo(() => {
    const source = search ? results : items;
    const selectedItem = source.find((x) => String(x.id) === String(value));
    const merged = selectedItem
      ? source
      : [...(selected ? [selected] : []), ...source];
    const seen = new Set<string>();
    return merged
      .filter((x) => {
        const id = String(x.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 30);
  }, [items, results, search, selected, value]);
  if (total < 2) return null;
  return (
    <div className="public-program-picker" ref={ref}>
      <span className="public-picker-label">{t("selectInstance")}</span>
      <button
        type="button"
        className="public-program-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <strong>{selected?.name || t("selectInstance")}</strong>
          <small>{selected?.location || t("publicProgramChooseHelp")}</small>
        </span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="public-program-menu">
          <div className="public-program-search">
            <Search size={16} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchInstances")}
              aria-label={t("searchInstances")}
            />
          </div>
          {error && (
            <p className="error-text public-program-error" role="alert">
              {error}
            </p>
          )}
          <div
            className="public-program-options"
            role="listbox"
            aria-label={t("selectInstance")}
          >
            {visible.length ? (
              visible.map((item) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={String(item.id) === String(value)}
                  className={
                    String(item.id) === String(value) ? "selected" : ""
                  }
                  key={item.id}
                  onClick={() => {
                    onChange(String(item.id));
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span>
                    <strong>{item.name}</strong>
                    {item.location && <small>{item.location}</small>}
                  </span>
                  {String(item.id) === String(value) && <Check size={17} />}
                </button>
              ))
            ) : (
              <p className="muted public-program-empty">
                {searching ? t("searching") : t("noMatches")}
              </p>
            )}
          </div>
          {searching && (
            <p className="muted public-program-more">{t("searching")}</p>
          )}
          {!search && total > 30 && (
            <p className="muted public-program-more">
              {t("searchProgramsToNarrow")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
