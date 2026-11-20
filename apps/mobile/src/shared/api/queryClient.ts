import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './http';

/** One cache for the app. Cleared on sign-out so the next user never sees someone else's pets. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retrying a 4xx only repeats the same answer; retry network and server errors once.
      retry: (failures, error) =>
        failures < 1 && !(error instanceof ApiError && error.status < 500),
    },
  },
});
