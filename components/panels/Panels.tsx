'use client'

import { ComponentProps, useRef, useEffect } from 'react'
import { ExtractedInfo, Screenshot } from '@/types'
import { UploadButton } from '../upload/UploadButton'
import { SummarizeButton } from '../common/SummarizeButton'
import { ChatInput } from '../chat/ChatInput'
import { ChatMessage as ChatMessageComponent } from '../chat/ChatMessage'
import { NoteEditor } from '../notes/NoteEditor'
import { cn } from '@/lib/utils'
import { useChat } from '@/hooks/useChat'
import { useSessionNote } from '@/hooks/useSessionNote'

interface SummaryPanelProps extends ComponentProps<'div'> {
    entities: ExtractedInfo[]
    screenshots: Screenshot[]
    loading: boolean
    sessionId: string | null
    onSessionChange?: (newSessionId: string) => void
    onRefresh?: () => void
}

export function SummaryPanel({ className, entities, screenshots, loading, sessionId, onSessionChange, onRefresh, ...props }: SummaryPanelProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Note management
    const {
        content: noteContent,
        updateContent: updateNoteContent,
        appendToNote,
        setNoteContent,
        forceSave,
        isSaving: isNoteSaving,
        isLoading: isNoteLoading
    } = useSessionNote({ sessionId })

    // Chat management with note integration
    const { messages, isLoading: isChatLoading, sendMessage } = useChat({
        sessionId,
        entities,
        screenshots,
        selectedEntityIds: new Set(),
        currentNote: noteContent,
        onNoteUpdate: setNoteContent,
        onNoteAppend: appendToNote,
        onEntitiesUpdate: onRefresh
    })

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages.length])

    // Save note on unmount
    useEffect(() => {
        return () => {
            forceSave()
        }
    }, [forceSave])

    return (
        <div className={cn("flex flex-col h-full", className)} {...props}>
            {/* Header */}
            <div className="p-4 border-b border-border flex justify-between items-center bg-white shrink-0">
                <h2 className="font-semibold text-foreground">Notes</h2>
                <div className="flex items-center gap-2">
                    {(loading || isChatLoading || isNoteLoading) && (
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    )}
                </div>
            </div>

            {/* Note Editor */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <NoteEditor
                    content={noteContent}
                    onChange={updateNoteContent}
                    isSaving={isNoteSaving}
                    className="h-full"
                />
            </div>

            {/* Chat Messages */}
            {messages.length > 0 && (
                <>
                    <div className="border-t border-border" />
                    <div className="max-h-[200px] overflow-y-auto p-4 space-y-3 bg-muted/10">
                        {messages.map((msg) => (
                            <ChatMessageComponent
                                key={msg.id}
                                role={msg.role}
                                content={msg.content}
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                </>
            )}

            {/* Chat Input */}
            {sessionId && (
                <div className="border-t border-border shrink-0">
                    <ChatInput
                        onSend={sendMessage}
                        isLoading={isChatLoading}
                        selectedCount={0}
                    />
                </div>
            )}
        </div>
    )
}

interface TimelinePanelProps extends ComponentProps<'div'> {
    screenshots: Screenshot[]
    loading: boolean
    sessionId: string
    onSessionChange?: (newSessionId: string) => void
    onRefresh?: () => void
}

export function TimelinePanel({ className, screenshots, loading, sessionId, onSessionChange, onRefresh, ...props }: TimelinePanelProps) {
    return (
        <div className={cn("flex flex-col h-full", className)} {...props}>
            {/* Header */}
            <div className="p-4 border-b border-border flex justify-between items-center bg-white shrink-0">
                <h2 className="font-semibold text-foreground">Screenshots</h2>
                <span className="text-xs bg-muted px-2 py-1 rounded-full">{screenshots.length}</span>
            </div>

            {/* Screenshots List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {screenshots.length === 0 && !loading ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                        <div className="text-4xl mb-4">📷</div>
                        <p className="font-medium">No screenshots yet</p>
                        <p className="text-sm mt-2">Upload a screenshot to get started</p>
                    </div>
                ) : (
                    screenshots.map(screenshot => (
                        <div
                            key={screenshot.id}
                            className="group relative rounded-lg border border-border overflow-hidden hover:border-primary transition-colors"
                        >
                            <img
                                src={screenshot.image_url}
                                alt="Screenshot"
                                className="w-full h-auto object-cover"
                            />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-2 backdrop-blur-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-white text-xs font-medium">
                                        {new Date(screenshot.created_at).toLocaleTimeString()}
                                    </span>
                                </div>
                                {screenshot.raw_text && (
                                    <p className="text-white/80 text-xs mt-1 line-clamp-2">
                                        {screenshot.raw_text}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-border bg-white space-y-3 shrink-0">
                {/* Summarize Button */}
                {screenshots.length > 0 && (
                    <SummarizeButton
                        sessionId={sessionId}
                        onComplete={(newId) => {
                            if (newId && onSessionChange) onSessionChange(newId)
                            onRefresh?.()
                        }}
                    />
                )}

                {/* Upload Button */}
                <UploadButton sessionId={sessionId} onUploadComplete={onRefresh} />
            </div>
        </div>
    )
}
