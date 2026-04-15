"use client"

import * as React from "react"
import { X, Download, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCw } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface DocumentViewerProps {
    url: string | null
    fileName?: string
    onClose: () => void
}

export function DocumentViewer({ url, fileName, onClose }: DocumentViewerProps) {
    const [zoom, setZoom] = React.useState(1)
    const [rotation, setRotation] = React.useState(0)
    const [isMaximized, setIsMaximized] = React.useState(false)

    if (!url) return null

    const isImage = url.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(url)
    const isPdf = url.startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(url)

    const handleDownload = () => {
        const link = document.createElement('a')
        link.href = url
        link.download = fileName || 'document'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <Dialog open={!!url} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={cn(
                "max-w-[95vw] w-full p-0 overflow-hidden bg-black/95 border-none",
                isMaximized ? "h-[95vh]" : "h-[85vh] sm:max-w-4xl"
            )}>
                <DialogHeader className="sr-only">
                    <DialogTitle>{fileName || "Document Viewer"}</DialogTitle>
                    <DialogDescription>View or download the document</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col h-full">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/50 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-zinc-300 truncate max-w-[200px] sm:max-w-md">
                                {fileName || "Document View"}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 text-zinc-400">
                            {isImage && (
                                <>
                                    <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1.5 hover:text-white transition-colors" title="Zoom Out"><ZoomOut size={18} /></button>
                                    <button onClick={() => setZoom(1)} className="text-[11px] font-mono px-1 hover:text-white transition-colors">{(zoom * 100).toFixed(0)}%</button>
                                    <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1.5 hover:text-white transition-colors" title="Zoom In"><ZoomIn size={18} /></button>
                                    <button onClick={() => setRotation(r => (r + 90) % 360)} className="p-1.5 hover:text-white transition-colors ml-1" title="Rotate"><RotateCw size={18} /></button>
                                </>
                            )}
                            <div className="w-px h-4 bg-white/10 mx-1" />
                            <button onClick={() => setIsMaximized(!isMaximized)} className="p-1.5 hover:text-white transition-colors hidden sm:block" title={isMaximized ? "Minimize" : "Maximize"}>
                                {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                            </button>
                            <button onClick={handleDownload} className="p-1.5 hover:text-white transition-colors" title="Download">
                                <Download size={18} />
                            </button>
                            <button onClick={onClose} className="p-1.5 hover:text-white transition-colors ml-1">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Viewer Area */}
                    <div className="flex-1 overflow-hidden relative flex items-center justify-center p-2 sm:p-4">
                        {isImage ? (
                            <div 
                                className="transition-transform duration-200 ease-out flex items-center justify-center h-full w-full"
                                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                            >
                                <img 
                                    src={url} 
                                    alt={fileName || "Document"} 
                                    className="max-h-full max-w-full object-contain shadow-2xl rounded-sm"
                                    style={{ imageRendering: 'auto' }}
                                />
                            </div>
                        ) : isPdf ? (
                            <iframe 
                                src={`${url}#view=FitH`} 
                                className="w-full h-full border-none bg-white rounded-md shadow-2xl"
                                title={fileName || "PDF Viewer"}
                            />
                        ) : (
                            <div className="text-center p-8 bg-zinc-900 rounded-2xl border border-white/5 max-w-sm">
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Download className="text-zinc-400" size={32} />
                                </div>
                                <h3 className="text-lg font-medium text-white mb-2">Can't preview file</h3>
                                <p className="text-zinc-400 text-sm mb-6">
                                    This file type doesn't support direct preview. Please download it to view the content.
                                </p>
                                <button 
                                    onClick={handleDownload}
                                    className="w-full py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Download size={18} /> Download Now
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
