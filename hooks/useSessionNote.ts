'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { SessionNote } from '@/types'

interface UseSessionNoteOptions {
    sessionId: string | null
}

export function useSessionNote({ sessionId }: UseSessionNoteOptions) {
    const [note, setNote] = useState<SessionNote | null>(null)
    const [content, setContent] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const lastSavedContent = useRef('')
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const supabase = createClient()
    const DEFAULT_NOTE_CONTENT = `# Python Dictionary Examples

- Create: \`d = {'a': 1, 'b': 2}\`
- Empty: \`d = {}\` or \`d = dict()\`
- Access: \`value = d['a']\`
- Safe get: \`value = d.get('a', 0)\`
- Update/add: \`d['c'] = 3\` or \`d.update({'d': 4})\`
- Iterate keys: \`for k in d: print(k)\`
- Iterate items: \`for k, v in d.items(): print(k, v)\`
`

    // Load or create note when session changes
    useEffect(() => {
        if (!sessionId) {
            setNote(null)
            setContent('')
            lastSavedContent.current = ''
            return
        }

        const fetchOrCreateNote = async () => {
            setIsLoading(true)
            try {
                // Try to fetch existing note
                const { data: existingNote, error: fetchError } = await supabase
                    .from('session_notes')
                    .select('*')
                    .eq('session_id', sessionId)
                    .single()

                if (existingNote) {
                    setNote(existingNote)
                    if (existingNote.content?.trim()) {
                        setContent(existingNote.content)
                        lastSavedContent.current = existingNote.content
                    } else {
                        const seededContent = DEFAULT_NOTE_CONTENT
                        setContent(seededContent)
                        lastSavedContent.current = seededContent
                        const { error: seedError } = await supabase
                            .from('session_notes')
                            .update({ content: seededContent })
                            .eq('id', existingNote.id)
                        if (seedError) throw seedError
                    }
                } else if (fetchError?.code === 'PGRST116') {
                    // Note doesn't exist, create one
                    const { data: newNote, error: createError } = await supabase
                        .from('session_notes')
                        .insert({
                            session_id: sessionId,
                            content: DEFAULT_NOTE_CONTENT
                        })
                        .select()
                        .single()

                    if (createError) throw createError
                    setNote(newNote)
                    setContent(DEFAULT_NOTE_CONTENT)
                    lastSavedContent.current = DEFAULT_NOTE_CONTENT
                } else if (fetchError) {
                    throw fetchError
                }
            } catch (error) {
                console.error('Failed to load/create note:', error)
            } finally {
                setIsLoading(false)
            }
        }

        fetchOrCreateNote()
    }, [sessionId, supabase])

    // Save note to database
    const saveNote = useCallback(async (newContent: string) => {
        if (!note?.id || newContent === lastSavedContent.current) return

        setIsSaving(true)
        try {
            const { data, error } = await supabase
                .from('session_notes')
                .update({ content: newContent })
                .eq('id', note.id)
                .select()
                .single()

            if (error) throw error
            setNote(data)
            lastSavedContent.current = newContent
        } catch (error) {
            console.error('Failed to save note:', error)
        } finally {
            setIsSaving(false)
        }
    }, [note?.id, supabase])

    // Debounced content update with auto-save
    const updateContent = useCallback((newContent: string) => {
        setContent(newContent)

        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }

        // Set new timeout for auto-save (0.8s debounce like Swift app)
        saveTimeoutRef.current = setTimeout(() => {
            saveNote(newContent)
        }, 800)
    }, [saveNote])

    // Append text to note (used by chat/AI)
    const appendToNote = useCallback((text: string) => {
        const newContent = content ? `${content}\n\n${text}` : text
        setContent(newContent)
        saveNote(newContent)
    }, [content, saveNote])

    // Set note content directly (used when AI modifies note)
    const setNoteContent = useCallback((newContent: string) => {
        setContent(newContent)
        saveNote(newContent)
    }, [saveNote])

    // Force save (on component unmount)
    const forceSave = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }
        if (content !== lastSavedContent.current) {
            saveNote(content)
        }
    }, [content, saveNote])

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [])

    return {
        note,
        content,
        updateContent,
        appendToNote,
        setNoteContent,
        forceSave,
        isSaving,
        isLoading
    }
}
