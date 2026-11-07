//* 測試用的記憶體 MySQL：只認得 orgService 會送出的語句，其他語句直接丟錯，避免測試靜默通過
//* `users.email` 的 collation 不分大小寫，這裡比對時一律轉小寫
//* 交易：beginTransaction 存快照，rollback 還原，模擬「失敗時什麼都沒寫入」

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

type Result = [unknown, unknown];

export interface FakeOrgDb {
  users: FakeUser[];
  organizations: FakeOrgRow[];
  memberships: FakeMembershipRow[];
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

export function createFakeOrgDb(seed: { users: FakeUser[] }): FakeOrgDb {
  const db: FakeOrgDb = {
    users: [...seed.users],
    organizations: [],
    memberships: [],
    connection: undefined as unknown as FakeOrgDb["connection"],
  };
  let snapshot: Pick<FakeOrgDb, "organizations" | "memberships"> | null = null;
  let nextId = 1;

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

    throw new Error(`fakeOrgDb: unsupported SQL: ${sql}`);
  }

  db.connection = {
    query: async (sql, params) => run(sql, params),
    execute: async (sql, params) => run(sql, params),
    beginTransaction: async () => {
      snapshot = {
        organizations: db.organizations.map((o) => ({ ...o })),
        memberships: db.memberships.map((m) => ({ ...m })),
      };
    },
    commit: async () => {
      snapshot = null;
    },
    rollback: async () => {
      if (snapshot) {
        db.organizations.splice(0, Infinity, ...snapshot.organizations);
        db.memberships.splice(0, Infinity, ...snapshot.memberships);
      }
      snapshot = null;
    },
    release: () => {},
  };

  return db;
}
