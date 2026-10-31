import { DatabaseSync } from 'node:sqlite';

import { LATEST_SCHEMA_VERSION, migrations, pendingMigrations } from '../migrations';

/** Applies migrations the same way database.ts does, but on Node's SQLite. */
function openMigrated(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  const { user_version } = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  for (const m of pendingMigrations(user_version)) {
    db.exec('BEGIN;');
    db.exec(m.sql);
    db.exec(`PRAGMA user_version = ${m.version};`);
    db.exec('COMMIT;');
  }
  return db;
}

const NOW = '2026-10-27T08:00:00.000Z';

function seedProfileAndProvider(db: DatabaseSync) {
  db.prepare(
    `INSERT INTO profiles (id, display_name, patient_reference, is_default, created_at, updated_at)
     VALUES ('p1', 'Demo', 'AB-1970', 1, ?, ?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO providers (id, profile_id, kind, name, email, created_at, updated_at)
     VALUES ('prov1', 'p1', 'practice', 'Praxis Demo', 'praxis@example.invalid', ?, ?)`,
  ).run(NOW, NOW);
}

function seedMedication(db: DatabaseSync, id = 'm1') {
  db.prepare(
    `INSERT INTO medications (id, profile_id, name, is_critical, safety_buffer_days, preferred_provider_id, created_at, updated_at)
     VALUES (?, 'p1', 'Demo Med 1 mg', 1, 42, 'prov1', ?, ?)`,
  ).run(id, NOW, NOW);
}

describe('migration list', () => {
  it('has strictly increasing versions starting at 1', () => {
    expect(migrations[0].version).toBe(1);
    for (let i = 1; i < migrations.length; i++) {
      expect(migrations[i].version).toBe(migrations[i - 1].version + 1);
    }
    expect(LATEST_SCHEMA_VERSION).toBe(migrations[migrations.length - 1].version);
  });

  it('returns nothing to do for an up-to-date database', () => {
    expect(pendingMigrations(LATEST_SCHEMA_VERSION)).toEqual([]);
  });

  it('refuses a database newer than the app', () => {
    expect(() => pendingMigrations(LATEST_SCHEMA_VERSION + 1)).toThrow(/newer/);
  });
});

describe('incremental migration', () => {
  it('upgrades a v1 database to the latest version without touching v1 data', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    const [v1] = migrations;
    db.exec('BEGIN;');
    db.exec(v1.sql);
    db.exec('PRAGMA user_version = 1;');
    db.exec('COMMIT;');
    seedProfileAndProvider(db);

    for (const m of pendingMigrations(1)) {
      db.exec('BEGIN;');
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version};`);
      db.exec('COMMIT;');
    }

    expect(db.prepare('PRAGMA user_version;').get()).toEqual({ user_version: LATEST_SCHEMA_VERSION });
    expect(db.prepare('SELECT count(*) AS n FROM profiles').get()).toEqual({ n: 1 });
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_settings'`).get()).toEqual({ name: 'app_settings' });
    const columns = (db.prepare('PRAGMA table_info(reorder_requests)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['note', 'language', 'message_subject', 'message_body', 'expected_by']));
    db.close();
  });
});

