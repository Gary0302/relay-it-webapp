export interface Session {
    id: string
    user_id: string
    name: string
    description?: string
    created_at: string
    updated_at: string
}

export interface Screenshot {
    id: string
    session_id: string
    image_url: string
    order_index: number
    raw_text?: string
    created_at: string
}

export interface ExtractedInfo {
    id: string
    session_id: string
    screenshot_ids: string[]
    entity_type?: string
    data: Record<string, any>
    is_deleted: boolean
    created_at: string
    updated_at: string
}

export interface ChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    created_at: string
}
