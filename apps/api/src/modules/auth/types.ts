export interface UserRecord {
  id: string;
  phone: string | null;
  name: string | null;
  locale: 'uk' | 'en';
}

export interface ChallengeRecord {
  id: string;
  phone: string;
  codeHash: string;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Storage port for the auth module. Drizzle implementation in production, in-memory in tests. */
export interface AuthRepo {
  createChallenge(input: {
    phone: string;
    codeHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<ChallengeRecord>;
  /** Challenges for `phone` created at or after `since`, newest first. */
  recentChallenges(phone: string, since: Date): Promise<ChallengeRecord[]>;
  getChallenge(id: string): Promise<ChallengeRecord | null>;
  incrementAttempts(id: string): Promise<void>;
  consumeChallenge(id: string, now: Date): Promise<boolean>;
  findOrCreateUserByPhone(phone: string, now: Date): Promise<{ user: UserRecord; isNew: boolean }>;
  getUser(id: string): Promise<UserRecord | null>;
  createSession(input: {
    userId: string;
    refreshTokenHash: string;
    familyId: string;
    deviceName: string | null;
    expiresAt: Date;
  }): Promise<SessionRecord>;
  findSessionByTokenHash(hash: string): Promise<SessionRecord | null>;
  getSession(id: string): Promise<SessionRecord | null>;
  revokeSession(id: string, now: Date): Promise<void>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
  /**
   * Soft-deletes the user, frees their phone/identities, revokes all sessions & open invites,
   * transfers owned pets to the earliest active editor (or soft-deletes if none), and removes
   * the user from `pet_members`.
   */
  deleteAccount(userId: string, now: Date): Promise<void>;
}

/** Delivers a one-time code to the phone (Viber → SMS in production, log in dev). */
export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}
