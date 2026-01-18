'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { ChatMessage, ExtractedInfo, Screenshot } from '@/types'

// Use local proxy to avoid CORS issues (configured in next.config.ts)
const API_BASE = ''

// Helper function to find and mark AI-added content
function markAiAdditions(oldContent: string, newContent: string): string {
    // If old content is empty, mark everything as AI-added
    if (!oldContent.trim()) {
        return newContent
    }

    // Find the common prefix (unchanged content at the start)
    let prefixEnd = 0
    const minLen = Math.min(oldContent.length, newContent.length)
    while (prefixEnd < minLen && oldContent[prefixEnd] === newContent[prefixEnd]) {
        prefixEnd++
    }

    // Find the common suffix (unchanged content at the end)
    let oldSuffixStart = oldContent.length
    let newSuffixStart = newContent.length
    while (
        oldSuffixStart > prefixEnd &&
        newSuffixStart > prefixEnd &&
        oldContent[oldSuffixStart - 1] === newContent[newSuffixStart - 1]
    ) {
        oldSuffixStart--
        newSuffixStart--
    }

    // Extract the parts
    const prefix = newContent.slice(0, prefixEnd)
    const addedContent = newContent.slice(prefixEnd, newSuffixStart)
    const suffix = newContent.slice(newSuffixStart)

    // If there's added content, wrap it with :::ai markers
    if (addedContent.trim()) {
        // Clean up: ensure proper line breaks around markers
        const cleanPrefix = prefix.endsWith('\n') ? prefix : (prefix ? prefix + '\n' : '')
        const cleanSuffix = suffix.startsWith('\n') ? suffix : (suffix ? '\n' + suffix : '')
        const cleanAdded = addedContent.trim()

        return `${cleanPrefix}\n:::ai\n${cleanAdded}\n:::\n${cleanSuffix}`.replace(/\n{3,}/g, '\n\n')
    }

    return newContent
}

interface UseChatOptions {
    sessionId: string | null
    entities: ExtractedInfo[]
    screenshots: Screenshot[]
    selectedEntityIds: Set<string>
    currentNote: string
    onNoteUpdate?: (newContent: string) => void
    onNoteAppend?: (text: string) => void
    onEntitiesUpdate?: () => void
}

interface ChatContext {
    screenshots: Array<{
        id: string
        rawText: string
        summary: string
    }>
    sessionName?: string | null
    sessionCategory?: string | null
}

interface ChatResponse {
    reply: string
    updatedNote?: string | null
    noteWasModified: boolean
}

