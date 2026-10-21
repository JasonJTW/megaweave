import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Post } from "../types/schema";
import { type WeaveDraft, createInitialDraft } from "../types/weaveDraft";
import type { AppThunk, RootState } from "./store";

export interface ChatPopupOtherUser {
  public_id: string;
  username: string;
  avatar_url?: string;
}

/** Minimal shape needed to seed the initial WeaveDraft when opening a chat. */
export interface InitialItem {
  id: string | number;
  title: string;
}

export interface ChatPopupState {
  isOpen: boolean;
  conversationId: number | null;
  otherUser: ChatPopupOtherUser | null;
  post: Post | null;
  draft: WeaveDraft | null;
}

export interface OpenChatPayload {
  conversationId: number;
  otherUser: ChatPopupOtherUser;
  post?: Post;
  item?: InitialItem;
}

export const initialState: ChatPopupState = {
  isOpen: false,
  conversationId: null,
  otherUser: null,
  post: null,
  draft: null,
};

export const CLOSE_ANIMATION_MS = 300;

const chatPopupSlice = createSlice({
  name: "chatPopup",
  initialState,
  reducers: {
    chatOpened(state, action: PayloadAction<OpenChatPayload>) {
      const { conversationId, otherUser, post, item } = action.payload;
      state.isOpen = true;
      state.conversationId = conversationId;
      state.otherUser = otherUser;
      // Always update post (even to null) so switching conversations never
      // leaves stale post data from the previous chat.
      state.post = post ?? null;
      state.draft = post ? createInitialDraft(post, item) : null;
    },
    chatClosed(state) {
      state.isOpen = false;
    },
    // Fired after the exit animation. Skipped if the chat was re-opened in
    // the meantime, so a late clear can never wipe a fresh conversation.
    chatCleared(state) {
      if (state.isOpen) return;
      return initialState;
    },
    draftSet(state, action: PayloadAction<WeaveDraft | null>) {
      state.draft = action.payload;
    },
    chatHydrated(_state, action: PayloadAction<ChatPopupState>) {
      return action.payload;
    },
  },
  selectors: {
    selectIsOpen: (state) => state.isOpen,
    selectConversationId: (state) => state.conversationId,
    selectOtherUser: (state) => state.otherUser,
    selectPost: (state) => state.post,
    selectDraft: (state) => state.draft,
  },
});

export const { chatOpened, chatClosed, chatCleared, draftSet, chatHydrated } =
  chatPopupSlice.actions;
export const {
  selectIsOpen,
  selectConversationId,
  selectOtherUser,
  selectPost,
  selectDraft,
} = chatPopupSlice.selectors;
export default chatPopupSlice.reducer;

// Pending clear timer. Only ever set in the browser (thunks run on user
// interaction), so a module-level handle is safe here.
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export const openChat =
  (payload: OpenChatPayload): AppThunk =>
  (dispatch) => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    dispatch(chatOpened(payload));
  };

export const closeChat = (): AppThunk => (dispatch) => {
  dispatch(chatClosed());
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearTimer = null;
    dispatch(chatCleared());
  }, CLOSE_ANIMATION_MS);
};

// --- sessionStorage persistence -------------------------------------------

const STORAGE_KEY = "chatPopupState";

export function loadPersistedChatPopup(): ChatPopupState | null {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed.isOpen && parsed.conversationId && parsed.otherUser) {
      return {
        isOpen: true,
        conversationId: parsed.conversationId,
        otherUser: parsed.otherUser,
        post: parsed.post ?? null,
        draft: parsed.draft ?? null,
      };
    }
  } catch (e) {
    console.error("Failed to parse chatPopupState", e);
  }
  return null;
}

export function persistChatPopup(state: RootState) {
  const { isOpen, conversationId, otherUser } = state.chatPopup;
  if (isOpen && conversationId && otherUser) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.chatPopup));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
