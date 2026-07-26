import { useEffect, useRef } from 'react'
import type { QueryKey } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

/**
 * Subscribes to Postgres changes on `table` via Supabase Realtime and
 * invalidates `queryKey` whenever a row changes, so screens refresh live
 * instead of needing a manual pull-to-refresh — important on a
 * homescreen-installed PWA, where that gesture is awkward. Realtime respects
 * the table's own RLS SELECT policy, so this never surfaces rows the caller
 * couldn't already read.
 */
export function useRealtimeInvalidate(table: string, queryKey: QueryKey, enabled: boolean = true): void {
  const queryClient = useQueryClient()
  const keyString = JSON.stringify(queryKey)
  const channelName = useRef(`rt-${table}-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(channelName.current)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        queryClient.invalidateQueries({ queryKey: JSON.parse(keyString) })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, keyString, enabled])
}
