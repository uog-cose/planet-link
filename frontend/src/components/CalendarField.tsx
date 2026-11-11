import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { CalendarDays, Clock3, AlertCircle } from "lucide-react";
type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  withTime?: boolean;
  minDate?: Date;
  required?: boolean;
  error?: string;
  allowPast?: boolean;
};
const pad = (n: number) => String(n).padStart(2, "0");
const nowParts = () => {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};
const localParts = (value: string) => {
  if (value === "NOW") return nowParts();
  if (!value) return nowParts();
  const localMatch = String(value).match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/,
  );
  if (localMatch)
    return { date: localMatch[1], time: `${localMatch[2]}:${localMatch[3]}` };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, time: "09:00" };
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? { date: value.slice(0, 10), time: value.slice(11, 16) || "09:00" }
    : {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      };
};
const toDate = (date: string, time: string) => {
  if (!date) return "";
  const [h, m] = String(time || nowParts().time)
    .split(":")
    .map(Number);
  return `${date}T${pad(Number.isFinite(h) ? h : 9)}:${pad(Number.isFinite(m) ? m : 0)}`;
};
const dateLabel = (date: string) => {
  if (!date) return "Choose date";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB");
};
export function CalendarField({
  label,
  value,
  onChange,
  withTime = true,
  minDate = new Date(),
  required = false,
  error,
  allowPast = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const initial = localParts(value);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320 });
  useEffect(() => {
    const p = localParts(value);
    setDate(p.date);
    setTime(p.time);
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", escape);
    const positionPopover = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(340, window.innerWidth - 24);
      const left = Math.max(
        12,
        Math.min(r.left, window.innerWidth - width - 12),
      );
      const below = r.bottom + 8;
      const estimated = 520;
      const top =
        below + estimated <= window.innerHeight
          ? below
          : Math.max(12, r.top - estimated - 8);
      setPosition({ top, left, width });
    };
    positionPopover();
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, true);
    const close = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        document.getElementById("yq-calendar-popover")?.contains(target)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("resize", positionPopover);
      window.removeEventListener("scroll", positionPopover, true);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const selected = useMemo(
    () => (date ? new Date(`${date}T12:00:00`) : undefined),
    [date],
  );
  const today = useMemo(() => {
    const d = minDate;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, [minDate]);
  const validation =
    error ||
    (!allowPast &&
    withTime &&
    value !== "NOW" &&
    date &&
    time &&
    new Date(toDate(date, time)).getTime() < Date.now() - 60000
      ? "This date and time has already passed. Choose now or a future time."
      : !allowPast && !withTime && date && selected && selected < today
        ? "Choose today or a future date."
        : !allowPast && withTime && date && selected && selected < today
          ? "Choose today or a future date."
          : "");
  const update = (nextDate = date, nextTime = time) =>
    onChange(withTime ? toDate(nextDate, nextTime) : nextDate);
  function pick(d?: Date) {
    if (!d) return;
    const next = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    setDate(next);
    update(next, time);
  }
  const setClock = (next: string) => {
    setTime(next);
    update(date, next);
  };
  const addMinutes = (base: string, minutes: number) => {
    const [h, m] = base.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m + minutes, 0, 0);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            id="yq-calendar-popover"
            className="calendar-popover calendar-popover-portal"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
          >
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={pick}
              disabled={allowPast ? undefined : { before: today }}
            />
            {withTime && (
              <div className="calendar-time-picker" aria-label="Choose time">
                <div className="calendar-time-row">
                  <Clock3 size={16} />
                  <input
                    aria-label="Time"
                    type="time"
                    step="300"
                    value={time}
                    onChange={(e) => setClock(e.target.value)}
                  />
                </div>
                <div className="calendar-time-quick">
                  <button
                    type="button"
                    onClick={() => {
                      const n = nowParts();
                      setDate(n.date);
                      setTime(n.time);
                      onChange("NOW");
                    }}
                  >
                    Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setClock(addMinutes(nowParts().time, 15))}
                  >
                    +15 min
                  </button>
                  <button
                    type="button"
                    onClick={() => setClock(addMinutes(nowParts().time, 60))}
                  >
                    +1 hour
                  </button>
                </div>
              </div>
            )}
            <div className="calendar-popover-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;
  return (
    <div ref={rootRef} className={`calendar-field ${open ? "is-open" : ""}`}>
      <label>
        {label}
        {required && <span aria-hidden="true"> *</span>}
        <button
          ref={buttonRef}
          type="button"
          aria-invalid={Boolean(validation)}
          className={`calendar-input ${validation ? "invalid" : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <CalendarDays size={19} />
          <span>
            {value === "NOW" ? "Now" : dateLabel(date)}
            {withTime && date && value !== "NOW" ? <small>{time}</small> : null}
          </span>
          <Clock3 size={17} className="calendar-clock" />
        </button>
      </label>
      {popover}
      {validation && (
        <p className="field-error">
          <AlertCircle size={14} />
          {validation}
        </p>
      )}
    </div>
  );
}
