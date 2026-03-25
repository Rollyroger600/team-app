import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // data is fresh for 30s — no refetch on re-focus during that window
      retry: 1,
    },
  },
})
