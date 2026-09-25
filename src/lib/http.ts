/**
 * Мелочи, общие для всех обработчиков API.
 */

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Кто это сделал — без аккаунтов.
 *
 * Браузер заводит себе случайный ключ и шлёт его заголовком. Мы храним только
 * свёртку: её хватает, чтобы узнать «свой» текст и посчитать голос один раз,
 * но по ней нельзя ни войти куда-то, ни опознать человека.
 */
export function clientKey(request: Request): string {
  const raw =
    request.headers.get("x-sclive-key") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "аноним";
  return createHash("sha256").update(`sclive:${raw}`).digest("hex").slice(0, 32);
}

/** Тело запроса как JSON. Не разобралось — `null`, а не исключение. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
