import type { PetRole } from '@pet-app/shared';

/** What the current user may do with a pet. The API enforces the same rules; this only hides buttons. */
export function petPermissions(role: PetRole): { canEdit: boolean; canDelete: boolean } {
  return { canEdit: role === 'owner' || role === 'editor', canDelete: role === 'owner' };
}
