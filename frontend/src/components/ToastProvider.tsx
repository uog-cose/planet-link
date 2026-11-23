import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Toast } from "./Toast";

type Tone = "success" | "error" | "info" | "warning";
type ToastItem = { id: number; message: string; tone: Tone };
const ToastContext = createContext<{
  show: (message: string, tone?: Tone) => void;
}>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, message, tone }]);
    window.setTimeout(
      () => setItems((x) => x.filter((i) => i.id !== id)),
      3800,
    );
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      <>{children}</>
      <div className="toast-stack">
        {items.map((x) => (
          <Toast
            key={x.id}
            message={x.message}
            tone={x.tone}
            onDismiss={() =>
              setItems((items) => items.filter((i) => i.id !== x.id))
            }
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  return useContext(ToastContext);
}
