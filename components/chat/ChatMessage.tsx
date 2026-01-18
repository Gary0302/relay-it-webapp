'use client'

import { cn } from '@/lib/utils'
import { User, Bot } from 'lucide-react'

interface ChatMessageProps {
    role: 'user' | 'assistant'
    content: string
}

export function ChatMessage({ role, content }: ChatMessageProps) {
    const isUser = role === 'user'

    return (
        <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
            <div className={cn(
                "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={cn(
                "max-w-[80%] px-4 py-2.5 rounded-2xl text-sm",
                isUser
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
            )}>
                <p className="whitespace-pre-wrap">{content}</p>
            </div>
        </div>
    )
}
