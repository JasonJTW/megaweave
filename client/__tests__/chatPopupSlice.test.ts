import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { configureStore } from "@reduxjs/toolkit";
import reducer, {
  CLOSE_ANIMATION_MS,
  chatCleared,
  chatClosed,
  chatOpened,
  closeChat,
  draftSet,
  initialState,
  openChat,
} from "@/app/store/chatPopupSlice";
import type { Post } from "@/app/types/schema";

const user = { public_id: "u1", username: "alice" };
const post = { id: 7, title: "Chair", items: [] } as unknown as Post;

describe("chatPopup reducer", () => {
  it("opens a chat and seeds a draft from the post", () => {
    const s = reducer(
      initialState,
      chatOpened({ conversationId: 1, otherUser: user, post }),
    );
    assert.equal(s.isOpen, true);
    assert.equal(s.conversationId, 1);
    assert.equal(s.draft?.postId, 7);
    assert.equal(s.draft?.mode, "all_post");
  });

  it("clears stale post and draft when opening without a post", () => {
    const withPost = reducer(
      initialState,
      chatOpened({ conversationId: 1, otherUser: user, post }),
    );
    const s = reducer(withPost, chatOpened({ conversationId: 2, otherUser: user }));
    assert.equal(s.post, null);
    assert.equal(s.draft, null);
  });

  it("chatCleared resets only when closed", () => {
    const open = reducer(
      initialState,
      chatOpened({ conversationId: 1, otherUser: user, post }),
    );
    assert.equal(reducer(open, chatCleared()), open);
    assert.deepEqual(reducer(reducer(open, chatClosed()), chatCleared()), initialState);
  });

  it("draftSet replaces the draft", () => {
    const s = reducer(initialState, draftSet(null));
    assert.equal(s.draft, null);
  });
});

describe("chatPopup thunks", () => {
  const makeStore = () =>
    configureStore({ reducer: { chatPopup: reducer } });

  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("clears data after the close animation", () => {
    const store = makeStore();
    store.dispatch(openChat({ conversationId: 1, otherUser: user, post }));
    store.dispatch(closeChat());
    assert.equal(store.getState().chatPopup.conversationId, 1);
    mock.timers.tick(CLOSE_ANIMATION_MS);
    assert.deepEqual(store.getState().chatPopup, initialState);
  });

  it("re-opening during the animation cancels the pending clear", () => {
    const store = makeStore();
    store.dispatch(openChat({ conversationId: 1, otherUser: user }));
    store.dispatch(closeChat());
    store.dispatch(openChat({ conversationId: 2, otherUser: user, post }));
    mock.timers.tick(CLOSE_ANIMATION_MS);
    const s = store.getState().chatPopup;
    assert.equal(s.isOpen, true);
    assert.equal(s.conversationId, 2);
    assert.equal(s.post?.id, 7);
  });
});
