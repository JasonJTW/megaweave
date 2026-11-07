//* 測試用的記憶體 MySQL：只認得 orgService 會送出的語句，其他語句直接丟錯，避免測試靜默通過
//* `users.email` 的 collation 不分大小寫，這裡比對時一律轉小寫
//* 交易：beginTransaction 存快照，rollback 還原，模擬「失敗時什麼都沒寫入」
//* 外鍵：刪除 membership 時連帶刪除它的 org_unit_contacts（ON DELETE CASCADE）

export interface FakeUser {
  id: number;
  email: string;
}

export interface FakeOrgRow {
  id: number;
  public_id: string;
  name: string;
  publisher_display: string;
  is_demo: boolean;
  auto_release_enabled: boolean;
  auto_release_days: number;
}

export interface FakeMembershipRow {
  id: number;
  org_id: number;
  user_id: number;
  access_level: string;
  org_role: string;
}

export interface FakeUnitRow {
  id: number;
  org_id: number;
  name: string;
}

export interface FakeUnitContactRow {
  org_id: number;
  org_unit_id: number;
  membership_id: number;
}

type Result = [unknown, unknown];

export interface FakeOrgDb {
  users: FakeUser[];
  organizations: FakeOrgRow[];
  memberships: FakeMembershipRow[];
  units: FakeUnitRow[];
  unitContacts: FakeUnitContactRow[];
  connection: {
    query: (...args: unknown[]) => Promise<Result>;
    execute: (...args: unknown[]) => Promise<Result>;
    beginTransaction: () => Promise<void>;
    commit: () => Promise<void>;
    rollback: () => Promise<void>;
    release: () => void;
  };
}

const ORG_COLUMNS = [
  "name",
  "publisher_display",
  "is_demo",
  "auto_release_enabled",
  "auto_release_days",
] as const;

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

function dupEntry(): Error {
  return Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
}

type Tables = Pick<
  FakeOrgDb,
  "organizations" | "memberships" | "units" | "unitContacts"
>;

