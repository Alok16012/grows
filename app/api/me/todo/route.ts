import { NextResponse } from "next/server"
import { getApiSession } from "@/lib/apiSession"
import { loadTodoStore, applyTodoOp, TodoError } from "@/lib/todo-server"

export const dynamic = "force-dynamic"

// The signed-in person's own to-dos and notes — nobody else can read them.
// GET → { todos, notes, lists }
export async function GET(req: Request) {
    const session = await getApiSession(req)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json(await loadTodoStore(session.user.id))
}

// POST { op, ... } — upsertTodo | toggleTodo | toggleSubtask | deleteTodo | clearDone |
// snooze | fired | upsertNote | deleteNote | addList | deleteList. Returns the store.
export async function POST(req: Request) {
    const session = await getApiSession(req)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    try {
        return NextResponse.json(await applyTodoOp(session.user.id, await req.json().catch(() => ({}))))
    } catch (e: any) {
        if (e instanceof TodoError) return NextResponse.json({ error: e.message }, { status: 400 })
        console.error("[ME_TODO]", e)
        return NextResponse.json({ error: "Couldn't save" }, { status: 500 })
    }
}
