import type { InviteRole, PetRole } from '@pet-app/shared';
import type { MemoryAuthRepo } from '../auth/memory-repo.js';
import type { MemoryPetsRepo } from '../pets/memory-repo.js';
import type { FamilyRepo, InvitePet, InviteRecord, AcceptResult } from './types.js';

interface StoredInvite extends InviteRecord {
  tokenHash: string;
  petIds: string[];
}

/**
 * In-memory FamilyRepo for tests and the OpenAPI export. It reads pets and members from the
 * in-memory pets repo and people from the in-memory auth repo, so all three stay consistent.
 */
export class MemoryFamilyRepo implements FamilyRepo {
  readonly invites = new Map<string, StoredInvite>();

  constructor(
    private readonly pets: MemoryPetsRepo,
    private readonly auth: MemoryAuthRepo,
  ) {}

  private toInvitePet(petId: string): InvitePet | null {
    const pet = this.pets.pets.get(petId);
    if (!pet || pet.deletedAt) return null;
    return {
      id: pet.id,
      name: pet.name,
      species: pet.species,
      memberCount: this.pets.members.get(petId)?.size ?? 0,
    };
  }

  ownedPets(userId: string) {
    const owned = [...this.pets.pets.values()]
      .filter((p) => this.pets.members.get(p.id)?.get(userId) === 'owner')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((p) => this.toInvitePet(p.id))
      .filter((p): p is InvitePet => p !== null);
    return Promise.resolve(owned);
  }

  createInvite(input: {
    id: string;
    tokenHash: string;
    role: InviteRole;
    createdBy: string;
    petIds: string[];
    now: Date;
    expiresAt: Date;
  }) {
    this.invites.set(input.id, {
      id: input.id,
      tokenHash: input.tokenHash,
      role: input.role,
      createdBy: input.createdBy,
      petIds: input.petIds,
      expiresAt: input.expiresAt,
      acceptedBy: null,
      revokedAt: null,
    });
    return Promise.resolve();
  }

  findInviteByTokenHash(tokenHash: string) {
    const invite = [...this.invites.values()].find((i) => i.tokenHash === tokenHash);
    return Promise.resolve(invite ?? null);
  }

  getInvite(inviteId: string) {
    return Promise.resolve(this.invites.get(inviteId) ?? null);
  }

  invitePets(inviteId: string) {
    const ids = this.invites.get(inviteId)?.petIds ?? [];
    return Promise.resolve(
      ids.map((id) => this.toInvitePet(id)).filter((p): p is InvitePet => p !== null),
    );
  }

  rolesOf(userId: string, petIds: string[]) {
    const roles = new Map<string, PetRole>();
    for (const petId of petIds) {
      const pet = this.pets.pets.get(petId);
      const role = this.pets.members.get(petId)?.get(userId);
      if (pet && !pet.deletedAt && role) roles.set(petId, role);
    }
    return Promise.resolve(roles);
  }

  acceptInvite(input: {
    inviteId: string;
    userId: string;
    role: InviteRole;
    petIds: string[];
    memberLimit: number;
    now: Date;
  }): Promise<AcceptResult> {
    const invite = this.invites.get(input.inviteId);
    if (!invite || invite.acceptedBy || invite.revokedAt) return Promise.resolve('used');
    const full = input.petIds.some(
      (petId) => (this.pets.members.get(petId)?.size ?? 0) >= input.memberLimit,
    );
    if (full) return Promise.resolve('full');
    invite.acceptedBy = input.userId;
    for (const petId of input.petIds) this.pets.addMember(petId, input.userId, input.role);
    return Promise.resolve('accepted');
  }

  revokeInvite(inviteId: string, now: Date) {
    const invite = this.invites.get(inviteId);
    if (invite) invite.revokedAt = now;
    return Promise.resolve();
  }

  getUser(userId: string) {
    const user = this.auth.users.get(userId);
    return Promise.resolve(user ? { name: user.name, phone: user.phone } : null);
  }

  listMembers(petId: string) {
    const members = [...(this.pets.members.get(petId) ?? new Map<string, PetRole>())].map(
      ([userId, role]) => {
        const user = this.auth.users.get(userId);
        return { userId, role, name: user?.name ?? null, phone: user?.phone ?? null };
      },
    );
    return Promise.resolve(members);
  }

  removeMember(petId: string, userId: string) {
    this.pets.members.get(petId)?.delete(userId);
    return Promise.resolve();
  }
}
