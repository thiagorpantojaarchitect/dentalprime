import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { isScheduleConflictDatabaseError } from "./repositories.js";

const MIGRATION = fileURLToPath(
  new URL("../../drizzle/0001_tiresome_mentor.sql", import.meta.url),
);

describe("garantia atomica de agenda no PostgreSQL", () => {
  it("traduz exclusion_violation para conflito de agenda", () => {
    expect(isScheduleConflictDatabaseError({ code: "23P01" })).toBe(true);
    expect(
      isScheduleConflictDatabaseError({
        name: "DrizzleQueryError",
        cause: { code: "23P01" },
      }),
    ).toBe(true);
    expect(isScheduleConflictDatabaseError({ code: "23505" })).toBe(false);
    expect(isScheduleConflictDatabaseError({ cause: { cause: { code: "23505" } } })).toBe(
      false,
    );
  });

  it("mantem constraints de exclusao para provider e recurso", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain('CONSTRAINT "appointment_provider_no_overlap" EXCLUDE');
    expect(sql).toContain('CONSTRAINT "appointment_resource_no_overlap" EXCLUDE');
    expect(sql).toContain('"allow_overbooking" = false');
    expect(sql).toContain("tstzrange");
  });
});
