'use client'

import { useState } from 'react'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { Sidebar } from './Sidebar'
import { useSessionData } from '@/hooks/useSessionData'
import { SummaryPanel, TimelinePanel } from '../panels/Panels'
import { useAuth } from '../auth/AuthProvider'
import { LogOut } from 'lucide-react'

export function MainLayout() {
    const { user, signOut } = useAuth()
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
    const [sidebarRefresh, setSidebarRefresh] = useState(0)
    const { screenshots, entities, loading, error, refresh } = useSessionData(currentSessionId)

    // Handle session change, optionally refreshing sidebar (for new sessions)
    const handleSessionChange = (newSessionId: string | undefined, refreshSidebar = false) => {
        if (newSessionId) {
            setCurrentSessionId(newSessionId)
        }
        if (refreshSidebar) {
            setSidebarRefresh(prev => prev + 1)
        }
        refresh()
    }

    return (
        <div className="h-screen flex flex-col bg-background text-foreground">
            {/* Top Toolbar */}
            <header className="h-14 border-b border-border flex items-center px-4 justify-between bg-white dark:bg-black/10">
                <div className="font-bold text-lg flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center overflow-hidden p-1.5">
                        <img src="/icon.png" alt="Relay it! Logo" className="w-full h-full object-contain" />
                    </div>
                    Relay it!
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">{user?.email}</span>
                    <button onClick={() => signOut()} className="text-muted-foreground hover:text-red-500">
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden">
                <PanelGroup orientation="horizontal">
                    {/* Sidebar */}
                    <Panel defaultSize="20%" minSize="15%" maxSize="30%" className="bg-muted/30">
                        <Sidebar
                            currentSessionId={currentSessionId}
                            onSelectSession={setCurrentSessionId}
                            refreshTrigger={sidebarRefresh}
                        />
                    </Panel>

                    <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

                    {/* Content Area */}
                    <Panel>
                        {currentSessionId ? (
                            <PanelGroup orientation="horizontal">
                                {/* Summary Panel */}
                                <Panel defaultSize="60%" minSize="30%">
                                    <SummaryPanel
                                        className="h-full"
                                        entities={entities}
                                        screenshots={screenshots}
                                        loading={loading}
                                        sessionId={currentSessionId}
                                        onSessionChange={(newId) => handleSessionChange(newId, true)}
                                        onRefresh={refresh}
                                    />
                                </Panel>

                                <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

                                {/* Timeline Panel */}
                                <Panel defaultSize="40%" minSize="20%">
                                    <TimelinePanel
                                        className="h-full border-l border-border"
                                        screenshots={screenshots}
                                        loading={loading}
                                        sessionId={currentSessionId}
                                        onSessionChange={(newId) => handleSessionChange(newId, true)}
                                        onRefresh={refresh}
                                    />
                                </Panel>
                            </PanelGroup>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                Select a session to start
                            </div>
                        )}
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    )
}
