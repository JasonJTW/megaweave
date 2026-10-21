import {
  combineReducers,
  configureStore,
  createListenerMiddleware,
  isAnyOf,
  type ThunkAction,
  type UnknownAction,
} from "@reduxjs/toolkit";
import chatPopupReducer, {
  chatOpened,
  chatClosed,
  chatCleared,
  draftSet,
  chatHydrated,
  persistChatPopup,
} from "./chatPopupSlice";

const rootReducer = combineReducers({
  chatPopup: chatPopupReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

// A fresh store per request: App Router renders client components on the
// server too, and a module-level singleton would leak state across users.
export const makeStore = () => {
  const listener = createListenerMiddleware();

  // Mirror chat popup state into sessionStorage so it survives a reload.
  // Nothing is written until chatHydrated runs, so the stored state can't
  // be clobbered by the empty initial state.
  listener.startListening({
    matcher: isAnyOf(chatOpened, chatClosed, chatCleared, draftSet, chatHydrated),
    effect: (_action, api) => persistChatPopup(api.getState() as RootState),
  });

  return configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().prepend(listener.middleware),
  });
};

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;
