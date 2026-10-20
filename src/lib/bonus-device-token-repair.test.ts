import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repair = readFileSync('supabase/migrations-prod-bonus-device-token-repair/apply.sql', 'utf8');
const deviceMigration = readFileSync('supabase/migrations-passport-device-tokens/apply.sql', 'utf8');
const functionBody = (sql: string) => sql.slice(sql.indexOf('create or replace function public.claim_bonus_code('), sql.indexOf('\n$$;', sql.indexOf('create or replace function public.claim_bonus_code(')) + 4);
const db = new PGlite();
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const claim = async (qr: string, token = 'original-token') => (await db.query<{ success: boolean; already_collected: boolean; points_awarded: number; message: string }>('select * from public.claim_bonus_code($1,$2)', [qr, token])).rows[0];

beforeAll(async () => {
  await db.exec(`
    create table events(id uuid primary key, agency_id uuid, status text);
    create table event_bonus_codes(id uuid primary key, agency_id uuid, event_id uuid, name text, points_value int, is_active boolean, qr_code_token text);
    create table event_bonus_code_venues(id uuid primary key, agency_id uuid, event_id uuid, bonus_code_id uuid, venue_id uuid, is_active boolean, qr_code_token text);
    create table passports(id uuid primary key, agency_id uuid, event_id uuid, access_token_hash bytea);
    create table passport_device_tokens(passport_id uuid, token_hash bytea);
    create table participant_point_awards(agency_id uuid, event_id uuid, participant_id uuid, award_type text, source_id uuid, points_awarded int, metadata jsonb);
    create unique index participant_point_awards_unique_source on participant_point_awards(event_id,participant_id,award_type,source_id) where source_id is not null;
    create function resolve_passport_id_by_token(_raw text) returns uuid language sql stable as $$
      select id from passports where access_token_hash = sha256(convert_to(_raw,'UTF8'))
      union all select passport_id from passport_device_tokens where token_hash = sha256(convert_to(_raw,'UTF8')) limit 1
    $$;
    insert into events values ('${id(1)}','${id(2)}','published');
    insert into passports values ('${id(3)}','${id(2)}','${id(1)}',sha256(convert_to('original-token','UTF8'))),('${id(9)}','${id(8)}','${id(7)}',sha256(convert_to('other-event','UTF8')));
    insert into passport_device_tokens values ('${id(3)}',sha256(convert_to('device-A','UTF8'))),('${id(3)}',sha256(convert_to('device-B','UTF8')));
    insert into event_bonus_codes values ('${id(4)}','${id(2)}','${id(1)}','Bonus',50,true,'event-qr');
    insert into event_bonus_code_venues values ('${id(5)}','${id(2)}','${id(1)}','${id(4)}','${id(6)}',true,'venue-qr');
  `);
  await db.exec(repair);
}, 30000);
afterAll(async () => { await db.close(); });

describe('actual PostgreSQL bonus repair', () => {
  it('device migration cannot overwrite the venue-aware repair', () => {
    expect(functionBody(deviceMigration)).toBe(functionBody(repair));
  });
  it('event-wide original token awards once using parent source', async () => {
    expect(await claim('event-qr')).toMatchObject({ success: true, already_collected: false, points_awarded: 50 });
    expect((await db.query('select source_id from participant_point_awards')).rows).toEqual([{ source_id: id(4) }]);
  });
  it('per-venue device A awards once using child source and venue metadata', async () => {
    expect(await claim('venue-qr', 'device-A')).toMatchObject({ success: true, already_collected: false, points_awarded: 50 });
    const rows = (await db.query('select source_id,metadata from participant_point_awards where source_id=$1', [id(5)])).rows;
    expect(rows).toEqual([{ source_id: id(5), metadata: { venue_id: id(6), bonus_code_id: id(4), bonus_code_name: 'Bonus' } }]);
  });
  it('A/B/original aliases cannot duplicate either source award', async () => {
    for (const token of ['device-A', 'device-B', 'original-token', 'device-A']) {
      for (const qr of ['venue-qr', 'event-qr']) {
        expect(await claim(qr, token)).toMatchObject({ success: true, already_collected: true, points_awarded: 0 });
      }
    }
    expect((await db.query('select count(*)::int as n from participant_point_awards')).rows).toEqual([{ n: 2 }]);
  });
  it('rejects inactive parent, inactive child, unpublished event and tenant mismatch without awards', async () => {
    await db.exec('begin');
    try {
      await db.exec('update event_bonus_codes set is_active=false');
      expect(await claim('venue-qr')).toMatchObject({ success: false, message: 'This bonus code is no longer active.' });
      expect(await claim('event-qr')).toMatchObject({ success: false });
      await db.exec('update event_bonus_codes set is_active=true; update event_bonus_code_venues set is_active=false');
      expect(await claim('venue-qr')).toMatchObject({ success: false });
      await db.exec("update event_bonus_code_venues set is_active=true; update events set status='draft'");
      expect(await claim('venue-qr')).toMatchObject({ success: false, message: 'This event is not currently live.' });
      await db.exec("update events set status='published'");
      expect(await claim('venue-qr', 'other-event')).toMatchObject({ success: false, message: 'This bonus code is for a different event.' });
      expect(await claim('venue-qr', 'invalid')).toMatchObject({ success: false, message: 'Passport not found.' });
      expect(await claim('unknown')).toMatchObject({ success: false, message: 'Bonus code not found.' });
      expect((await db.query('select count(*)::int as n from participant_point_awards')).rows).toEqual([{ n: 2 }]);
    } finally { await db.exec('rollback'); }
  });
});
