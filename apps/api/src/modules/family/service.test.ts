import { INVITE_TTL_HOURS } from '@pet-app/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryAuthRepo } from '../auth/memory-repo.js';
import { MemoryPetsRepo } from '../pets/memory-repo.js';
import { PetsService } from '../pets/service.js';
import { MemoryFamilyRepo } from './memory-repo.js';
import { FamilyService, maskPhone } from './service.js';

const HOUR = 3600_000;

/** The household from CLAUDE.md rule 9: Marina owns a dog and two cats, Andriy is the second adult. */
describe('FamilyService', () => {
  let now: Date;
  let authRepo: MemoryAuthRepo;
  let petsRepo: MemoryPetsRepo;
  let pets: PetsService;
  let familyRepo: MemoryFamilyRepo;
  let family: FamilyService;
  let marina: string;
  let andriy: string;
  let stranger: string;
  let buddy: string;
  let mango: string;
  let dym: string;

  const user = async (phone: string) => (await authRepo.findOrCreateUserByPhone(phone)).user.id;
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };

  beforeEach(async () => {
    now = new Date('2026-11-20T10:00:00Z');
    authRepo = new MemoryAuthRepo();
    petsRepo = new MemoryPetsRepo();
    const clock = () => now;
    pets = new PetsService({ repo: petsRepo, storage: null, clock });
    familyRepo = new MemoryFamilyRepo(petsRepo, authRepo);
    family = new FamilyService({
      repo: familyRepo,
      secret: 'family-test-secret-family-test-secret',
      clock,
    });
    marina = await user('+380671111111');
    andriy = await user('+380672222222');
    stranger = await user('+380673333333');
    buddy = (await pets.create(marina, { name: 'Бадді', species: 'dog' })).id;
    advance(1000);
    mango = (await pets.create(marina, { name: 'Манго', species: 'cat' })).id;
    advance(1000);
    dym = (await pets.create(marina, { name: 'Дим', species: 'cat' })).id;
  });

  describe('invite options', () => {
    it('lists the owner’s pets and says which have room, before anything is sent', async () => {
      petsRepo.addMember(mango, stranger, 'viewer');
      const options = await family.options(marina);
      expect(options.memberLimit).toBe(2);
      expect(options.pets.map((p) => [p.name, p.memberCount, p.hasRoom])).toEqual([
        ['Бадді', 1, true],
        ['Манго', 2, false],
        ['Дим', 1, true],
      ]);
    });

    it('offers nothing to a member who is not the owner', async () => {
      petsRepo.addMember(buddy, andriy, 'editor');
      expect((await family.options(andriy)).pets).toEqual([]);
    });
  });

  describe('creating an invite', () => {
    it('covers several pets with one link and never stores the token itself', async () => {
      const invite = await family.createInvite(marina, {
        petIds: [buddy, mango, dym],
        role: 'viewer',
      });
      expect(invite.pets.map((p) => p.name)).toEqual(['Бадді', 'Манго', 'Дим']);
      expect(invite.token.length).toBeGreaterThanOrEqual(40);
      expect(invite.expiresAt).toBe(
        new Date(now.getTime() + INVITE_TTL_HOURS * HOUR).toISOString(),
      );
      const stored = JSON.stringify([...familyRepo.invites]);
      expect(familyRepo.invites.size).toBe(1);
      expect(stored).not.toContain(invite.token);
    });

    it('is for the owner only: an editor cannot invite', async () => {
      petsRepo.addMember(buddy, andriy, 'editor');
      await expect(
        family.createInvite(andriy, { petIds: [buddy], role: 'viewer' }),
      ).rejects.toMatchObject({ code: 'pet_not_found', statusCode: 404 });
    });

    it('refuses the whole invite when one of the chosen pets has no room (Free: 2 members)', async () => {
      petsRepo.addMember(mango, stranger, 'viewer');
      await expect(
        family.createInvite(marina, { petIds: [buddy, mango], role: 'editor' }),
      ).rejects.toMatchObject({ code: 'member_limit', statusCode: 409 });
    });
  });

  describe('accepting', () => {
    it('gives the second adult view-only access to all three pets', async () => {
      const { token } = await family.createInvite(marina, {
        petIds: [buddy, mango, dym],
        role: 'viewer',
      });

      const preview = await family.preview(andriy, token);
      expect(preview).toMatchObject({
        role: 'viewer',
        invitedBy: { name: null, phone: '+380 ** *** 11 11' },
      });
      expect(preview.pets.map((p) => [p.name, p.alreadyMember])).toEqual([
        ['Бадді', false],
        ['Манго', false],
        ['Дим', false],
      ]);

      expect((await family.accept(andriy, token)).petIds).toEqual([buddy, mango, dym]);
      expect((await pets.list(andriy)).map((p) => [p.name, p.role])).toEqual([
        ['Бадді', 'viewer'],
        ['Манго', 'viewer'],
        ['Дим', 'viewer'],
      ]);
      // A viewer sees the pets and cannot change them.
      await expect(pets.update(andriy, buddy, { name: 'Інший' })).rejects.toMatchObject({
        code: 'forbidden',
      });
    });

    it('lets an editor change the pet', async () => {
      const { token } = await family.createInvite(marina, { petIds: [buddy], role: 'editor' });
      await family.accept(andriy, token);
      expect((await pets.update(andriy, buddy, { breed: 'Лабрадор' })).breed).toBe('Лабрадор');
    });

    it('rejects an expired link', async () => {
      const { token } = await family.createInvite(marina, { petIds: [buddy], role: 'viewer' });
      advance(INVITE_TTL_HOURS * HOUR - 1000);
      await expect(family.preview(andriy, token)).resolves.toBeDefined();
      advance(1000);
      await expect(family.preview(andriy, token)).rejects.toMatchObject({
        code: 'invite_expired',
        statusCode: 410,
      });
      await expect(family.accept(andriy, token)).rejects.toMatchObject({ code: 'invite_expired' });
      expect(await pets.list(andriy)).toEqual([]);
    });

    it('accepting twice changes nothing the second time, even after the link expired', async () => {
      const { token } = await family.createInvite(marina, { petIds: [buddy], role: 'viewer' });
      await family.accept(andriy, token);
      advance(INVITE_TTL_HOURS * HOUR + 1000);
      expect((await family.accept(andriy, token)).petIds).toEqual([buddy]);
      expect(petsRepo.members.get(buddy)?.size).toBe(2);
    });

    it('is for one person: a second person cannot use the same link', async () => {
      const { token } = await family.createInvite(marina, { petIds: [buddy], role: 'viewer' });
      await family.accept(andriy, token);
      await expect(family.accept(stranger, token)).rejects.toMatchObject({
        code: 'invite_used',
        statusCode: 409,
      });
      await expect(family.preview(stranger, token)).rejects.toMatchObject({ code: 'invite_used' });
    });

    it('checks the limit again at acceptance: two links, one free place', async () => {
      const first = await family.createInvite(marina, { petIds: [buddy], role: 'viewer' });
      const second = await family.createInvite(marina, { petIds: [buddy], role: 'viewer' });
      await family.accept(andriy, first.token);
      await expect(family.accept(stranger, second.token)).rejects.toMatchObject({
        code: 'member_limit',
      });
      expect(petsRepo.members.get(buddy)?.size).toBe(2);
    });

    it('lets only one of two people take the last place when they accept at the same moment (QA #50)', async () => {
      const first = await family.createInvite(marina, { petIds: [buddy], role: 'viewer' });
      const second = await family.createInvite(marina, { petIds: [buddy], role: 'viewer' });

      // Both quick checks run before either insert; the repository's own check decides.
      const results = await Promise.allSettled([
        family.accept(andriy, first.token),
        family.accept(stranger, second.token),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      const rejected = results.find((r) => r.status === 'rejected');
      expect(rejected?.reason).toMatchObject({ code: 'member_limit' });
      expect(petsRepo.members.get(buddy)?.size).toBe(2);
      // The losing link stays usable for a pet with room later; it was not claimed.
      expect([...familyRepo.invites.values()].filter((i) => i.acceptedBy !== null)).toHaveLength(1);
    });

    it('joins all pets or none: one pet without room rejects the whole invite', async () => {
      const { token } = await family.createInvite(marina, {
        petIds: [buddy, mango],
        role: 'viewer',
      });
      petsRepo.addMember(mango, stranger, 'viewer');
      await expect(family.accept(andriy, token)).rejects.toMatchObject({ code: 'member_limit' });
      expect(await pets.list(andriy)).toEqual([]);
    });

    it('skips a pet deleted after the invite was sent', async () => {
      const { token } = await family.createInvite(marina, {
        petIds: [buddy, dym],
        role: 'viewer',
      });
      await pets.remove(marina, dym);
      expect((await family.accept(andriy, token)).petIds).toEqual([buddy]);
    });

    it('keeps the role of someone who is already a member of one of the pets', async () => {
      const { token } = await family.createInvite(marina, {
        petIds: [buddy, dym],
        role: 'viewer',
      });
      // Meanwhile the owner gave him editing rights for the dog in another way.
      petsRepo.addMember(buddy, andriy, 'editor');
      expect((await family.preview(andriy, token)).pets.map((p) => p.alreadyMember)).toEqual([
        true,
        false,
      ]);
      await family.accept(andriy, token);
      expect((await pets.list(andriy)).map((p) => [p.name, p.role])).toEqual([
        ['Бадді', 'editor'],
        ['Дим', 'viewer'],
      ]);
    });

    it('does not let the owner accept their own invite', async () => {
      const { token } = await family.createInvite(marina, { petIds: [buddy], role: 'viewer' });
      await expect(family.accept(marina, token)).rejects.toMatchObject({ code: 'own_invite' });
    });

    it('answers "not found" for a made-up link', async () => {
      await expect(family.preview(andriy, 'x'.repeat(43))).rejects.toMatchObject({
        code: 'invite_not_found',
        statusCode: 404,
      });
    });
  });

  describe('taking access back', () => {
    it('the owner cancels a link nobody has used: it stops working', async () => {
      const invite = await family.createInvite(marina, { petIds: [buddy], role: 'viewer' });
      await family.revokeInvite(marina, invite.id);
      await expect(family.accept(andriy, invite.token)).rejects.toMatchObject({
        code: 'invite_revoked',
        statusCode: 410,
      });
      // Cancelling again is harmless.
      await expect(family.revokeInvite(marina, invite.id)).resolves.toBeUndefined();
    });

    it('only the creator can cancel a link', async () => {
      const invite = await family.createInvite(marina, { petIds: [buddy], role: 'viewer' });
      await expect(family.revokeInvite(andriy, invite.id)).rejects.toMatchObject({
        code: 'invite_not_found',
      });
    });

    it('the owner removes a member: the pet disappears for them and the place is free again', async () => {
      const { token } = await family.createInvite(marina, { petIds: [buddy], role: 'editor' });
      await family.accept(andriy, token);
      expect((await family.options(marina)).pets[0]?.hasRoom).toBe(false);

      await family.removeMember(marina, buddy, andriy);
      expect(await pets.list(andriy)).toEqual([]);
      await expect(pets.get(andriy, buddy)).rejects.toMatchObject({ code: 'pet_not_found' });
      expect((await family.options(marina)).pets[0]?.hasRoom).toBe(true);
      // The old link does not bring the access back.
      expect((await family.accept(andriy, token)).petIds).toEqual([buddy]);
      expect(await pets.list(andriy)).toEqual([]);
    });

    it('a member can leave on their own but cannot remove others', async () => {
      const limitless = new FamilyService({
        repo: new MemoryFamilyRepo(petsRepo, authRepo),
        secret: 'family-test-secret-family-test-secret',
        clock: () => now,
        memberLimit: 5,
      });
      petsRepo.addMember(buddy, andriy, 'editor');
      petsRepo.addMember(buddy, stranger, 'viewer');

      await expect(limitless.removeMember(andriy, buddy, stranger)).rejects.toMatchObject({
        code: 'forbidden',
        statusCode: 403,
      });
      await limitless.removeMember(stranger, buddy, stranger);
      expect((await limitless.members(marina, buddy)).members.map((m) => m.role)).toEqual([
        'owner',
        'editor',
      ]);
    });

    it('never removes the owner', async () => {
      petsRepo.addMember(buddy, andriy, 'editor');
      await expect(family.removeMember(andriy, buddy, marina)).rejects.toMatchObject({
        code: 'owner_cannot_be_removed',
      });
      await expect(family.removeMember(marina, buddy, marina)).rejects.toMatchObject({
        code: 'owner_cannot_be_removed',
      });
    });

    it('hides the member list from people without access', async () => {
      await expect(family.members(stranger, buddy)).rejects.toMatchObject({
        code: 'pet_not_found',
      });
    });
  });

  describe('member list', () => {
    it('shows who has access, with phones masked', async () => {
      petsRepo.addMember(buddy, andriy, 'viewer');
      const { members, memberLimit } = await family.members(andriy, buddy);
      expect(memberLimit).toBe(2);
      expect(members).toEqual([
        { userId: marina, role: 'owner', isYou: false, name: null, phone: '+380 ** *** 11 11' },
        { userId: andriy, role: 'viewer', isYou: true, name: null, phone: '+380 ** *** 22 22' },
      ]);
    });
  });
});

describe('maskPhone', () => {
  it('hides the middle of a Ukrainian number', () => {
    expect(maskPhone('+380671234567')).toBe('+380 ** *** 45 67');
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone('+12025550123')).toBe('+120 ***');
  });
});
