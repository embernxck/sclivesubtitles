"use client";

/**
 * Клиентская сторона: кто мы такие и как разговариваем с сервером.
 *
 * Аккаунтов нет. Браузер заводит себе случайный ключ, шлёт его заголовком —
 * этого хватает, чтобы сервер узнавал «свой» текст и считал голос один раз.
 * Ключ никуда, кроме нашего же сервера, не уходит.
 */

const STORAGE_KEY = "sclive.key";

export function clientKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const created = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Приватное окно или запрет на хранилище: живём без опознания.
    return "";
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-sclive-key": clientKey(),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Ошибка ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

/** Имя, которым подписываются тексты. Помним его между заходами. */
export function savedAuthorName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem("sclive.name") ?? "";
  } catch {
    return "";
  }
}

export function rememberAuthorName(name: string): void {
  try {
    window.localStorage.setItem("sclive.name", name);
  } catch {
    // ничего страшного
  }
}