export function createFakeOrgDb(
  seed: { users: FakeUser[] } & Partial<Tables>,
): FakeOrgDb {
  const db: FakeOrgDb = {
    users: [...seed.users],
    organizations: [...(seed.organizations ?? [])],
    memberships: [...(seed.memberships ?? [])],
    units: [...(seed.units ?? [])],
    unitContacts: [...(seed.unitContacts ?? [])],
    connection: undefined as unknown as FakeOrgDb["connection"],
  };
  let snapshot: Tables | null = null;
  let nextId =
    Math.max(
      0,
      ...db.organizations.map((r) => r.id),
      ...db.memberships.map((r) => r.id),
      ...db.units.map((r) => r.id),
    ) + 1;

  function emailOf(userId: number) {
    return db.users.find((u) => u.id === userId)!.email;
  }

  function run(rawSql: unknown, rawParams: unknown): Result {
    const sql = normalize(String(rawSql));
    const params = (rawParams ?? []) as unknown[];

    if (/^SELECT id FROM users WHERE email = \?/.test(sql)) {
      const email = String(params[0]).toLowerCase();
      const rows = db.users
        .filter((u) => u.email.toLowerCase() === email)
        .map((u) => ({ id: u.id }));
      return [rows, []];
    }

    if (
      /^INSERT INTO organizations \(public_id, ?name, ?publisher_display, ?is_demo, ?auto_release_enabled, ?auto_release_days\)/.test(
        sql,
      )
    ) {
      const [public_id, name, publisher_display, is_demo, enabled, days] =
        params;
      const row: FakeOrgRow = {
        id: nextId++,
        public_id: String(public_id),
        name: String(name),
        publisher_display: String(publisher_display),
        is_demo: Boolean(is_demo),
        auto_release_enabled: Boolean(enabled),
        auto_release_days: Number(days),
      };
      db.organizations.push(row);
      return [{ insertId: row.id, affectedRows: 1 }, []];
    }

    if (
      /^INSERT INTO org_memberships \(org_id, ?user_id, ?access_level, ?org_role\)/.test(
        sql,
      )
    ) {
      const [org_id, user_id, access_level, org_role] = params;
      if (
        db.memberships.some((m) => m.org_id === org_id && m.user_id === user_id)
      ) {
        throw dupEntry();
      }
      const row: FakeMembershipRow = {
        id: nextId++,
        org_id: Number(org_id),
        user_id: Number(user_id),
        access_level: String(access_level),
        org_role: String(org_role),
      };
      db.memberships.push(row);
      return [{ insertId: row.id, affectedRows: 1 }, []];
    }

    const selectOrgs = sql.match(
      /^SELECT id, public_id, name, publisher_display, is_demo, auto_release_enabled, auto_release_days FROM organizations( WHERE public_id = \?)?/,
    );
    if (selectOrgs) {
      const rows = selectOrgs[1]
        ? db.organizations.filter((o) => o.public_id === params[0])
        : [...db.organizations].reverse();
      return [rows.map((o) => ({ ...o })), []];
    }

    if (
      /^SELECT m\.org_id, u\.email FROM org_memberships m JOIN users u ON u\.id = m\.user_id WHERE m\.org_role = 'admin' AND m\.org_id IN \(\?\)/.test(
        sql,
      )
    ) {
      const orgIds = (params[0] as number[]).map(Number);
      const rows = db.memberships
        .filter((m) => m.org_role === "admin" && orgIds.includes(m.org_id))
        .map((m) => ({
          org_id: m.org_id,
          email: db.users.find((u) => u.id === m.user_id)!.email,
        }));
      return [rows, []];
    }

    const update = sql.match(
      /^UPDATE organizations SET (.+) WHERE public_id = \?$/,
    );
    if (update) {
      const columns = update[1].split(", ").map((c) => c.replace(/ = \?$/, ""));
      const org = db.organizations.find(
        (o) => o.public_id === params[params.length - 1],
      );
      if (org) {
        columns.forEach((column, i) => {
          if (!(ORG_COLUMNS as readonly string[]).includes(column)) {
            throw new Error(`fakeOrgDb: unknown column ${column}`);
          }
          (org as unknown as Record<string, unknown>)[column] = params[i];
        });
      }
      return [{ affectedRows: org ? 1 : 0 }, []];
    }

    //* ── 組織管理員後台（orgMemberService）──

    if (
      /^SELECT o\.public_id, o\.name FROM org_memberships m JOIN organizations o ON o\.id = m\.org_id WHERE m\.user_id = \? AND m\.org_role = 'admin'/.test(
        sql,
      )
    ) {
      const rows = db.memberships
        .filter((m) => m.user_id === params[0] && m.org_role === "admin")
        .map((m) => db.organizations.find((o) => o.id === m.org_id)!)
        .map((o) => ({ public_id: o.public_id, name: o.name }));
      return [rows, []];
    }

    if (
      /^SELECT o\.id, o\.public_id, o\.name FROM organizations o JOIN org_memberships m ON m\.org_id = o\.id WHERE o\.public_id = \? AND m\.user_id = \? AND m\.org_role = 'admin'/.test(
        sql,
      )
    ) {
      const org = db.organizations.find((o) => o.public_id === params[0]);
      const isAdmin =
        org &&
        db.memberships.some(
          (m) =>
            m.org_id === org.id &&
            m.user_id === params[1] &&
            m.org_role === "admin",
        );
      const rows = isAdmin
        ? [{ id: org.id, public_id: org.public_id, name: org.name }]
        : [];
      return [rows, []];
    }

    if (/^SELECT id, name FROM org_units WHERE org_id = \?/.test(sql)) {
      const rows = db.units
        .filter((u) => u.org_id === params[0])
        .map((u) => ({ id: u.id, name: u.name }));
      return [rows, []];
    }

    if (
      /^SELECT id FROM org_units WHERE org_id = \? AND id IN \(\?\)/.test(sql)
    ) {
      const ids = (params[1] as number[]).map(Number);
      const rows = db.units
        .filter((u) => u.org_id === params[0] && ids.includes(u.id))
        .map((u) => ({ id: u.id }));
      return [rows, []];
    }

    if (
      /^INSERT INTO org_units \(org_id, ?name\) VALUES \(\?, ?\?\)/.test(sql)
    ) {
      const [org_id, name] = params;
      if (db.units.some((u) => u.org_id === org_id && u.name === name)) {
        throw dupEntry();
      }
      const row: FakeUnitRow = {
        id: nextId++,
        org_id: Number(org_id),
        name: String(name),
      };
      db.units.push(row);
      return [{ insertId: row.id, affectedRows: 1 }, []];
    }

    if (
      /^SELECT m\.id, m\.org_role, u\.email FROM org_memberships m JOIN users u ON u\.id = m\.user_id WHERE m\.org_id = \?/.test(
        sql,
      )
    ) {
      const rows = db.memberships
        .filter((m) => m.org_id === params[0])
        .map((m) => ({
          id: m.id,
          org_role: m.org_role,
          email: emailOf(m.user_id),
        }));
      return [rows, []];
    }

    if (
      /^SELECT membership_id, org_unit_id FROM org_unit_contacts WHERE org_id = \?/.test(
        sql,
      )
    ) {
      const rows = db.unitContacts
        .filter((c) => c.org_id === params[0])
        .map((c) => ({
          membership_id: c.membership_id,
          org_unit_id: c.org_unit_id,
        }));
      return [rows, []];
    }

    if (
      /^INSERT INTO org_unit_contacts \(org_id, ?org_unit_id, ?membership_id\) VALUES \?$/.test(
        sql,
      )
    ) {
      const values = params[0] as [number, number, number][];
      for (const [org_id, org_unit_id, membership_id] of values) {
        const unit = db.units.find((u) => u.id === org_unit_id);
        const membership = db.memberships.find((m) => m.id === membership_id);
        if (unit?.org_id !== org_id || membership?.org_id !== org_id) {
          throw new Error("fakeOrgDb: org_unit_contacts foreign key fails");
        }
        db.unitContacts.push({ org_id, org_unit_id, membership_id });
      }
      return [{ affectedRows: values.length }, []];
    }

    if (
      /^SELECT org_role FROM org_memberships WHERE org_id = \? AND id = \? FOR UPDATE$/.test(
        sql,
      )
    ) {
      const rows = db.memberships
        .filter((m) => m.org_id === params[0] && m.id === Number(params[1]))
        .map((m) => ({ org_role: m.org_role }));
      return [rows, []];
    }

    if (
      /^SELECT id FROM org_memberships WHERE org_id = \? AND org_role = 'admin' FOR UPDATE$/.test(
        sql,
      )
    ) {
      const rows = db.memberships
        .filter((m) => m.org_id === params[0] && m.org_role === "admin")
        .map((m) => ({ id: m.id }));
      return [rows, []];
    }

    if (
      /^DELETE FROM org_memberships WHERE org_id = \? AND id = \?$/.test(sql)
    ) {
      const id = Number(params[1]);
      const before = db.memberships.length;
      db.memberships = db.memberships.filter(
        (m) => !(m.org_id === params[0] && m.id === id),
      );
      db.unitContacts = db.unitContacts.filter((c) => c.membership_id !== id);
      return [{ affectedRows: before - db.memberships.length }, []];
    }

    throw new Error(`fakeOrgDb: unsupported SQL: ${sql}`);
  }

  db.connection = {
    query: async (sql, params) => run(sql, params),
    execute: async (sql, params) => run(sql, params),
    beginTransaction: async () => {
      snapshot = {
        organizations: db.organizations.map((o) => ({ ...o })),
        memberships: db.memberships.map((m) => ({ ...m })),
        units: db.units.map((u) => ({ ...u })),
        unitContacts: db.unitContacts.map((c) => ({ ...c })),
      };
    },
    commit: async () => {
      snapshot = null;
    },
    rollback: async () => {
      if (snapshot) {
        db.organizations = snapshot.organizations;
        db.memberships = snapshot.memberships;
        db.units = snapshot.units;
        db.unitContacts = snapshot.unitContacts;
      }
      snapshot = null;
    },
    release: () => {},
  };

  return db;
}
