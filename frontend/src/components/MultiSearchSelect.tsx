import { t } from "../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
type Option = { value: string | number; label: string; meta?: string };
export function MultiSearchSelect({
  label,
  values,
  onChange,
  options,
  placeholder = "Choose players",
  searchPlaceholder = "Search…",
  disabled = false,
}: {
  label: string;
  values: Array<string | number>;
  onChange: (v: string[]) => void;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (
        open &&
        rootRef.current &&
        !rootRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const selected = new Set(values.map(String));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? options.filter((x) =>
          `${x.label} ${x.meta || ""}`.toLowerCase().includes(q),
        )
      : options;
  }, [options, query]);
  const toggle = (v: string) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(options.map((x) => String(x.value)).filter((x) => next.has(x)));
  };
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((x) => selected.has(String(x.value)));
  return (
    <div
      ref={rootRef}
      className={`search-select multi-search-select ${open ? "is-open" : ""}`}
    >
      <label>
        {label}
        <button
          type="button"
          className={`search-select-trigger ${open ? "open" : ""}`}
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={values.length ? "" : "muted"}>
            {values.length ? `${values.length} selected` : placeholder}
          </span>
          <ChevronDown size={17} />
        </button>
      </label>
      {open && !disabled && (
        <div className="search-select-menu">
          <div className="search-select-search">
            <Search size={16} />
            <input
              autoFocus
              value={query}
              placeholder={searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="multi-select-actions">
            <button
              type="button"
              onClick={() => {
                if (allFilteredSelected) {
                  onChange(
                    values
                      .map(String)
                      .filter(
                        (v) => !filtered.some((x) => String(x.value) === v),
                      ),
                  );
                } else {
                  onChange(
                    Array.from(
                      new Set([
                        ...values.map(String),
                        ...filtered.map((x) => String(x.value)),
                      ]),
                    ),
                  );
                }
              }}
            >
              {allFilteredSelected ? "Clear visible" : "Select all"}
            </button>
            <span>{values.length} selected</span>
          </div>
          <div className="search-select-options">
            {filtered.length ? (
              filtered.map((x) => {
                const checked = selected.has(String(x.value));
                return (
                  <button
                    type="button"
                    key={String(x.value)}
                    className={checked ? "selected" : ""}
                    onClick={() => toggle(String(x.value))}
                  >
                    <span>
                      <Check size={15} style={{ opacity: checked ? 1 : 0 }} />
                      {x.label}
                    </span>
                    {x.meta && <small>{x.meta}</small>}
                  </button>
                );
              })
            ) : (
              <div className="search-select-empty">{t("noMatches")}</div>
            )}
          </div>
          {values.length > 0 && (
            <button
              type="button"
              className="search-select-clear"
              onClick={() => {
                onChange([]);
                setOpen(false);
                setQuery("");
              }}
            >
              <X size={14} /> {t("clearSelection")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
