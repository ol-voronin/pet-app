import { z } from 'zod';
import { petRoleSchema, petSpeciesSchema } from '../pets/schemas.js';

/** Free plan: members per pet, the owner included (docs/PRD.md). More — in Plus (V2). */
export const FREE_MEMBER_LIMIT = 2;

/** A family invite link lives this long. */
export const INVITE_TTL_HOURS = 72;

/** An invite grants editing or viewing; ownership is never shared by link. */
export const inviteRoleSchema = z.enum(['editor', 'viewer']);

const invitePetSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  species: petSpeciesSchema,
});

export const inviteOptionsSchema = z
  .object({
    memberLimit: z.number().int(),
    /** Pets the user owns, with room left under the limit. Shown before the invite is sent. */
    pets: z.array(invitePetSchema.extend({ memberCount: z.number().int(), hasRoom: z.boolean() })),
  })
  .meta({ id: 'InviteOptions' });

export const createInviteBodySchema = z
  .object({
    /** One invite can cover several pets. */
    petIds: z.array(z.uuid()).min(1).max(50),
    role: inviteRoleSchema,
  })
  .meta({ id: 'CreateInviteBody' });

export const createdInviteSchema = z
  .object({
    id: z.uuid(),
    /** Secret part of the link. Returned once; the server keeps only its hash. */
    token: z.string(),
    role: inviteRoleSchema,
    expiresAt: z.iso.datetime(),
    pets: z.array(invitePetSchema),
  })
  .meta({ id: 'CreatedInvite' });

export const inviteTokenBodySchema = z
  .object({ token: z.string().min(20).max(200) })
  .meta({ id: 'InviteTokenBody' });

export const personSchema = z.object({
  name: z.string().nullable(),
  /** Phone with the middle hidden, e.g. `+380 ** *** 45 67`. */
  phone: z.string().nullable(),
});

export const invitePreviewSchema = z
  .object({
    role: inviteRoleSchema,
    invitedBy: personSchema,
    expiresAt: z.iso.datetime(),
    pets: z.array(invitePetSchema.extend({ alreadyMember: z.boolean() })),
  })
  .meta({ id: 'InvitePreview' });

export const acceptedInviteSchema = z
  .object({ petIds: z.array(z.uuid()) })
  .meta({ id: 'AcceptedInvite' });

export const inviteParamsSchema = z.object({ inviteId: z.uuid() });

export const petMembersSchema = z
  .object({
    memberLimit: z.number().int(),
    members: z.array(
      personSchema.extend({ userId: z.uuid(), role: petRoleSchema, isYou: z.boolean() }),
    ),
  })
  .meta({ id: 'PetMembers' });

export const petMemberParamsSchema = z.object({ petId: z.uuid(), userId: z.uuid() });

export type InviteRole = z.infer<typeof inviteRoleSchema>;
export type InviteOptions = z.infer<typeof inviteOptionsSchema>;
export type CreateInviteBody = z.infer<typeof createInviteBodySchema>;
export type CreatedInvite = z.infer<typeof createdInviteSchema>;
export type InvitePreview = z.infer<typeof invitePreviewSchema>;
export type PetMembers = z.infer<typeof petMembersSchema>;
