'use client'

import { useState, useCallback, useEffect, useRef, cloneElement, type ReactNode, type ReactElement } from 'react'
import { Bold, Italic, List, ListOrdered, Eye, EyeOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Helper to remove :::ai markers from content
function removeAiMarkers(text: string): string {
    return text.replace(/:::ai\n?/g, '').replace(/\n?:::/g, '')
}

interface NoteEditorProps {
    content: string
    onChange: (content: string) => void
    isSaving?: boolean
    className?: string
}

export function NoteEditor({ content, onChange, isSaving, className }: NoteEditorProps) {
    const [isEditing, setIsEditing] = useState(false)
    const fadeoutTimerRef = useRef<NodeJS.Timeout | null>(null)

    // Auto-remove :::ai markers after animation completes (5 seconds)
    useEffect(() => {
        if (content.includes(':::ai')) {
            // Clear any existing timer
            if (fadeoutTimerRef.current) {
                clearTimeout(fadeoutTimerRef.current)
            }
            
            // Set timer to remove markers after fade animation (5s)
            fadeoutTimerRef.current = setTimeout(() => {
                const cleanedContent = removeAiMarkers(content)
                if (cleanedContent !== content) {
                    onChange(cleanedContent)
                }
            }, 5000)
        }

        return () => {
            if (fadeoutTimerRef.current) {
                clearTimeout(fadeoutTimerRef.current)
            }
        }
    }, [content, onChange])

    const insertMarkdown = useCallback((prefix: string, suffix: string = '') => {
        const textarea = document.getElementById('note-editor') as HTMLTextAreaElement
        if (!textarea) {
            onChange(content + prefix + suffix)
            return
        }

        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const selectedText = content.substring(start, end)

        const newContent =
            content.substring(0, start) +
            prefix + selectedText + suffix +
            content.substring(end)

        onChange(newContent)

        // Reset cursor position after React re-render
        setTimeout(() => {
            textarea.focus()
            const newPos = start + prefix.length + selectedText.length + suffix.length
            textarea.setSelectionRange(newPos, newPos)
        }, 0)
    }, [content, onChange])

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-1">
                    {/* Saving indicator */}
                    <div className={cn(
                        "flex items-center gap-1.5 text-xs text-muted-foreground mr-3 transition-opacity",
                        isSaving ? "opacity-100" : "opacity-0"
                    )}>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Saving...</span>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {/* Format buttons */}
                    <FormatButton
                        icon={<Bold className="w-4 h-4" />}
                        onClick={() => insertMarkdown('**', '**')}
                        title="Bold"
                    />
                    <FormatButton
                        icon={<Italic className="w-4 h-4" />}
                        onClick={() => insertMarkdown('*', '*')}
                        title="Italic"
                    />
                    <FormatButton
                        icon={<List className="w-4 h-4" />}
                        onClick={() => insertMarkdown('- ')}
                        title="Bullet List"
                    />
                    <FormatButton
                        icon={<ListOrdered className="w-4 h-4" />}
                        onClick={() => insertMarkdown('1. ')}
                        title="Numbered List"
                    />

                    <div className="w-px h-4 bg-border mx-2" />

                    {/* Edit/Preview toggle */}
                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        className={cn(
                            "p-1.5 rounded hover:bg-muted transition-colors",
                            isEditing ? "text-primary" : "text-muted-foreground"
                        )}
                        title={isEditing ? "Show Preview" : "Edit Note"}
                    >
                        {isEditing ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Preview (default) / Editor */}
            <div className="flex-1 overflow-hidden">
                {isEditing ? (
                    <textarea
                        id="note-editor"
                        value={content}
                        onChange={(e) => onChange(e.target.value)}
                        onBlur={() => setIsEditing(false)}
                        autoFocus
                        placeholder="Start writing your notes..."
                        className="w-full h-full p-4 resize-none font-mono text-sm bg-background focus:outline-none"
                    />
                ) : (
                    <div 
                        className="h-full overflow-auto p-4 cursor-text"
                        onClick={() => setIsEditing(true)}
                    >
                        {content.trim() ? (
                            <MarkdownPreview content={content} />
                        ) : (
                            <p className="text-muted-foreground text-sm">Click to start writing your notes...</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

interface FormatButtonProps {
    icon: React.ReactNode
    onClick: () => void
    title: string
}

function FormatButton({ icon, onClick, title }: FormatButtonProps) {
    return (
        <button
            onClick={onClick}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={title}
        >
            {icon}
        </button>
    )
}

interface MarkdownPreviewProps {
    content: string
}

function MarkdownPreview({ content }: MarkdownPreviewProps) {
    const lines = content.split('\n')
    const elements: ReactNode[] = []
    // Diff-like highlighting for AI-added content (green background like GitHub diff)
    const aiWrapperClass = "ai-highlight-new bg-green-100 border-l-4 border-green-500 pl-3 pr-2 py-2 my-3 rounded-r-md shadow-sm"
    let key = 0

    const renderLines = (targetLines: string[], wrapAi: boolean) => {
        const localElements: ReactNode[] = []
        let listItems: { type: 'bullet' | 'numbered'; items: string[] } | null = null

        const pushElement = (node: ReactNode) => {
            if (wrapAi) {
                localElements.push(
                    <div key={key++} className={cn("my-2", aiWrapperClass)}>
                        {node}
                    </div>
                )
            } else if (node && typeof node === 'object' && 'type' in (node as any)) {
                localElements.push(cloneElement(node as ReactElement, { key: key++ }))
            } else {
                localElements.push(<span key={key++}>{node}</span>)
            }
        }

        const flushList = () => {
            if (!listItems) return

            if (listItems.type === 'bullet') {
                pushElement(
                    <ul className="list-disc list-inside space-y-1 my-2">
                        {listItems.items.map((item, i) => (
                            <li key={i} className="text-foreground">
                                <InlineMarkdown text={item} />
                            </li>
                        ))}
                    </ul>
                )
            } else {
                pushElement(
                    <ol className="list-decimal list-inside space-y-1 my-2">
                        {listItems.items.map((item, i) => (
                            <li key={i} className="text-foreground">
                                <InlineMarkdown text={item} />
                            </li>
                        ))}
                    </ol>
                )
            }
            listItems = null
        }

        for (const line of targetLines) {
            const trimmed = line.trim()

            // Bullet list
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                if (listItems?.type !== 'bullet') {
                    flushList()
                    listItems = { type: 'bullet', items: [] }
                }
                listItems.items.push(trimmed.slice(2))
                continue
            }

            // Numbered list
            const numberedMatch = trimmed.match(/^\d+\.\s+(.*)/)
            if (numberedMatch) {
                if (listItems?.type !== 'numbered') {
                    flushList()
                    listItems = { type: 'numbered', items: [] }
                }
                listItems.items.push(numberedMatch[1])
                continue
            }

            flushList()

            // Empty line
            if (!trimmed) {
                continue
            }

            // Headings
            if (trimmed.startsWith('### ')) {
                pushElement(
                    <h3 className="text-lg font-semibold mt-4 mb-2 text-foreground">
                        <InlineMarkdown text={trimmed.slice(4)} />
                    </h3>
                )
            } else if (trimmed.startsWith('## ')) {
                pushElement(
                    <h2 className="text-xl font-bold mt-5 mb-2 text-foreground">
                        <InlineMarkdown text={trimmed.slice(3)} />
                    </h2>
                )
            } else if (trimmed.startsWith('# ')) {
                pushElement(
                    <h1 className="text-2xl font-bold mt-6 mb-3 text-foreground">
                        <InlineMarkdown text={trimmed.slice(2)} />
                    </h1>
                )
            } else if (trimmed.startsWith('> ')) {
                // Blockquote
                pushElement(
                    <blockquote className="border-l-3 border-primary pl-4 my-2 italic text-muted-foreground">
                        <InlineMarkdown text={trimmed.slice(2)} />
                    </blockquote>
                )
            } else if (trimmed.startsWith('---') || trimmed.startsWith('***')) {
                // Horizontal rule
                pushElement(<hr className="my-4 border-border" />)
            } else {
                // Regular paragraph
                pushElement(
                    <p className="my-2 text-foreground">
                        <InlineMarkdown text={trimmed} />
                    </p>
                )
            }
        }

        flushList()
        return localElements
    }

    let inAiBlock = false
    let normalBuffer: string[] = []
    let aiBuffer: string[] = []

    const flushNormal = () => {
        if (normalBuffer.length === 0) return
        elements.push(...renderLines(normalBuffer, false))
        normalBuffer = []
    }

    const flushAi = () => {
        if (aiBuffer.length === 0) return
        elements.push(...renderLines(aiBuffer, true))
        aiBuffer = []
    }

    for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === ':::ai') {
            flushNormal()
            flushAi()
            inAiBlock = true
            continue
        }
        if (trimmed === ':::') {
            flushAi()
            inAiBlock = false
            continue
        }

        if (inAiBlock) {
            aiBuffer.push(line)
        } else {
            normalBuffer.push(line)
        }
    }

    flushNormal()
    flushAi()

    return <div className="prose prose-sm max-w-none">{elements}</div>
}

function InlineMarkdown({ text }: { text: string }) {
    // Parse inline markdown: **bold**, *italic*, `code`
    const parts: React.ReactNode[] = []
    let remaining = text
    let partKey = 0

    while (remaining.length > 0) {
        // Bold
        const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
        // Italic
        const italicMatch = remaining.match(/\*(.+?)\*/)
        // Code
        const codeMatch = remaining.match(/`(.+?)`/)

        const matches = [
            boldMatch ? { match: boldMatch, type: 'bold', index: boldMatch.index! } : null,
            italicMatch ? { match: italicMatch, type: 'italic', index: italicMatch.index! } : null,
            codeMatch ? { match: codeMatch, type: 'code', index: codeMatch.index! } : null,
        ].filter(Boolean).sort((a, b) => a!.index - b!.index)

        if (matches.length === 0) {
            parts.push(<span key={partKey++}>{remaining}</span>)
            break
        }

        const first = matches[0]!

        // Add text before match
        if (first.index > 0) {
            parts.push(<span key={partKey++}>{remaining.slice(0, first.index)}</span>)
        }

        // Add formatted text
        if (first.type === 'bold') {
            parts.push(<strong key={partKey++}>{first.match[1]}</strong>)
        } else if (first.type === 'italic') {
            parts.push(<em key={partKey++}>{first.match[1]}</em>)
        } else if (first.type === 'code') {
            parts.push(
                <code key={partKey++} className="px-1 py-0.5 bg-muted rounded text-sm font-mono">
                    {first.match[1]}
                </code>
            )
        }

        remaining = remaining.slice(first.index + first.match[0].length)
    }

    return <>{parts}</>
}
