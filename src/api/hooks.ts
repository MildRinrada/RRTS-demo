import { QueryClient, useQuery } from '@tanstack/react-query';
import { api, ApiError } from './client';
import type { Me, PublicConfig, TeamMember } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
  },
});

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: () => api.get<PublicConfig>('/public/config'), staleTime: 5 * 60_000 });
}

/** The signed-in shop user; null when nobody is signed in. */
export function useMe() {
  return useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useTeam() {
  return useQuery({ queryKey: ['team'], queryFn: () => api.get<TeamMember[]>('/shop/team'), staleTime: 5 * 60_000 });
}
