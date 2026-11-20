import { randomUUID } from 'node:crypto';
import {
  FREE_MEMBER_LIMIT,
  INVITE_TTL_HOURS,
  type CreatedInvite,
  type CreateInviteBody,
  type InviteOptions,
  type InvitePreview,
  type PetMembers,
} from '@pet-app/shared';
import { hmac, randomToken } from '../auth/crypto.js';
import { FamilyError } from './errors.js';
import type { FamilyRepo, InviteRecord, Person } from './types.js';

export interface FamilyServiceDeps {
  repo: FamilyRepo;
  /** HMAC key for invite tokens: only the hash is stored. */
  secret: string;
  clock?: () => Date;
  /** Members per pet, the owner included. Free plan: 2. */
  memberLimit?: number;
}

/** `+380671234567` → `+380 ** *** 45 67`: enough to recognise a person, not enough to call them. */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const match = /^(\+380)\d{5}(\d{2})(\d{2})$/.exec(phone);
  return match
    ? `${match[1] ?? ''} ** *** ${match[2] ?? ''} ${match[3] ?? ''}`
    : `${phone.slice(0, 4)} ***`;
}

const present = (person: Person | null): Person => ({
  name: person?.name ?? null,
  phone: maskPhone(person?.phone ?? null),
});

export class FamilyService {
  private readonly repo: FamilyRepo;
  private readonly secret: string;
  private readonly clock: () => Date;
  private readonly memberLimit: number;

  constructor(deps: FamilyServiceDeps) {
    this.repo = deps.repo;
    this.secret = deps.secret;
    this.clock = deps.clock ?? (() => new Date());
    this.memberLimit = deps.memberLimit ?? FREE_MEMBER_LIMIT;
  }

  /** The user's own pets and whether each still has room: shown before an invite is sent. */
  async options(userId: string): Promise<InviteOptions> {
    const pets = await this.repo.ownedPets(userId);
    return {
      memberLimit: this.memberLimit,
      pets: pets.map((p) => ({ ...p, hasRoom: p.memberCount < this.memberLimit })),
    };
  }

  /** One link for one person; it can cover several pets. Only the owner invites. */
  async createInvite(userId: string, body: CreateInviteBody): Promise<CreatedInvite> {
    const owned = new Map((await this.repo.ownedPets(userId)).map((p) => [p.id, p]));
    const petIds = [...new Set(body.petIds)];
    const pets = petIds.map((id) => {
      const pet = owned.get(id);
      // Someone else's pet looks like a missing one: its existence is not revealed.
      if (!pet) throw new FamilyError('pet_not_found');
      return pet;
    });
    if (pets.some((p) => p.memberCount >= this.memberLimit)) throw new FamilyError('member_limit');

    const now = this.clock();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_HOURS * 3600_000);
    const token = randomToken();
    const id = randomUUID();
    await this.repo.createInvite({
      id,
      tokenHash: hmac(this.secret, token),
      role: body.role,
      createdBy: userId,
      petIds,
      now,
      expiresAt,
    });
    return {
      id,
      token,
      role: body.role,
      expiresAt: expiresAt.toISOString(),
      pets: pets.map(({ id: petId, name, species }) => ({ id: petId, name, species })),
    };
  }

  /** What the invited person sees before accepting. */
  async preview(userId: string, token: string): Promise<InvitePreview> {
    const invite = await this.usable(userId, token);
    const pets = await this.repo.invitePets(invite.id);
    if (pets.length === 0) throw new FamilyError('invite_not_found');
    const roles = await this.repo.rolesOf(
      userId,
      pets.map((p) => p.id),
    );
    return {
      role: invite.role,
      invitedBy: present(await this.repo.getUser(invite.createdBy)),
      expiresAt: invite.expiresAt.toISOString(),
      pets: pets.map(({ id, name, species }) => ({
        id,
        name,
        species,
        alreadyMember: roles.has(id),
      })),
    };
  }

  /** Joins every pet of the invite, or none: a pet without room rejects the whole invite. */
  async accept(userId: string, token: string): Promise<{ petIds: string[] }> {
    const invite = await this.usable(userId, token);
    if (invite.createdBy === userId) throw new FamilyError('own_invite');

    const pets = await this.repo.invitePets(invite.id);
    if (pets.length === 0) throw new FamilyError('invite_not_found');
    const petIds = pets.map((p) => p.id);
    // Accepting the same invite twice is harmless: nothing changes the second time.
    if (invite.acceptedBy === userId) return { petIds };

    const roles = await this.repo.rolesOf(userId, petIds);
    const toJoin = pets.filter((p) => !roles.has(p.id));
    if (toJoin.some((p) => p.memberCount >= this.memberLimit))
      throw new FamilyError('member_limit');

    const accepted = await this.repo.acceptInvite({
      inviteId: invite.id,
      userId,
      role: invite.role,
      petIds: toJoin.map((p) => p.id),
      invitedBy: invite.createdBy,
      now: this.clock(),
    });
    if (!accepted) throw new FamilyError('invite_used');
    return { petIds };
  }

  /** The creator cancels a link that nobody has used yet. */
  async revokeInvite(userId: string, inviteId: string): Promise<void> {
    const invite = await this.repo.getInvite(inviteId);
    if (!invite || invite.createdBy !== userId) throw new FamilyError('invite_not_found');
    // An accepted invite is a membership now: access is taken away by removing the member.
    if (invite.acceptedBy) throw new FamilyError('invite_used');
    if (!invite.revokedAt) await this.repo.revokeInvite(inviteId, this.clock());
  }

  async members(userId: string, petId: string): Promise<PetMembers> {
    await this.roleOf(userId, petId);
    const members = await this.repo.listMembers(petId);
    return {
      memberLimit: this.memberLimit,
      members: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        isYou: m.userId === userId,
        ...present(m),
      })),
    };
  }

  /** The owner takes access away from a member; a member may also leave on their own. */
  async removeMember(userId: string, petId: string, targetUserId: string): Promise<void> {
    const myRole = await this.roleOf(userId, petId);
    const target = (await this.repo.rolesOf(targetUserId, [petId])).get(petId);
    if (!target) throw new FamilyError('member_not_found');
    if (target === 'owner') throw new FamilyError('owner_cannot_be_removed');
    if (targetUserId !== userId && myRole !== 'owner') throw new FamilyError('forbidden');
    await this.repo.removeMember(petId, targetUserId);
  }

  private async roleOf(userId: string, petId: string) {
    const role = (await this.repo.rolesOf(userId, [petId])).get(petId);
    if (!role) throw new FamilyError('pet_not_found');
    return role;
  }

  /** Finds the invite by its token and checks it can still be used by this user. */
  private async usable(userId: string, token: string): Promise<InviteRecord> {
    const invite = await this.repo.findInviteByTokenHash(hmac(this.secret, token));
    if (!invite) throw new FamilyError('invite_not_found');
    if (invite.revokedAt) throw new FamilyError('invite_revoked');
    if (invite.acceptedBy) {
      if (invite.acceptedBy !== userId) throw new FamilyError('invite_used');
      return invite;
    }
    if (invite.expiresAt.getTime() <= this.clock().getTime()) {
      throw new FamilyError('invite_expired');
    }
    return invite;
  }
}
