import type { InviteRole, PetRole, PetSpecies } from '@pet-app/shared';

export interface InvitePet {
  id: string;
  name: string;
  species: PetSpecies;
  /** Members right now, the owner included. */
  memberCount: number;
}

export interface InviteRecord {
  id: string;
  role: InviteRole;
  createdBy: string;
  expiresAt: Date;
  acceptedBy: string | null;
  revokedAt: Date | null;
}

export interface Person {
  name: string | null;
  phone: string | null;
}

export interface MemberRecord extends Person {
  userId: string;
  role: PetRole;
}

/** Storage port for family access. Drizzle implementation in production, in-memory in tests. */
export type AcceptResult = 'accepted' | 'used' | 'full';

export interface FamilyRepo {
  /** Pets the user owns (not deleted), oldest first. */
  ownedPets(userId: string): Promise<InvitePet[]>;
  createInvite(input: {
    id: string;
    tokenHash: string;
    role: InviteRole;
    createdBy: string;
    petIds: string[];
    now: Date;
    expiresAt: Date;
  }): Promise<void>;
  findInviteByTokenHash(tokenHash: string): Promise<InviteRecord | null>;
  getInvite(inviteId: string): Promise<InviteRecord | null>;
  /** Pets of the invite that still exist. */
  invitePets(inviteId: string): Promise<InvitePet[]>;
  /** The user's role for each of the pets they are a member of. */
  rolesOf(userId: string, petIds: string[]): Promise<Map<string, PetRole>>;
  /**
   * Marks the invite accepted by the user and adds the memberships, atomically.
   * Returns false when the invite was accepted or revoked in the meantime.
   */
  /**
   * Claims the invite and adds the person to `petIds`, all or nothing. `full` — one of the pets
   * already has `memberLimit` members; `used` — the invite was claimed, revoked or is gone.
   * The limit is checked in the same transaction as the insert, so two people accepting at the
   * same moment cannot both take the last place (QA #50).
   */
  acceptInvite(input: {
    inviteId: string;
    userId: string;
    role: InviteRole;
    petIds: string[];
    invitedBy: string;
    memberLimit: number;
    now: Date;
  }): Promise<AcceptResult>;
  revokeInvite(inviteId: string, now: Date): Promise<void>;
  getUser(userId: string): Promise<Person | null>;
  listMembers(petId: string): Promise<MemberRecord[]>;
  removeMember(petId: string, userId: string): Promise<void>;
}
