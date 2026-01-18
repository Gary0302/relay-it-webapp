'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Session, Screenshot, ExtractedInfo, ChatMessage } from '@/types'

export function useSessionData(sessionId: string | null) {
    const [screenshots, setScreenshots] = useState<Screenshot[]>([])
    const [entities, setEntities] = useState<ExtractedInfo[]>([])
    const [summary, setSummary] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const supabase = createClient()

    const fetchData = useCallback(async () => {
        if (!sessionId) {
            setScreenshots([])
            setEntities([])
            setSummary(null)
            return
        }

        setLoading(true)
        setError(null)
        try {
            // Fetch screenshots
            const { data: screens, error: screenError } = await supabase
                .from('screenshots')
                .select('*')
                .eq('session_id', sessionId)
                .order('order_index', { ascending: true })

            if (screenError) throw screenError
            setScreenshots(screens as Screenshot[])

            // Fetch entities (ExtractedInfo)
            const { data: infos, error: infoError } = await supabase
                .from('extracted_info')
                .select('*')
                .eq('session_id', sessionId)
                .eq('is_deleted', false)
                .order('created_at', { ascending: true })

            if (infoError) throw infoError
            setEntities(infos as ExtractedInfo[])

            // Fetch session summary (if stored in session or separate table)
            // For now assuming it's in session description
            const { data: sessionData, error: sessionError } = await supabase
                .from('sessions')
                .select('description')
                .eq('id', sessionId)
                .single()

            if (sessionError) throw sessionError
            setSummary(sessionData?.description || null)

        } catch (err: any) {
            console.error('Error fetching session data:', err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [sessionId, supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const refresh = useCallback(() => {
        fetchData()
    }, [fetchData])

    return { screenshots, entities, summary, loading, error, setScreenshots, setEntities, refresh }
}
