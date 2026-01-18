# Chat Integration Guide

## Database Schema

### `chat_messages` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `session_id` | UUID | Foreign key to `sessions.id` |
| `role` | TEXT | Either `'user'` or `'assistant'` |
| `content` | TEXT | Message content |
| `created_at` | TIMESTAMPTZ | Auto-generated timestamp |

### SQL Migration

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(session_id, created_at);

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own chat messages"
    ON chat_messages FOR SELECT
    USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert chat messages to their own sessions"
    ON chat_messages FOR INSERT
    WITH CHECK (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own chat messages"
    ON chat_messages FOR DELETE
    USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
```

---

## API Usage

### Load Chat History

```swift
// Swift
let messages = try await supabase
    .from("chat_messages")
    .select()
    .eq("session_id", sessionId)
    .order("created_at", ascending: true)
    .execute()
    .value
```

```typescript
// TypeScript
const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
```

### Save Message

```swift
// Swift
try await supabase
    .from("chat_messages")
    .insert([
        "session_id": sessionId,
        "role": "user", // or "assistant"
        "content": messageContent
    ])
    .execute()
```

```typescript
// TypeScript
const { data, error } = await supabase
    .from('chat_messages')
    .insert({
        session_id: sessionId,
        role: 'user', // or 'assistant'
        content: messageContent
    })
    .select()
    .single()
```

### Delete All Messages (Clear Chat)

```swift
// Swift
try await supabase
    .from("chat_messages")
    .delete()
    .eq("session_id", sessionId)
    .execute()
```

```typescript
// TypeScript
await supabase
    .from('chat_messages')
    .delete()
    .eq('session_id', sessionId)
```

---

## Real-time Subscription

### Swift

```swift
let channel = supabase.channel("chat_messages:\(sessionId)")

channel.on("postgres_changes", filter: .init(
    event: .insert,
    schema: "public",
    table: "chat_messages",
    filter: "session_id=eq.\(sessionId)"
)) { payload in
    let newMessage = payload.newRecord
    // Handle new message
}

await channel.subscribe()

// Cleanup
await supabase.removeChannel(channel)
```

### TypeScript

```typescript
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
            const newMessage = payload.new
            // Handle new message
        }
    )
    .subscribe()

// Cleanup
supabase.removeChannel(channel)
```

---

## TypeScript Types

```typescript
interface ChatMessage {
    id: string
    session_id: string
    role: 'user' | 'assistant'
    content: string
    created_at: string
}
```

## Swift Model

```swift
struct ChatMessage: Codable, Identifiable {
    let id: UUID
    let sessionId: UUID
    let role: String  // "user" or "assistant"
    let content: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case sessionId = "session_id"
        case role
        case content
        case createdAt = "created_at"
    }
}
```

---

## Chat Flow

1. **User sends message**
   - Save to `chat_messages` with `role: 'user'`
   - Call AI API (`/api/regenerate` or `/api/summarize`)

2. **AI responds**
   - Save to `chat_messages` with `role: 'assistant'`

3. **Real-time sync**
   - Other devices receive INSERT events via subscription
   - Deduplicate by checking `message.id`

---

## AI API Endpoints

### `/api/regenerate` - Ask questions about entities

```typescript
POST https://relay-that-backend.vercel.app/api/regenerate

{
    "sessionId": "uuid",
    "previousSession": {
        "sessionSummary": "Context + user question",
        "sessionCategory": "other",
        "entities": [
            {
                "type": "hotel",
                "title": "Marriott",
                "attributes": { "price": "$199", "rating": "4.5" }
            }
        ]
    },
    "screens": [
        {
            "id": "screenshot-uuid",
            "analysis": {
                "rawText": "OCR text",
                "summary": "...",
                "category": "other",
                "entities": [...],
                "suggestedNotebookTitle": null
            }
        }
    ]
}

// Response
{
    "sessionId": "uuid",
    "sessionSummary": "AI response text",
    "sessionCategory": "travel",
    "entities": [...],
    "suggestedNotebookTitle": "..."
}
```

### `/api/summarize` - Generate summary card

```typescript
POST https://relay-that-backend.vercel.app/api/summarize

{
    "sessionId": "uuid",
    "sessionName": "Session Name",
    "entities": [
        { "type": "hotel", "attributes": {...} }
    ]
}

// Response
{
    "condensedSummary": "Summary text...",
    "keyHighlights": ["Highlight 1", "Highlight 2"],
    "recommendations": ["Rec 1", "Rec 2"],
    "mergedEntities": [...],
    "suggestedTitle": "Trip Planning Summary"
}
```
