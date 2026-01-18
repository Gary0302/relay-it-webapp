'use client'

import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
    onSend: (message: string) => void
    isLoading: boolean
    selectedCount?: number
    placeholder?: string
}

export function ChatInput({ onSend, isLoading, selectedCount = 0, placeholder }: ChatInputProps) {
    const [message, setMessage] = useState('')

    const defaultPlaceholder = selectedCount > 0
        ? `Ask about ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}...`
        : 'Ask about your captures...'

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (message.trim() && !isLoading) {
            onSend(message.trim())
            setMessage('')
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit(e)
        }
    }

    return (
        <div className="border-t border-border bg-white">
            {selectedCount > 0 && (
                <div className="px-4 pt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    {selectedCount} selected — questions will focus on these items
                </div>
            )}
            <form onSubmit={handleSubmit} className="p-4 flex gap-3">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder || defaultPlaceholder}
                    disabled={isLoading}
                    className={cn(
                        "flex-1 px-4 py-2.5 rounded-lg border border-border bg-muted/30 text-sm",
                        "placeholder:text-muted-foreground",
                        "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                        "transition-all",
                        isLoading && "opacity-60"
                    )}
                />
                <button
                    type="submit"
                    disabled={!message.trim() || isLoading}
                    className={cn(
                        "p-2.5 rounded-lg bg-primary text-primary-foreground",
                        "hover:bg-primary/90 transition-colors",
                        "disabled:opacity-40 disabled:cursor-not-allowed",
                        "flex items-center justify-center"
                    )}
                >
                    {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <Send className="w-5 h-5" />
                    )}
                </button>
            </form>
        </div>
    )
}
