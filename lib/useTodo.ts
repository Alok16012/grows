"use client"

// One copy of the person's to-dos and notes for the whole app (page, dashboard
// widget, alarm ringer). Every change goes through /api/me/todo and the
// returned store replaces the copy everywhere.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import type { TodoStore } from "@/lib/todo"

let store: TodoStore | null = null
let loading: Promise<TodoStore | null> | null = null
const listeners = new Set<(s: TodoStore | null) => void>()
const emit = () => listeners.forEach(l => l(store))

export function refreshTodo(): Promise<TodoStore | null> {
    if (loading) return loading
    loading = fetch("/api/me/todo").then(r => r.ok ? r.json() : null).catch(() => null)
        .then(s => { if (s && !s.error) store = s; loading = null; emit(); return store })
    return loading
}

export async function todoOp(body: Record<string, unknown>, quiet = false): Promise<boolean> {
    try {
        const r = await fetch("/api/me/todo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j?.error || "Couldn't save")
        store = j; emit(); return true
    } catch (e: any) { if (!quiet) toast.error(e.message); return false }
}

export function useTodo() {
    const [s, setS] = useState<TodoStore | null>(store)
    useEffect(() => {
        listeners.add(setS)
        if (!store) refreshTodo(); else setS(store)
        return () => { listeners.delete(setS) }
    }, [])
    const op = useCallback((b: Record<string, unknown>, quiet?: boolean) => todoOp(b, quiet), [])
    return { store: s, op, refresh: refreshTodo }
}
