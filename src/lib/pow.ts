/**
 * Доказательство работы для публикации в LRCLIB.
 *
 * Чтобы принять текст, LRCLIB просит решить задачку: подобрать `nonce`, при
 * котором SHA-256 от `prefix + nonce` численно меньше выданной цели. Так
 * ботам дорого засорять базу, а живому человеку это несколько секунд.
 *
 * Считаем на сервере: у телефона на это уйдёт заметно больше, а нам не жалко.
 */

import { createHash } from "node:crypto";

export type Challenge = {
  prefix: string;
  /** 32 байта в hex. */
  target: string;
};

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[index] = byte;
  }
  return bytes;
}

/** Меньше ли свёртка, чем цель. Сравнение побайтовое, старший байт первый. */
export function isBelowTarget(hash: Uint8Array, target: Uint8Array): boolean {
  const length = Math.min(hash.length, target.length);
  for (let index = 0; index < length; index += 1) {
    if (hash[index] !== target[index]) return hash[index] < target[index];
  }
  return false;
}

export function verifyNonce(prefix: string, target: string, nonce: string): boolean {
  const bytes = hexToBytes(target);
  if (!bytes) return false;
  const hash = createHash("sha256").update(`${prefix}${nonce}`).digest();
  return isBelowTarget(new Uint8Array(hash), bytes);
}

export type SolveOptions = {
  /** Сколько максимум считать, миллисекунды. По истечении — отказ. */
  timeoutMs?: number;
  /** С какого числа начинать перебор. Пригодится в тестах. */
  start?: number;
};

export class PowTimeout extends Error {
  constructor(attempts: number) {
    super(`не уложились в отведённое время, попыток: ${attempts}`);
    this.name = "PowTimeout";
  }
}

/** Подбирает `nonce`. Возвращает его строкой — именно так его ждёт сервер. */
export function solveChallenge(challenge: Challenge, options: SolveOptions = {}): string {
  const { timeoutMs = 30_000, start = 0 } = options;
  const target = hexToBytes(challenge.target);
  if (!target) throw new Error("цель задачи не разобралась");

  const deadline = Date.now() + timeoutMs;
  let nonce = start;

  for (;;) {
    // Время смотрим редко: `Date.now()` на каждой итерации съедает больше,
    // чем сама свёртка.
    if ((nonce & 0x3fff) === 0 && Date.now() > deadline) {
      throw new PowTimeout(nonce - start);
    }
    const hash = createHash("sha256").update(`${challenge.prefix}${nonce}`).digest();
    if (isBelowTarget(new Uint8Array(hash), target)) return String(nonce);
    nonce += 1;
  }
}

/** Заголовок `X-Publish-Token`, который ждёт LRCLIB. */
export function publishToken(prefix: string, nonce: string): string {
  return `${prefix}:${nonce}`;
}
