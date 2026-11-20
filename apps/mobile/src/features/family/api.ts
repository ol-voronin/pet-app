import type {
  CreatedInvite,
  CreateInviteBody,
  InviteOptions,
  InvitePreview,
  PetMembers,
} from '@pet-app/shared';

/** Family endpoints. Implementations throw `ApiError` for HTTP errors and `NetworkError` when offline. */
export interface FamilyApi {
  options(): Promise<InviteOptions>;
  createInvite(body: CreateInviteBody): Promise<CreatedInvite>;
  preview(token: string): Promise<InvitePreview>;
  accept(token: string): Promise<{ petIds: string[] }>;
  members(petId: string): Promise<PetMembers>;
  removeMember(petId: string, userId: string): Promise<void>;
}
