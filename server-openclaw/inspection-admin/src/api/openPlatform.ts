import http from "./http";
import type { BossLoginPayload, OpenPlatformTokenPayload, OpenPlatformTokenResponse } from "@/types/openPlatform";

export const openPlatformApi = {
  getUserToken: (payload: OpenPlatformTokenPayload) =>
    http.post<OpenPlatformTokenPayload, OpenPlatformTokenResponse>("/open-platform/auth/token", payload),
  loginBossSession: (payload: BossLoginPayload) =>
    http.post<BossLoginPayload, OpenPlatformTokenResponse>("/boss/session/login", payload),
};