describe('schema v1', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openMigrated();
  });

  afterEach(() => {
    db.close();
  });

  it('applies cleanly and sets user_version', () => {
    expect(db.prepare('PRAGMA user_version;').get()).toEqual({ user_version: LATEST_SCHEMA_VERSION });
    const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual([
      'app_settings',
      'dose_schedules',
      'medications',
      'packs',
      'prescriptions',
      'profiles',
      'providers',
      'reorder_requests',
      'shortage_entries',
      'shortage_matches',
    ]);
  });

  it('enforces foreign keys', () => {
    expect(() =>
      db
        .prepare(`INSERT INTO medications (id, profile_id, name, created_at, updated_at) VALUES ('m1', 'missing', 'X', ?, ?)`)
        .run(NOW, NOW),
    ).toThrow(/FOREIGN KEY/);
  });

  it('cascades medication deletion to supply rows', () => {
    seedProfileAndProvider(db);
    seedMedication(db);
    db.prepare(
      `INSERT INTO dose_schedules (id, medication_id, units_per_intake, intakes_per_period, period, valid_from, created_at)
       VALUES ('d1', 'm1', 1, 2, 'day', '2026-10-01', ?)`,
    ).run(NOW);
    db.prepare(
      `INSERT INTO packs (id, medication_id, units_per_pack, units_remaining, created_at, updated_at)
       VALUES ('pk1', 'm1', 100, 60, ?, ?)`,
    ).run(NOW, NOW);
    db.prepare(
      `INSERT INTO prescriptions (id, medication_id, provider_id, type, issued_at, valid_until, created_at, updated_at)
       VALUES ('rx1', 'm1', 'prov1', 'standing', '2026-09-01', '2026-12-01', ?, ?)`,
    ).run(NOW, NOW);

    db.prepare(`DELETE FROM medications WHERE id = 'm1'`).run();

    for (const table of ['dose_schedules', 'packs', 'prescriptions']) {
      expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
  });

  it('keeps the medication when its preferred provider is deleted', () => {
    seedProfileAndProvider(db);
    seedMedication(db);
    db.prepare(`DELETE FROM providers WHERE id = 'prov1'`).run();
    expect(db.prepare(`SELECT preferred_provider_id FROM medications WHERE id = 'm1'`).get()).toEqual({
      preferred_provider_id: null,
    });
  });

  it('blocks deleting a provider that has reorder requests', () => {
    seedProfileAndProvider(db);
    seedMedication(db);
    db.prepare(
      `INSERT INTO reorder_requests (id, medication_id, provider_id, quantity_packs, created_at, updated_at)
       VALUES ('r1', 'm1', 'prov1', 1, ?, ?)`,
    ).run(NOW, NOW);
    expect(() => db.prepare(`DELETE FROM providers WHERE id = 'prov1'`).run()).toThrow(/FOREIGN KEY/);
  });

  it('rejects invalid enum values and negative quantities', () => {
    seedProfileAndProvider(db);
    seedMedication(db);
    const bad = [
      `INSERT INTO reorder_requests (id, medication_id, provider_id, status, quantity_packs, created_at, updated_at)
       VALUES ('r1', 'm1', 'prov1', 'shipped', 1, '${NOW}', '${NOW}')`,
      `INSERT INTO reorder_requests (id, medication_id, provider_id, quantity_packs, created_at, updated_at)
       VALUES ('r2', 'm1', 'prov1', 0, '${NOW}', '${NOW}')`,
      `INSERT INTO packs (id, medication_id, units_per_pack, units_remaining, created_at, updated_at)
       VALUES ('pk1', 'm1', 100, -1, '${NOW}', '${NOW}')`,
      `INSERT INTO dose_schedules (id, medication_id, units_per_intake, intakes_per_period, period, valid_from, created_at)
       VALUES ('d1', 'm1', 1, 1, 'month', '2026-10-01', '${NOW}')`,
      `INSERT INTO providers (id, profile_id, kind, name, created_at, updated_at)
       VALUES ('prov2', 'p1', 'hospital', 'X', '${NOW}', '${NOW}')`,
      `INSERT INTO medications (id, profile_id, name, is_critical, created_at, updated_at)
       VALUES ('m2', 'p1', 'X', 2, '${NOW}', '${NOW}')`,
    ];
    for (const sql of bad) {
      expect(() => db.exec(sql)).toThrow(/CHECK constraint/);
    }
  });

  it('applies the documented defaults', () => {
    seedProfileAndProvider(db);
    db.prepare(`INSERT INTO medications (id, profile_id, name, created_at, updated_at) VALUES ('m1', 'p1', 'X', ?, ?)`).run(NOW, NOW);
    expect(db.prepare(`SELECT is_critical, safety_buffer_days FROM medications WHERE id = 'm1'`).get()).toEqual({
      is_critical: 0,
      safety_buffer_days: 14,
    });
    expect(db.prepare(`SELECT default_lead_time_days FROM providers WHERE id = 'prov1'`).get()).toEqual({
      default_lead_time_days: 7,
    });
  });

  it('prevents duplicate shortage matches per medication, source and code', () => {
    seedProfileAndProvider(db);
    seedMedication(db);
    const insert = db.prepare(
      `INSERT INTO shortage_matches (id, medication_id, source, product_code, detected_at) VALUES (?, 'm1', 'simulated', '7680123456789', ?)`,
    );
    insert.run('s1', NOW);
    expect(() => insert.run('s2', NOW)).toThrow(/UNIQUE/);
  });
});
