import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations-passport-email-login/apply.sql", "utf8");

describe("email passport lookup SQL", () => {
  it("uses only built-in hashing so it never fails on where the crypto extension lives", () => {
    expect(sql).toContain("set search_path = public");
    expect(sql).not.toMatch(/\bdigest\(|gen_random_bytes\(/);
    expect(sql).toContain("set access_token_hash = sha256(convert_to(v_raw, 'UTF8'))");
  });

  it("matches the existing passport by event and email (any case) without reassigning points", () => {
    expect(sql).toContain("p.visitor_id = v.id and p.event_id = v.event_id");
    expect(sql).toContain("lower(v.email::text) = lower(btrim(_email::text))");
    expect(sql).not.toMatch(/(?:insert into|update|delete from)\s+public\.(?:check_ins|participant_point_awards)\b/i);
  });

  it("lets the public Join page call the lookup like sign-up", () => {
    expect(sql).toContain("to anon, authenticated, service_role");
  });
});