import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isBelowTarget, publishToken, PowTimeout, solveChallenge, verifyNonce } from "./pow";

/** Лёгкая цель: подбирается за доли секунды, а проверяет ту же логику. */
const EASY = "0fff000000000000000000000000000000000000000000000000000000000000";

describe("сравнение с целью", () => {
  it("сравнивает побайтово, старший байт первый", () => {
    expect(isBelowTarget(new Uint8Array([0x00, 0xff]), new Uint8Array([0x01, 0x00]))).toBe(true);
    expect(isBelowTarget(new Uint8Array([0x01, 0x00]), new Uint8Array([0x00, 0xff]))).toBe(false);
  });

  it("равные не меньше", () => {
    expect(isBelowTarget(new Uint8Array([0x10]), new Uint8Array([0x10]))).toBe(false);
  });
});

describe("подбор nonce", () => {
  it("находит решение, которое проходит проверку", () => {
    const challenge = { prefix: "проверка", target: EASY };
    const nonce = solveChallenge(challenge, { timeoutMs: 20_000 });

    expect(verifyNonce(challenge.prefix, challenge.target, nonce)).toBe(true);

    // И это именно то, что требует LRCLIB: SHA-256 от prefix+nonce меньше цели.
    const hash = createHash("sha256").update(`${challenge.prefix}${nonce}`).digest();
    expect(hash[0]).toBeLessThan(0x0f);
  });

  it("неверный nonce проверку не проходит", () => {
    expect(verifyNonce("проверка", EASY, "не-решение")).toBe(false);
  });

  it("сдаётся по времени, а не считает вечно", () => {
    const impossible = `0000000000000000000000000000000000000000000000000000000000000001`;
    expect(() => solveChallenge({ prefix: "x", target: impossible }, { timeoutMs: 60 })).toThrow(
      PowTimeout,
    );
  });

  it("битую цель не берёт", () => {
    expect(() => solveChallenge({ prefix: "x", target: "не hex" })).toThrow();
  });

  it("собирает заголовок в том виде, в каком его ждут", () => {
    expect(publishToken("префикс", "42")).toBe("префикс:42");
  });
});
