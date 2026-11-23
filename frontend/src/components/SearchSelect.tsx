import { t } from "../i18n";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X } from "lucide-react";

type Option = { value: string | number; label: string; meta?: string };
export function SearchSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Choose",
  searchPlaceholder = "Search…",
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (
        open &&
        rootRef.current &&
        !rootRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement)?.closest(".search-select-menu")
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const selected = options.find((x) => String(x.value) === String(value));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? options.filter((x) =>
          `${x.label} ${x.meta || ""}`.toLowerCase().includes(q),
        )
      : options;
  }, [options, query]);
  const position = () => {
    const el = rootRef.current?.getBoundingClientRect();
    if (!el) return;
    const width = Math.min(Math.max(el.width, 280), 420);
    const left = Math.min(Math.max(8, el.left), window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - el.bottom;
    const openUp = spaceBelow < 300 && el.top > 300;
    setMenuStyle({
      position: "fixed",
      left,
      top: openUp ? "auto" : Math.min(el.bottom + 6, window.innerHeight - 320),
      bottom: openUp ? Math.max(8, window.innerHeight - el.top + 6) : "auto",
      width,
      maxHeight: Math.min(360, openUp ? el.top - 20 : spaceBelow - 20),
      zIndex: 1800,
    });
  };
  useEffect(() => {
    if (!open) return;
    position();
    const on = () => position();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [open]);
  const menu =
    open && !disabled && typeof document !== "undefined"
      ? createPortal(
          <div
            className="search-select-menu search-select-menu-portal"
            style={menuStyle}
            role="listbox"
          >
            <div className="search-select-search">
              <Search size={16} />
              <input
                autoFocus
                value={query}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="search-select-options">
              {filtered.length ? (
                filtered.map((x) => (
                  <button
                    type="button"
                    key={String(x.value)}
                    className={
                      String(x.value) === String(value) ? "selected" : ""
                    }
                    onClick={() => {
                      onChange(String(x.value));
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span>{x.label}</span>
                    {x.meta && <small>{x.meta}</small>}
                  </button>
                ))
              ) : (
                <div className="search-select-empty">{t("noMatches")}</div>
              )}
            </div>
            {value !== "" && (
              <button
                type="button"
                className="search-select-clear"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setQuery("");
                }}
              >
                <X size={14} /> {t("clearSelection")}
              </button>
            )}
          </div>,
          document.body,
        )
      : null;
  return (
    <div ref={rootRef} className={`search-select ${open ? "is-open" : ""}`}>
      <label>
        {label}
        <button
          type="button"
          className={`search-select-trigger ${open ? "open" : ""}`}
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={selected ? "" : "muted"}>
            {selected?.label || placeholder}
          </span>
          <ChevronDown size={17} />
        </button>
      </label>
      {menu}
    </div>
  );
}
