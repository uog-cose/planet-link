import React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Home,
  LockKeyhole,
  RefreshCw,
  SearchX,
  WifiOff,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { t } from "../../i18n";
import { Button, Card } from "../ui";

export type AppErrorKind = "404" | "403" | "network" | "500" | "generic";

const config: Record<AppErrorKind, { icon: any; title: string; body: string }> =
  {
    "404": { icon: SearchX, title: "notFoundTitle", body: "notFoundBody" },
    "403": {
      icon: LockKeyhole,
      title: "forbiddenError",
      body: "forbiddenError",
    },
    network: { icon: WifiOff, title: "errorTitle", body: "networkError" },
    "500": { icon: AlertTriangle, title: "errorTitle", body: "serverError" },
    generic: { icon: AlertTriangle, title: "errorTitle", body: "errorBody" },
  };

export function ErrorPage({
  kind = "generic",
  status,
  onRetry,
  homePath,
}: {
  kind?: AppErrorKind;
  status?: number;
  onRetry?: () => void;
  homePath?: string;
}) {
  const nav = useNavigate();
  const c = config[kind];
  const Icon = c.icon;
  return (
    <main className="error-page" role="main">
      <Card className="error-card">
        <div className="error-illustration" aria-hidden="true">
          <Icon size={42} />
        </div>
        <span className="eyebrow">
          {status ||
            (kind === "404" ? "404" : kind === "403" ? "403" : "ERROR")}
        </span>
        <h1>{t(c.title as any)}</h1>
        <p>{t(c.body as any)}</p>
        <div className="error-actions">
          {onRetry && (
            <Button icon={RefreshCw} onClick={onRetry}>
              {t("tryAgain")}
            </Button>
          )}
          <Button variant="secondary" icon={ArrowLeft} onClick={() => nav(-1)}>
            {t("goBack")}
          </Button>
          <Button
            variant="ghost"
            icon={Home}
            onClick={() => nav(homePath || "/")}
          >
            {t("goHome")}
          </Button>
        </div>
      </Card>
    </main>
  );
}

export class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <ErrorPage kind="500" onRetry={() => window.location.reload()} />
    ) : (
      this.props.children
    );
  }
}
