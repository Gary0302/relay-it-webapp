'use client'

import { ComponentProps, useState, useMemo, useRef, useEffect } from 'react'
import { ExtractedInfo, Screenshot, ChatMessage } from '@/types'
import { UploadButton } from '../upload/UploadButton'
import { SummarizeButton } from '../common/SummarizeButton'
import { ChatInput } from '../chat/ChatInput'
import { ChatMessage as ChatMessageComponent } from '../chat/ChatMessage'
import { Search, X, Check, Circle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChat } from '@/hooks/useChat'
import { createClient } from '@/lib/supabase'

interface SummaryPanelProps extends ComponentProps<'div'> {
  entities: ExtractedInfo[]
  screenshots: Screenshot[]
  loading: boolean
  sessionId: string | null
  onSessionChange?: (newSessionId: string) => void
  onRefresh?: () => void
}

export function SummaryPanel({ className, entities, screenshots, loading, sessionId, onSessionChange, onRefresh, ...props }: SummaryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const { messages, isLoading: isChatLoading, sendMessage } = useChat({
    sessionId,
    entities,
    screenshots,
    selectedEntityIds: selectedIds,
    onEntitiesUpdate: onRefresh
  })

  // Filter entities by search
  const filteredEntities = useMemo(() => {
    if (!searchQuery.trim()) return entities
    const query = searchQuery.toLowerCase()
    return entities.filter(entity => {
      if (entity.entity_type?.toLowerCase().includes(query)) return true
      for (const [key, value] of Object.entries(entity.data)) {
        if (key.toLowerCase().includes(query)) return true
        if (String(value).toLowerCase().includes(query)) return true
      }
      return false
    })
  }, [entities, searchQuery])

  // Combine entities and chat messages into timeline
  const timelineItems = useMemo(() => {
    const items: Array<{ type: 'entity' | 'chat'; data: ExtractedInfo | ChatMessage; timestamp: string }> = []

    filteredEntities.forEach(entity => {
      items.push({ type: 'entity', data: entity, timestamp: entity.created_at })
    })

    messages.forEach(msg => {
      items.push({ type: 'chat', data: msg, timestamp: msg.created_at })
    })

    return items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [filteredEntities, messages])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleDelete = async () => {
    if (selectedIds.size === 0) return
    setIsDeleting(true)
    try {
      for (const id of selectedIds) {
        await supabase
          .from('extracted_info')
          .update({ is_deleted: true })
          .eq('id', id)
      }
      setSelectedIds(new Set())
      onRefresh?.()
    } catch (error) {
      console.error('Delete failed:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const getEntityColor = (type: string) => {
    const colors: Record<string, string> = {
      hotel: 'bg-blue-100 text-blue-700',
      restaurant: 'bg-orange-100 text-orange-700',
      job: 'bg-green-100 text-green-700',
      product: 'bg-purple-100 text-purple-700',
      flight: 'bg-cyan-100 text-cyan-700',
      article: 'bg-indigo-100 text-indigo-700',
      'ai-summary': 'bg-amber-100 text-amber-700',
    }
    return colors[type.toLowerCase()] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className={cn("flex flex-col", className)} {...props}>
      {/* Header */}
      <div className="p-4 border-b border-border flex justify-between items-center bg-white">
        <h2 className="font-semibold text-foreground">Summaries</h2>
        <div className="flex items-center gap-2">
          {(loading || isChatLoading) && (
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
          {sessionId && (
            <SummarizeButton
              sessionId={sessionId}
              onComplete={(newId) => {
                if (newId && onSessionChange) onSessionChange(newId)
                onRefresh?.()
              }}
            />
          )}
        </div>
      </div>

      {/* Search */}
      <div className="p-3 bg-muted/20 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search summaries..."
            className="w-full pl-9 pr-9 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {timelineItems.length === 0 && !loading ? (
          <div className="text-center text-muted-foreground mt-10">
            <p>No data yet</p>
            <p className="text-sm mt-2">Upload a screenshot to get started</p>
          </div>
        ) : (
          timelineItems.map((item) => {
            if (item.type === 'chat') {
              const msg = item.data as ChatMessage
              return <ChatMessageComponent key={msg.id} role={msg.role} content={msg.content} />
            }

            const entity = item.data as ExtractedInfo
            const isSelected = selectedIds.has(entity.id)

            return (
              <div
                key={entity.id}
                className={cn(
                  "p-4 rounded-lg border bg-white shadow-sm transition-all",
                  isSelected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                )}
              >
                <div className="flex items-center gap-3 mb-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelection(entity.id)}
                    className="flex-shrink-0"
                  >
                    {isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>

                  {/* Entity type badge */}
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium uppercase",
                    getEntityColor(entity.entity_type || 'entity')
                  )}>
                    {entity.entity_type || 'Entity'}
                  </span>
                </div>

                {/* Data fields */}
                <div className="space-y-1.5 pl-8">
                  {Object.entries(entity.data).map(([key, value]) => (
                    <div key={key} className="text-sm grid grid-cols-[100px_1fr] gap-2">
                      <span className="text-muted-foreground truncate capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="text-foreground">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Selection Actions */}
      {selectedIds.size > 0 && (
        <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Chat Input */}
      {sessionId && (
        <ChatInput
          onSend={sendMessage}
          isLoading={isChatLoading}
          selectedCount={selectedIds.size}
        />
      )}
    </div>
  )
}

interface TimelinePanelProps extends ComponentProps<'div'> {
  screenshots: Screenshot[]
  loading: boolean
  sessionId: string
  onRefresh?: () => void
}

export function TimelinePanel({ className, screenshots, loading, sessionId, onRefresh, ...props }: TimelinePanelProps) {
  return (
    <div className={cn("flex flex-col", className)} {...props}>
      <div className="p-4 border-b border-border flex justify-between items-center bg-white">
        <h2 className="font-semibold text-foreground">Timeline</h2>
        <span className="text-xs bg-muted px-2 py-1 rounded-full">{screenshots.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {screenshots.map(screenshot => (
          <div key={screenshot.id} className="group relative rounded-lg border border-border overflow-hidden hover:border-primary transition-colors">
            <img
              src={screenshot.image_url}
              alt="Screenshot"
              className="w-full h-auto object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-2 text-white text-xs backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
              {new Date(screenshot.created_at).toLocaleTimeString()}
            </div>
          </div>
        ))}

        {screenshots.length === 0 && !loading && (
          <div className="text-center text-muted-foreground mt-10">
            No screenshots yet.
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border bg-white">
        <UploadButton sessionId={sessionId} onUploadComplete={onRefresh} />
      </div>
    </div>
  )
}
