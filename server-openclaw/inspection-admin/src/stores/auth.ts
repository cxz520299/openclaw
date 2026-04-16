import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { OpenPlatformTokenData, StoredOpenPlatformSession } from "@/types/openPlatform";
import { clearOpenPlatformSession, readOpenPlatformSession, writeOpenPlatformSession } from "@/utils/auth";

const initialSession = readOpenPlatformSession();

export const useAuthStore = defineStore("auth", () => {
  const session = ref<StoredOpenPlatformSession | null>(initialSession);

  const isAuthenticated = computed(() => Boolean(session.value?.token));

  function setSession(payload: OpenPlatformTokenData) {
    const nextSession: StoredOpenPlatformSession = {
      ...payload,
      loginAt: new Date().toISOString(),
    };
    session.value = nextSession;
    writeOpenPlatformSession(nextSession);
  }

  function logout() {
    session.value = null;
    clearOpenPlatformSession();
  }

  return {
    session,
    isAuthenticated,
    setSession,
    logout,
  };
});
