"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { makeStore } from "./store";
import { chatHydrated, loadPersistedChatPopup } from "./chatPopupSlice";

export default function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);

  // Restore from sessionStorage after mount so SSR and the first client
  // render agree (both start closed).
  useEffect(() => {
    const persisted = loadPersistedChatPopup();
    if (persisted) store.dispatch(chatHydrated(persisted));
  }, [store]);

  return <Provider store={store}>{children}</Provider>;
}
