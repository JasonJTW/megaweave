/**
 * 組織對話（#140、ADR 0004）：民眾在對話裡只看到組織，經手窗口照常收訊息、回訊息。
 */
import {
  loadConversationMasks,
  presentConversation,
  presentMessage,
  resolveContactToken,
} from "./orgConversation";
import { VIEWER_MEMBERSHIPS_SQL } from "./postVisibility";

const CONTACT = 2;
const COLLEAGUE = 3;
const PUBLIC_USER = 5;
const POST = "33333333-3333-4333-8333-333333333333";

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

function fakeDb() {
  const memberships = [
    { org_id: 10, user_id: CONTACT },
    { org_id: 10, user_id: COLLEAGUE },
  ];
  const conversations = [{ id: 7, user1_id: CONTACT, user2_id: PUBLIC_USER, org_id: 10, org_user_id: CONTACT }];
  const handler = async (rawSql: string, params: unknown[] = []) => {
    const sql = normalize(rawSql);
    if (sql === "SELECT org_id FROM org_memberships WHERE user_id = ? AND org_id IN (?)") {
      const ids = params[1] as number[];
      return [memberships.filter((m) => m.user_id === params[0] && ids.includes(m.org_id)), []];
    }
    if (sql === VIEWER_MEMBERSHIPS_SQL) {
      return [
        memberships
          .filter((m) => m.user_id === params[0])
          .map((m) => ({ org_id: m.org_id, access_level: "internal" })),
        [],
      ];
    }
    if (sql === "SELECT id, name, publisher_display FROM organizations WHERE id IN (?)") {
      return [[{ id: 10, name: "甲公司", publisher_display: "org_unit" }], []];
    }
    if (sql === "SELECT id, public_id FROM users WHERE id IN (?)") {
      return [(params[0] as number[]).map((id) => ({ id, public_id: `u-${id}` })), []];
    }
    if (sql === "SELECT user1_id, user2_id FROM conversations WHERE id = ?") {
      return [conversations.filter((c) => c.id === params[0]), []];
    }
    if (sql.startsWith("SELECT p.user_id, p.org_id FROM posts p WHERE p.public_id = ?")) {
      return [params[0] === POST ? [{ user_id: CONTACT, org_id: 10 }] : [], []];
    }
    throw new Error(`unexpected SQL ${sql}`);
  };
  return { query: handler, execute: handler } as never;
}

const orgConversation = {
  id: 7,
  org_id: 10,
  org_user_id: CONTACT,
  other_public_id: "u-2",
  other_username: "王小明",
  other_avatar_url: "ming.png",
};

describe("what a member of the public sees", () => {
  it("shows the org instead of the contact, with a token to reply into the same conversation", async () => {
    const masks = await loadConversationMasks(fakeDb(), PUBLIC_USER, [orgConversation]);
    const shown = presentConversation(orgConversation, masks.get(7));

    //* 對話沒有單位脈絡：組織＋單位的設定只顯示組織名稱
    expect(shown).toMatchObject({
      other_public_id: "org-conv:7",
      other_username: "甲公司",
      other_avatar_url: null,
    });
    expect(shown).not.toHaveProperty("org_user_id");
  });

  it("hides the contact on their messages and in the system message's post author", async () => {
    const mask = (await loadConversationMasks(fakeDb(), PUBLIC_USER, [orgConversation])).get(7);
    const fromContact = presentMessage(
      {
        sender_id: CONTACT,
        sender_public_id: "u-2",
        sender_name: "王小明",
        sender_avatar: "ming.png",
        metadata: JSON.stringify({ post_author_public_id: "u-2", item_title: "螢幕" }),
      },
      mask,
    );
    expect(fromContact).toMatchObject({
      sender_public_id: "org-conv:7",
      sender_name: "甲公司",
      sender_avatar: null,
      metadata: { post_author_public_id: "org-conv:7", item_title: "螢幕" },
    });

    const mine = presentMessage({ sender_id: PUBLIC_USER, sender_public_id: "u-5" }, mask);
    expect(mine.sender_public_id).toBe("u-5");
  });
});

describe("what the org side sees", () => {
  it.each([
    ["the handling contact", CONTACT],
    ["a colleague in the same org", COLLEAGUE],
  ])("%s sees the requester as a person", async (_who, viewer) => {
    const masks = await loadConversationMasks(fakeDb(), viewer, [
      { ...orgConversation, org_user_id: viewer === CONTACT ? CONTACT : PUBLIC_USER },
    ]);
    expect(masks.size).toBe(0);
  });

  it("still replies through the conversation token", async () => {
    const shown = presentConversation({ ...orgConversation, other_public_id: "u-5" }, undefined);
    expect(shown.other_public_id).toBe("org-conv:7");
  });
});

describe("resolveContactToken", () => {
  it("sends a post token to the item's handling contact in an org conversation", async () => {
    expect(await resolveContactToken(fakeDb(), PUBLIC_USER, { kind: "post", postPublicId: POST })).toEqual({
      recipientId: CONTACT,
      org: { orgId: 10, orgUserId: CONTACT },
    });
  });

  it("does not let the contact message their own item", async () => {
    expect(await resolveContactToken(fakeDb(), CONTACT, { kind: "post", postPublicId: POST })).toBeNull();
  });

  it("routes a conversation token to the other participant, only for participants", async () => {
    const db = fakeDb();
    expect(await resolveContactToken(db, CONTACT, { kind: "conversation", conversationId: 7 })).toEqual({
      recipientId: PUBLIC_USER,
      conversationId: 7,
    });
    expect(await resolveContactToken(db, COLLEAGUE, { kind: "conversation", conversationId: 7 })).toBeNull();
  });
});
