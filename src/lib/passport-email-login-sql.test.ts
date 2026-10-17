import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations-passport-email-login/apply.sql", "utf8");

describe("email passport lookup SQL", () => {
  it("resolves crypto in the installed extensions schema under the locked search path", () => {
    expect(sql).toContain("set search_path = public");
    expect(sql.match(/extensions\.digest\(/g)).toHaveLength(2);
    expect(sql.match(/extensions\.gen_random_bytes\(/g)).toHaveLength(1);
    expect(sql).not.toMatch(/(?<![\w.])(?:digest|gen_random_bytes)\(/);
  });

  it("matches the existing passport by event and email without reassigning points", () => {
    expect(sql).toContain("p.visitor_id = v.id and p.event_id = v.event_id");
    expect(sql).toContain("v.event_id = _event_id and v.email = _email");
    expect(sql).not.toMatch(/(?:insert into|update|delete from)\s+public\.(?:check_ins|participant_point_awards)\b/i);
  });
});