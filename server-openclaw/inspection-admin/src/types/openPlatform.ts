export interface OpenPlatformTokenPayload {
  identifierType: "userId" | "loginName" | "mobilePhone" | "employeeName" | "bossUsername";
  identifierValue: string;
}

export interface BossLoginPayload {
  username: string;
  password: string;
}

export interface OpenPlatformTokenData {
  token: string;
  enterpriseId?: number | string | null;
  identifierType: OpenPlatformTokenPayload["identifierType"];
  identifier: string;
  raw?: Record<string, unknown>;
}

export interface OpenPlatformTokenResponse {
  code: number;
  message: string;
  data: OpenPlatformTokenData;
}

export interface StoredOpenPlatformSession extends OpenPlatformTokenData {
  loginAt: string;
}
