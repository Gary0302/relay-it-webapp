'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, MessageSquare, Trash2, Edit2, MoreVertical, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Session } from '@/types'
import { createClient } from '@/lib/supabase'

interface SidebarProps {
    currentSessionId: string | null
    onSelectSession: (id: string) => void
    refreshTrigger?: number  // Increment to trigger refresh
}

export function Sidebar({ currentSessionId, onSelectSession, refreshTrigger }: SidebarProps) {
    const [sessions, setSessions] = useState<Session[]>([])
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const supabase = createClient()
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        fetchSessions()
    }, [refreshTrigger])

    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus()
        }
    }, [editingId])

    const fetchSessions = async () => {
        try {
            const { data, error } = await supabase
                .from('sessions')
                .select('*')
                .order('updated_at', { ascending: false })

            if (data) {
                setSessions(data as Session[])
                if (!currentSessionId && data.length > 0) {
                    onSelectSession(data[0].id)
                }
            }
        } catch (error) {
            console.error('Error fetching sessions:', error)
        } finally {
            setLoading(false)
        }
    }

    const createSession = async () => {
        const name = `New Session ${sessions.length + 1}`
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
            .from('sessions')
            .insert({ user_id: user.id, name })
            .select()
            .single()

        if (data) {
            setSessions([data as Session, ...sessions])
            onSelectSession(data.id)
            // Auto-enter edit mode for new session
            setEditingId(data.id)
            setEditName(data.name)
        }
    }

    const deleteSession = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (deleteConfirmId !== id) {
            setDeleteConfirmId(id)
            // Auto-clear confirm after 3s
            setTimeout(() => setDeleteConfirmId(null), 3000)
            return
        }

        const { error } = await supabase
            .from('sessions')
            .delete()
            .eq('id', id)

        if (!error) {
            const newSessions = sessions.filter(s => s.id !== id)
            setSessions(newSessions)
            if (currentSessionId === id && newSessions.length > 0) {
                onSelectSession(newSessions[0].id)
            } else if (newSessions.length === 0) {
                onSelectSession('') // Clear selection? logic might need tweaking in parent but passing empty string is safeish
            }
        }
    }

    const startEditing = (session: Session, e: React.MouseEvent) => {
        e.stopPropagation()
        setEditingId(session.id)
        setEditName(session.name)
        setDeleteConfirmId(null)
    }

    const saveEdit = async () => {
        if (!editingId) return

        // Optimistic update
        const updatedSessions = sessions.map(s =>
            s.id === editingId ? { ...s, name: editName } : s
        )
        setSessions(updatedSessions)

        const { error } = await supabase
            .from('sessions')
            .update({ name: editName })
            .eq('id', editingId)

        setEditingId(null)
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditName('')
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric'
        }).format(date)
    }

    return (
        <div className="h-full flex flex-col bg-muted/30 border-r border-border font-sans">
            <div className="p-4 border-b border-border flex items-center justify-between bg-background/50 backdrop-blur-sm sticky top-0 z-10">
                <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    Sessions
                </h2>
                <button
                    onClick={createSession}
                    className="p-1.5 bg-primary/20 hover:bg-primary text-primary-foreground rounded-md transition-colors"
                    title="New Session"
                >
                    <Plus className="w-4 h-4 text-primary-foreground" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                        ))}
                    </div>
                ) : sessions.map(session => (
                    <div
                        key={session.id}
                        onClick={() => editingId !== session.id && onSelectSession(session.id)}
                        className={cn(
                            "group relative w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer",
                            currentSessionId === session.id
                                ? "bg-primary/20 border-primary shadow-sm md:shadow-md ring-1 ring-primary"
                                : "bg-white border-primary/30 hover:border-primary hover:bg-primary/5"
                        )}
                    >
                        {editingId === session.id ? (
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') saveEdit()
                                        if (e.key === 'Escape') cancelEdit()
                                    }}
                                    className="flex-1 bg-background border border-primary/30 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <button onClick={saveEdit} className="p-1 text-green-600 hover:bg-green-100 rounded">
                                    <Check className="w-3 h-3" />
                                </button>
                                <button onClick={cancelEdit} className="p-1 text-red-500 hover:bg-red-100 rounded">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="flex justify-between items-start mb-1 h-6">
                                    <span className={cn(
                                        "font-medium truncate pr-6 text-sm",
                                        currentSessionId === session.id ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                                    )}>
                                        {session.name}
                                    </span>

                                    <div className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-md p-0.5 shadow-sm border border-border">
                                        <button
                                            onClick={(e) => startEditing(session, e)}
                                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                                            title="Rename"
                                        >
                                            <Edit2 className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={(e) => deleteSession(session.id, e)}
                                            className={cn(
                                                "p-1.5 rounded-md transition-colors",
                                                deleteConfirmId === session.id
                                                    ? "text-red-600 bg-red-100 hover:bg-red-200"
                                                    : "text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                            )}
                                            title={deleteConfirmId === session.id ? "Click to confirm delete" : "Delete"}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-[10px] text-foreground/80 font-medium">
                                    {session.updated_at ? formatDate(session.updated_at) : 'Just now'}
                                </div>
                            </>
                        )}
                    </div>
                ))}

                {sessions.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                        <MessageSquare className="w-8 h-8 opacity-20" />
                        <span className="text-xs">No sessions created yet</span>
                    </div>
                )}
            </div>
        </div>
    )
}