export function useChat({
    sessionId,
    entities,
    screenshots,
    selectedEntityIds,
    currentNote,
    onNoteUpdate,
    onNoteAppend,
    onEntitiesUpdate
}: UseChatOptions) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const supabase = createClient()

    // Load chat history when session changes
    useEffect(() => {
        if (!sessionId) {
            setMessages([])
            return
        }

        const loadMessages = async () => {
            setIsLoadingHistory(true)
            try {
                const { data, error } = await supabase
                    .from('chat_messages')
                    .select('*')
                    .eq('session_id', sessionId)
                    .order('created_at', { ascending: true })

                if (error) throw error
                setMessages(data || [])
            } catch (error) {
                console.error('Failed to load chat history:', error)
            } finally {
                setIsLoadingHistory(false)
            }
        }

        loadMessages()

        // Subscribe to real-time updates
        const channel = supabase
            .channel(`chat_messages:${sessionId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `session_id=eq.${sessionId}`
                },
                (payload) => {
                    const newMessage = payload.new as ChatMessage
                    setMessages(prev => {
                        if (prev.some(m => m.id === newMessage.id)) return prev
                        return [...prev, newMessage]
                    })
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [sessionId, supabase])

    const isSummarizeCommand = (message: string): boolean => {
        const lowered = message.toLowerCase()
        const keywords = ['summarize', 'summary', '總結', '摘要', '概括']
        return keywords.some(kw => lowered.includes(kw))
    }

    // Save message to Supabase
    const saveMessage = async (role: 'user' | 'assistant', content: string): Promise<ChatMessage | null> => {
        if (!sessionId) return null

        try {
            const { data, error } = await supabase
                .from('chat_messages')
                .insert({
                    session_id: sessionId,
                    role,
                    content
                })
                .select()
                .single()

            if (error) throw error
            return data
        } catch (error) {
            console.error('Failed to save message:', error)
            return null
        }
    }

    const sendMessage = useCallback(async (userMessage: string) => {
        if (!sessionId || !userMessage.trim()) return

        setIsLoading(true)

        // Save and add user message
        const savedUserMsg = await saveMessage('user', userMessage)
        if (savedUserMsg) {
            setMessages(prev => {
                if (prev.some(m => m.id === savedUserMsg.id)) return prev
                return [...prev, savedUserMsg]
            })
        }

        try {
            // Check if summarize command
            if (isSummarizeCommand(userMessage)) {
                await handleSummarizeCommand(userMessage)
                return
            }

            // Build context (without screenshots to allow direct note modifications)
            const context: ChatContext = {
                screenshots: [],
                sessionName: null,
                sessionCategory: null
            }

            // Call /api/chat endpoint with timeout
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s timeout

            const response = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    userMessage,
                    currentNote,
                    context
                }),
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                const errorText = await response.text()
                console.error('API error response:', response.status, errorText)
                throw new Error(`API request failed: ${response.status}`)
            }

            const result: ChatResponse = await response.json()
            console.log('Chat API response:', result)

            // Handle response - ensure we have a valid reply
            const aiResponse = result.reply || "I processed your request."
            await addAssistantMessage(aiResponse)

            // Handle note updates (wrapped in try-catch to not fail the whole chat)
            try {
                if (result.noteWasModified && result.updatedNote) {
                    // AI modified the note - mark the additions with :::ai
                    const markedContent = markAiAdditions(currentNote, result.updatedNote)
                    onNoteUpdate?.(markedContent)
                } else if (!result.noteWasModified) {
                    // AI answered a question - append to note log with AI highlighting
                    const chatLog = `\n\n:::ai\n---\n\n**You:** ${userMessage}\n\n**AI:** ${aiResponse}\n:::`
                    onNoteAppend?.(chatLog)
                }
            } catch (noteError) {
                console.error('Failed to update note:', noteError)
                // Don't throw - chat message was already saved
            }

        } catch (error) {
            console.error('Chat error:', error)
            let errorMessage = 'Unknown error'
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    errorMessage = 'Request timed out. Please try again.'
                } else if (error.message === 'Failed to fetch') {
                    errorMessage = 'Network error. Please check your connection and try again.'
                } else {
                    errorMessage = error.message
                }
            }
            await addAssistantMessage(`Sorry, I encountered an error: ${errorMessage}`)
        } finally {
            setIsLoading(false)
        }
    }, [sessionId, entities, screenshots, selectedEntityIds, currentNote, onNoteUpdate, onNoteAppend])

    const handleSummarizeCommand = async (userQuery: string) => {
        try {
            // Filter out existing summaries
            const contextEntities = selectedEntityIds.size > 0
                ? entities.filter(e => selectedEntityIds.has(e.id) && e.entity_type !== 'ai-summary')
                : entities.filter(e => e.entity_type !== 'ai-summary')

            if (contextEntities.length === 0) {
                await addAssistantMessage("There's nothing to summarize yet. Upload some screenshots first!")
                return
            }

            // Call summarize API
            const payload = {
                sessionId,
                sessionName: 'Chat Summary',
                entities: contextEntities.map(e => ({
                    type: e.entity_type || 'generic',
                    title: e.data.title,
                    attributes: e.data
                }))
            }

            const response = await fetch(`${API_BASE}/api/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!response.ok) throw new Error('API request failed')

            const result = await response.json()

            // Create summary entity in database
            const summaryData: Record<string, any> = {
                summary: result.condensedSummary,
                suggested_title: result.suggestedTitle,
                item_count: contextEntities.length.toString(),
                user_query: userQuery
            }

            result.keyHighlights?.forEach((h: string, i: number) => {
                summaryData[`highlight_${i + 1}`] = h
            })

            result.recommendations?.forEach((r: string, i: number) => {
                summaryData[`recommendation_${i + 1}`] = r
            })

            await supabase.from('extracted_info').insert({
                session_id: sessionId,
                screenshot_ids: [],
                entity_type: 'ai-summary',
                data: summaryData,
                is_deleted: false
            })

            // Build response message
            let responseText = `**${result.suggestedTitle}**\n\n${result.condensedSummary}`

            if (result.keyHighlights?.length > 0) {
                responseText += '\n\n**Key Highlights:**\n' + result.keyHighlights.map((h: string) => `- ${h}`).join('\n')
            }

            if (result.recommendations?.length > 0) {
                responseText += '\n\n**Recommendations:**\n' + result.recommendations.map((r: string) => `- ${r}`).join('\n')
            }

            await addAssistantMessage(responseText)

            // Trigger data refresh
            onEntitiesUpdate?.()

        } catch (error) {
            console.error('Summarize error:', error)
            await addAssistantMessage("Sorry, I couldn't create a summary. Please try again.")
        }
    }

    const addAssistantMessage = async (content: string) => {
        try {
            const savedMsg = await saveMessage('assistant', content)
            if (savedMsg) {
                setMessages(prev => {
                    if (prev.some(m => m.id === savedMsg.id)) return prev
                    return [...prev, savedMsg]
                })
            } else {
                // Failed to save to DB, but still show in UI
                setMessages(prev => [...prev, {
                    id: `temp-${Date.now()}`,
                    session_id: sessionId || '',
                    role: 'assistant' as const,
                    content,
                    created_at: new Date().toISOString()
                }])
            }
        } catch (error) {
            console.error('Failed to add assistant message:', error)
            // Still show message in UI even if DB save fails
            setMessages(prev => [...prev, {
                id: `temp-${Date.now()}`,
                session_id: sessionId || '',
                role: 'assistant' as const,
                content,
                created_at: new Date().toISOString()
            }])
        } finally {
            setIsLoading(false)
        }
    }

    const clearMessages = useCallback(async () => {
        if (!sessionId) return

        try {
            await supabase
                .from('chat_messages')
                .delete()
                .eq('session_id', sessionId)

            setMessages([])
        } catch (error) {
            console.error('Failed to clear messages:', error)
        }
    }, [sessionId, supabase])

    return {
        messages,
        isLoading,
        isLoadingHistory,
        sendMessage,
        clearMessages
    }
}
