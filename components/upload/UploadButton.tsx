'use client'

import { useState, useRef } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface UploadButtonProps {
    sessionId: string
    onUploadComplete?: () => void
}

export function UploadButton({ sessionId, onUploadComplete }: UploadButtonProps) {
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = createClient()

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return

        const file = e.target.files[0]
        setUploading(true)

        try {
            // 1. Upload to Supabase Storage
            const filename = `${sessionId}/${Date.now()}-${file.name}`
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('screenshots')
                .upload(filename, file)

            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
                .from('screenshots')
                .getPublicUrl(filename)

            // 2. Insert into screenshots table
            // Get max order index first
            const { data: maxOrderData } = await supabase
                .from('screenshots')
                .select('order_index')
                .eq('session_id', sessionId)
                .order('order_index', { ascending: false })
                .limit(1)
                .single()

            const newOrderIndex = (maxOrderData?.order_index ?? 0) + 1

            const { data: screenshot, error: insertError } = await supabase
                .from('screenshots')
                .insert({
                    session_id: sessionId,
                    image_url: publicUrl,
                    order_index: newOrderIndex
                })
                .select()
                .single()

            if (insertError) throw insertError

            // 3. Trigger Analysis
            await analyzeScreenshot(screenshot.id, publicUrl)

            // 4. Notify completion
            onUploadComplete?.()

        } catch (error: any) {
            console.error('Upload failed:', error)
            alert(`Upload failed: ${error.message}`)
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const analyzeScreenshot = async (screenshotId: string, imageUrl: string) => {
        try {
            // Convert image to base64 for API (or send URL if API supports it, docs say base64)
            // Since we have URL, we might need to fetch it to blob then base64
            // Or if API supports URL, use that. Docs say "image": "data:image/png;base64..."

            const response = await fetch(imageUrl)
            const blob = await response.blob()
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result as string)
                reader.readAsDataURL(blob)
            })

            const apiResponse = await fetch('https://relay-that-backend.vercel.app/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64 })
            })

            const analysis = await apiResponse.json()

            // Insert extracted info
            if (analysis.entities && analysis.entities.length > 0) {
                const { error } = await supabase.from('extracted_info').insert(
                    analysis.entities.map((entity: any) => ({
                        session_id: sessionId,
                        screenshot_ids: [screenshotId],
                        entity_type: entity.type,
                        data: entity.attributes || {},
                        is_deleted: false
                    }))
                )
                if (error) throw error
            }

            // Update screenshot with raw text
            if (analysis.rawText) {
                await supabase.from('screenshots')
                    .update({ raw_text: analysis.rawText })
                    .eq('id', screenshotId)
            }

        } catch (error) {
            console.error('Analysis failed:', error)
        }
    }

    return (
        <>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*"
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cn(
                    "group w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground p-3 rounded-lg font-medium transition-all duration-300 ease-in-out hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md",
                    uploading && "opacity-50 cursor-not-allowed hover:translate-y-0 hover:shadow-none"
                )}
            >
                {uploading ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                    </>
                ) : (
                    <>
                        <Upload className="w-5 h-5 transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-110" />
                        Upload Screenshot
                    </>
                )}
            </button>
        </>
    )
}
