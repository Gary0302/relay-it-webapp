'use client'

import { useState, useRef, useEffect } from 'react'
import { FileText, ChevronDown, Loader2, Plus } from 'lucide-react'
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
            const response = await fetch('https://relay-that-backend.vercel.app/api/summarize', {
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
        <div className="relative inline-flex shadow-sm rounded-md" ref={menuRef}>
            <button
                onClick={() => handleSummarize(false)}
                disabled={loading}
                className={cn(
                    "relative inline-flex items-center px-4 py-2 rounded-l-md border border-primary/20 bg-primary/10 text-sm font-medium text-primary hover:bg-primary/20 focus:z-10 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors",
                    loading && "opacity-70 cursor-wait"
                )}
                title="Summarize Session"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                Summarize
            </button>
            <div className="-ml-px relative block">
                <button
                    onClick={() => setShowMenu(!showMenu)}
                    disabled={loading}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-primary/20 bg-primary/10 text-sm font-medium text-primary hover:bg-primary/20 focus:z-10 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors h-full"
                    title="More options"
                >
                    <ChevronDown className="w-4 h-4" />
                </button>

                {showMenu && (
                    <div className="origin-top-right absolute right-0 mt-2 -mr-1 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                        <div className="py-1" role="menu" aria-orientation="vertical">
                            <button
                                onClick={() => handleSummarize(true)}
                                className="w-full text-left group flex items-center px-4 py-2 text-sm text-foreground hover:bg-muted"
                                role="menuitem"
                            >
                                <Plus className="mr-3 h-4 w-4 text-muted-foreground group-hover:text-primary" />
                                Create New Session & Summarize
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
