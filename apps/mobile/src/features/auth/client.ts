import { createApiClient } from '@pet-app/shared';
import { API_URL } from '@/shared/config';
import { authMiddleware } from './middleware';
import { session } from './store';

/** API client for signed-in requests (see `authMiddleware`). */
export const api = createApiClient(API_URL);

api.use(authMiddleware(session));
