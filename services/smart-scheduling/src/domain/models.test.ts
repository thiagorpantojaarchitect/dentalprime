import { describe, it, expect } from "vitest";
import { intervalsOverlap } from "./models.js";

const d = (iso: string): Date => new Date(iso);

describe("intervalsOverlap", () => {
  it("detecta sobreposicao parcial", () => {
    expect(
      intervalsOverlap(
        d("2026-01-01T09:00:00Z"),
        d("2026-01-01T10:00:00Z"),
        d("2026-01-01T09:30:00Z"),
        d("2026-01-01T10:30:00Z"),
      ),
    ).toBe(true);
  });

  it("intervalos adjacentes nao se sobrepoem", () => {
    expect(
      intervalsOverlap(
        d("2026-01-01T09:00:00Z"),
        d("2026-01-01T10:00:00Z"),
        d("2026-01-01T10:00:00Z"),
        d("2026-01-01T11:00:00Z"),
      ),
    ).toBe(false);
  });

  it("intervalos disjuntos nao se sobrepoem", () => {
    expect(
      intervalsOverlap(
        d("2026-01-01T09:00:00Z"),
        d("2026-01-01T10:00:00Z"),
        d("2026-01-01T11:00:00Z"),
        d("2026-01-01T12:00:00Z"),
      ),
    ).toBe(false);
  });

  it("um intervalo contido no outro se sobrepoe", () => {
    expect(
      intervalsOverlap(
        d("2026-01-01T09:00:00Z"),
        d("2026-01-01T12:00:00Z"),
        d("2026-01-01T10:00:00Z"),
        d("2026-01-01T11:00:00Z"),
      ),
    ).toBe(true);
  });
});
