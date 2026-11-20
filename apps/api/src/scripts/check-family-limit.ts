/**
 * Live check of the Free member limit against a real database (QA #50): two people accept two
 * different invites to the same pet at the same moment, with one free place. Exactly one may join.
 *
 *   DATABASE_URL=… pnpm -F api check:family-limit
 *
 * Creates its own users, pet and invites and deletes them at the end. Use the `dev` branch only.
 */
import { randomUUID } from 'node:crypto';
import { createDb, petInvitePets, petInvites, petMembers, pets, users } from '@pet-app/db';
import { FREE_MEMBER_LIMIT } from '@pet-app/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { DrizzleFamilyRepo } from '../modules/family/drizzle-repo.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const db = createDb(url);
const repo = new DrizzleFamilyRepo(db);
const rounds = Number(process.env.ROUNDS ?? 5);

let failures = 0;
for (let round = 1; round <= rounds; round += 1) {
  const [owner, first, second] = [randomUUID(), randomUUID(), randomUUID()];
  const petId = randomUUID();
  const [inviteA, inviteB] = [randomUUID(), randomUUID()];
  const now = new Date();
  const expires = new Date(now.getTime() + 3_600_000);
  await db.batch([
    db.insert(users).values([owner, first, second].map((id) => ({ id }))),
    db.insert(pets).values({ id: petId, name: 'Перевірка ліміту', species: 'dog' }),
    db.insert(petMembers).values({ petId, userId: owner, role: 'owner' }),
    db.insert(petInvites).values(
      [inviteA, inviteB].map((id) => ({
        id,
        tokenHash: `check-${id}`,
        role: 'viewer' as const,
        createdBy: owner,
        expiresAt: expires,
      })),
    ),
    db.insert(petInvitePets).values([inviteA, inviteB].map((inviteId) => ({ inviteId, petId }))),
  ]);

  const accept = (inviteId: string, userId: string) =>
    repo.acceptInvite({
      inviteId,
      userId,
      role: 'viewer',
      petIds: [petId],
      invitedBy: owner,
      memberLimit: FREE_MEMBER_LIMIT,
      now,
    });
  const results = await Promise.all([accept(inviteA, first), accept(inviteB, second)]);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(petMembers)
    .where(eq(petMembers.petId, petId));
  const members = row?.n ?? 0;
  const ok = members <= FREE_MEMBER_LIMIT;
  if (!ok) failures += 1;
  console.log(
    `round ${String(round)}: ${results.join(' + ')} → ${String(members)} members ${ok ? 'OK' : 'OVER THE LIMIT'}`,
  );

  // Cleanup: the pet cascades to members and invite links.
  await db.batch([
    db.delete(pets).where(eq(pets.id, petId)),
    db.delete(users).where(inArray(users.id, [owner, first, second])),
  ]);
}
if (failures > 0) {
  console.error(`${String(failures)} of ${String(rounds)} rounds went over the limit`);
  process.exit(1);
}
console.log('limit held in every round');
