import { Check } from "lucide-react";
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`theme-toggle ${checked ? "on" : ""} ${disabled ? "disabled" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="theme-toggle-track">
        <span className="theme-toggle-thumb">
          {checked && <Check size={13} />}
        </span>
      </span>
      <span className="theme-toggle-copy">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </button>
  );
}
