'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { ChatMessage, ExtractedInfo, Screenshot } from '@/types'

const API_BASE = 'https://relay-that-backend.vercel.app'

interface UseChatOptions {
    sessionId: string | null
    entities: ExtractedInfo[]
    screenshots: Screenshot[]
    selectedEntityIds: Set<string>
    onEntitiesUpdate?: () => void
}

export function useChat({ sessionId, entities, screenshots, selectedEntityIds, onEntitiesUpdate }: UseChatOptions) {
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
                        // Avoid duplicates
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

            // Build context from selected entities (or all if none selected)
            const contextEntities = selectedEntityIds.size > 0
                ? entities.filter(e => selectedEntityIds.has(e.id))
                : entities

            if (contextEntities.length === 0) {
                await addAssistantMessage("I see your captures but need more context. Try selecting specific items or uploading more screenshots with clear content!")
                return
            }

            // Build screens array - include entities even without screenshots
            const screens = contextEntities.map(entity => {
                const screenshot = entity.screenshot_ids.length > 0
                    ? screenshots.find(s => entity.screenshot_ids.includes(s.id))
                    : null
                return {
                    id: entity.screenshot_ids[0] || entity.id,
                    analysis: {
                        rawText: screenshot?.raw_text || '',
                        summary: entity.data.summary || '',
                        category: 'other',
                        entities: [{
                            type: entity.entity_type || 'generic',
                            title: entity.data.title || entity.data.suggested_title,
                            attributes: entity.data
                        }],
                        suggestedNotebookTitle: null
                    }
                }
            })

            // Build request payload
            const selectedContext = selectedEntityIds.size > 0
                ? `\n\n[User has selected ${selectedEntityIds.size} items to discuss]`
                : ''

            const payload = {
                sessionId,
                previousSession: {
                    sessionSummary: `Session with captured screenshots${selectedContext}\n\nUser asked: ${userMessage}`,
                    sessionCategory: 'other',
                    entities: contextEntities.map(e => ({
                        type: e.entity_type || 'generic',
                        title: e.data.title,
                        attributes: e.data
                    }))
                },
                screens
            }

            // Call regenerate API
            const response = await fetch(`${API_BASE}/api/regenerate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!response.ok) throw new Error('API request failed')

            const result = await response.json()

            // Add AI response
            const aiResponse = result.sessionSummary || "I've analyzed your captures. How can I help you with them?"
            await addAssistantMessage(aiResponse)

        } catch (error) {
            console.error('Chat error:', error)
            await addAssistantMessage("Sorry, I encountered an error. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }, [sessionId, entities, screenshots, selectedEntityIds])

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
            let responseText = `📝 **${result.suggestedTitle}**\n\n${result.condensedSummary}`

            if (result.keyHighlights?.length > 0) {
                responseText += '\n\n**Key Highlights:**\n' + result.keyHighlights.map((h: string) => `• ${h}`).join('\n')
            }

            if (result.recommendations?.length > 0) {
                responseText += '\n\n**Recommendations:**\n' + result.recommendations.map((r: string) => `• ${r}`).join('\n')
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
        const savedMsg = await saveMessage('assistant', content)
        if (savedMsg) {
            setMessages(prev => {
                if (prev.some(m => m.id === savedMsg.id)) return prev
                return [...prev, savedMsg]
            })
        }
        setIsLoading(false)
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
