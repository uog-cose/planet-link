import { CONFIG } from "./config";
export function csrfCookie() {
  return (
    document.cookie
      .split("; ")
      .find((x) => x.startsWith("csrftoken="))
      ?.split("=")[1] || ""
  );
}
export function hasClientSessionCookie() {
  return Boolean(csrfCookie());
}
let refreshing: Promise<boolean> | null = null;
let clientAuthenticated = false;
export function setClientAuthenticated(value: boolean) {
  clientAuthenticated = value;
}
const LOGGED_OUT_ALLOWED_PREFIXES = [
  "/auth/",
  "/csrf/",
  "/public/",
  "/attendance/scan/",
  "/auth/password-reset/",
];
function isLoggedOutAllowed(path: string) {
  return LOGGED_OUT_ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function refreshSession() {
  return refreshSessionInternal();
}
async function refreshSessionInternal() {
  if (!refreshing) {
    refreshing = fetch(`${CONFIG.apiUrl}/auth/refresh/`, {
      method: "POST",
      credentials: "include",
      headers: {
        "X-CSRFToken": decodeURIComponent(csrfCookie()),
        "Content-Type": "application/json",
      },
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

function apiError(message: string, status: number, path?: string) {
  const err = Object.assign(new Error(message), { status });
  if (path !== "/attendance/scan/")
    window.dispatchEvent(
      new CustomEvent("yq-api-error", {
        detail: { message, status, path: location.pathname },
      }),
    );
  return err;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
  idempotencyKey?: string,
): Promise<T> {
  if (!clientAuthenticated && !isLoggedOutAllowed(path)) {
    const err = Object.assign(new Error("Authentication required"), {
      status: 401,
      silent: true,
    });
    throw err;
  }
  const method = (options.method || "GET").toString().toUpperCase();
  const headers = new Headers(options.headers);
  if (method !== "GET")
    headers.set("X-CSRFToken", decodeURIComponent(csrfCookie()));
  if (
    method !== "GET" &&
    !["/auth/login/", "/auth/refresh/", "/auth/logout/", "/csrf/"].includes(
      path,
    )
  )
    headers.set("X-Idempotency-Key", idempotencyKey || crypto.randomUUID());
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const requestOptions: RequestInit = {
    ...options,
    credentials: "include",
    headers,
  };
  if (method === "GET" && !options.cache) requestOptions.cache = "no-store";
  let r: Response;
  try {
    r = await fetch(`${CONFIG.apiUrl}${path}`, requestOptions);
  } catch (error) {
    if (
      method !== "GET" &&
      !retried &&
      !["/auth/login/", "/auth/refresh/", "/auth/logout/", "/csrf/"].includes(
        path,
      )
    ) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return api<T>(path, options, true, idempotencyKey);
    }
    throw error;
  }
  if (
    r.status === 401 &&
    !retried &&
    path !== "/auth/refresh/" &&
    path !== "/auth/login/" &&
    path !== "/auth/logout/" &&
    path !== "/auth/password-reset/" &&
    path !== "/auth/me/"
  ) {
    if (!hasClientSessionCookie()) {
      if (location.pathname !== "/login") location.replace("/login");
      throw Object.assign(new Error("Authentication required"), {
        status: 401,
      });
    }
    if (await refreshSession())
      return api<T>(path, options, true, idempotencyKey);
    if (location.pathname !== "/login") location.replace("/login");
  }
  if (!r.ok) {
    if ([502, 503, 504].includes(r.status) && method !== "GET" && !retried) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return api<T>(path, options, true, idempotencyKey);
    }
    const payload = await r
      .json()
      .catch(() => ({
        detail:
          r.status >= 500
            ? "The server could not complete that request."
            : "Request failed",
      }));
    throw apiError(payload.detail || "Request failed", r.status, path);
  }
  const contentType = r.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw apiError("The server returned an unexpected response.", r.status);
  }
  try {
    return (await r.json()) as Promise<T>;
  } catch {
    throw apiError("The server returned invalid data.", r.status || 200);
  }
}
export const getCsrf = () => api<{ csrfToken: string }>("/csrf/");

export async function apiForm<T>(
  path: string,
  form: FormData,
  idempotencyKey = crypto.randomUUID(),
  retried = false,
): Promise<T> {
  const headers = new Headers({
    "X-CSRFToken": decodeURIComponent(csrfCookie()),
    "X-Idempotency-Key": idempotencyKey,
  });
  let r: Response;
  try {
    r = await fetch(`${CONFIG.apiUrl}${path}`, {
      method: "POST",
      credentials: "include",
      headers,
      body: form,
    });
  } catch (error) {
    if (!retried) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return apiForm<T>(path, form, idempotencyKey, true);
    }
    throw error;
  }
  if (!r.ok) {
    if ([502, 503, 504].includes(r.status) && !retried) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return apiForm<T>(path, form, idempotencyKey, true);
    }
    const payload = await r
      .json()
      .catch(() => ({
        detail:
          r.status >= 500
            ? "The server could not complete that request."
            : "Request failed",
      }));
    throw apiError(payload.detail || "Request failed", r.status);
  }
  try {
    return (await r.json()) as Promise<T>;
  } catch {
    throw apiError("The server returned invalid data.", r.status || 200);
  }
}
