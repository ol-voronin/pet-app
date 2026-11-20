export type FamilyErrorCode =
  | 'pet_not_found'
  | 'member_limit'
  | 'invite_not_found'
  | 'invite_expired'
  | 'invite_revoked'
  | 'invite_used'
  | 'own_invite'
  | 'forbidden'
  | 'member_not_found'
  | 'owner_cannot_be_removed';

const statusByCode: Record<FamilyErrorCode, number> = {
  pet_not_found: 404,
  member_limit: 409,
  invite_not_found: 404,
  invite_expired: 410,
  invite_revoked: 410,
  invite_used: 409,
  own_invite: 409,
  forbidden: 403,
  member_not_found: 404,
  owner_cannot_be_removed: 409,
};

export class FamilyError extends Error {
  readonly statusCode: number;
  constructor(readonly code: FamilyErrorCode) {
    super(code);
    this.statusCode = statusByCode[code];
  }
}
