'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles, ChevronDown, Loader2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface SummarizeButtonProps {
    sessionId: string
    onComplete?: (newSessionId?: string) => void
}

export function SummarizeButton({ sessionId, onComplete }: SummarizeButtonProps) {
    const [loading, setLoading] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const supabase = createClient()

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleSummarize = async (createNewSession: boolean) => {
        setLoading(true)
        setShowMenu(false)
        try {
            // 1. Fetch current session state (exclude existing summaries)
            const { data: session } = await supabase
                .from('sessions')
                .select('*')
                .eq('id', sessionId)
                .single()

            const { data: entities } = await supabase
                .from('extracted_info')
                .select('*')
                .eq('session_id', sessionId)
                .neq('entity_type', 'ai-summary')
                .eq('is_deleted', false)

            if (!entities || entities.length === 0) {
                alert('No content to summarize yet.')
                setLoading(false)
                return
            }

            // 2. Prepare payload
            const payload = {
                sessionId,
                sessionName: session?.name || 'Session',
                entities: entities.map(e => ({
                    type: e.entity_type,
                    attributes: e.data
                }))
            }

            // 3. Call API
            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!response.ok) throw new Error('API request failed')

            const result = await response.json()

            // 4. Handle Result
            let targetSessionId = sessionId

            if (createNewSession) {
                // Create new session
                const { data: newSession, error: createError } = await supabase
                    .from('sessions')
                    .insert({
                        user_id: session?.user_id,
                        name: result.suggestedTitle,
                        description: result.condensedSummary
                    })
                    .select()
                    .single()

                if (createError) throw createError
                targetSessionId = newSession.id
            }

            // 5. Create Summary Entity
            const summaryData: any = {
                summary: result.condensedSummary,
                suggested_title: result.suggestedTitle,
                item_count: entities.length.toString()
            }

            result.keyHighlights?.forEach((h: string, i: number) => {
                summaryData[`highlight_${i + 1}`] = h
            })

            result.recommendations?.forEach((r: string, i: number) => {
                summaryData[`recommendation_${i + 1}`] = r
            })

            const { error: insertError } = await supabase.from('extracted_info').insert({
                session_id: targetSessionId,
                screenshot_ids: [],
                entity_type: 'ai-summary',
                data: summaryData,
                is_deleted: false
            })

            if (insertError) throw insertError

            // Notify completion (pass new ID if created)
            if (onComplete) {
                onComplete(createNewSession ? targetSessionId : undefined)
            }

        } catch (error) {
            console.error('Summarize failed:', error)
            alert('Failed to summarize session')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="relative w-full" ref={menuRef}>
            <div className="flex w-full shadow-sm rounded-lg overflow-hidden">
                <button
                    onClick={() => handleSummarize(false)}
                    disabled={loading}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 text-primary font-semibold hover:bg-primary/20 transition-colors",
                        loading && "opacity-70 cursor-wait"
                    )}
                    title="Summarize Session"
                >
                    {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <Sparkles className="w-5 h-5" />
                    )}
                    {loading ? 'Summarizing...' : 'Summarize All'}
                </button>
                <button
                    onClick={() => setShowMenu(!showMenu)}
                    disabled={loading}
                    className="px-3 bg-primary/10 text-primary hover:bg-primary/20 border-l border-primary/20 transition-colors"
                    title="More options"
                >
                    <ChevronDown className="w-4 h-4" />
                </button>
            </div>

            {showMenu && (
                <div className="absolute right-0 left-0 mt-2 rounded-lg shadow-lg bg-white ring-1 ring-black/5 focus:outline-none z-50">
                    <div className="py-1" role="menu">
                        <button
                            onClick={() => handleSummarize(true)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                            role="menuitem"
                        >
                            <Plus className="w-4 h-4 text-muted-foreground" />
                            Create New Session & Summarize
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
