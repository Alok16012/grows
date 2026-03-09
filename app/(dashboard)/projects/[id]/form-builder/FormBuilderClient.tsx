
"use client"

import { useState, useEffect, useCallback } from "react"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core"
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
    Plus, GripVertical, Pencil, Trash2, X, Save, Loader2,
    AlignLeft, Hash, Calendar, ChevronDown, CheckSquare, FileText, FileUp, Copy
} from "lucide-react"

type FieldType = "text" | "number" | "date" | "dropdown" | "checkbox" | "textarea" | "file"

type FormField = {
    id: string
    projectId: string
    fieldLabel: string
    fieldType: FieldType
    options: string | null
    defaultValue: string | null
    isRequired: boolean
    displayOrder: number
}

const FIELD_TYPES: { value: FieldType; label: string; icon: React.ReactNode }[] = [
    { value: "text", label: "Text", icon: <AlignLeft className="h-3 w-3" /> },
    { value: "number", label: "Number", icon: <Hash className="h-3 w-3" /> },
    { value: "date", label: "Date", icon: <Calendar className="h-3 w-3" /> },
    { value: "dropdown", label: "Dropdown", icon: <ChevronDown className="h-3 w-3" /> },
    { value: "checkbox", label: "Checkbox", icon: <CheckSquare className="h-3 w-3" /> },
    { value: "textarea", label: "Textarea", icon: <FileText className="h-3 w-3" /> },
    { value: "file", label: "File Upload", icon: <FileUp className="h-3 w-3" /> },
]

type FieldEditorFormProps = {
    initialData?: Partial<FormField>
    onSave: (data: Partial<FormField>) => Promise<void>
    onCancel: () => void
    saving: boolean
}

function FieldEditorForm({ initialData, onSave, onCancel, saving }: FieldEditorFormProps) {
    const [label, setLabel] = useState(initialData?.fieldLabel || "")
    const [type, setType] = useState<FieldType>(initialData?.fieldType || "text")
    const [required, setRequired] = useState(initialData?.isRequired || false)
    const [options, setOptions] = useState(initialData?.options || "")
    const [defaultValue, setDefaultValue] = useState(initialData?.defaultValue || "")

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave({ fieldLabel: label, fieldType: type, isRequired: required, options: type === "dropdown" ? options : null, defaultValue: defaultValue || null })
    }

    return (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="space-y-1">
                <Label className="text-xs">Field Label *</Label>
                <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Inspector Name" required className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Field Type</Label>
                <select
                    value={type}
                    onChange={e => setType(e.target.value as FieldType)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {FIELD_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </select>
            </div>
            {type === "dropdown" && (
                <div className="space-y-1">
                    <Label className="text-xs">Options (comma separated)</Label>
                    <Input value={options} onChange={e => setOptions(e.target.value)} placeholder="e.g. Good, Average, Poor" className="h-8 text-sm" />
                </div>
            )}
            <div className="space-y-1">
                <Label className="text-xs">Default Value</Label>
                {type === "dropdown" ? (
                    <select
                        value={defaultValue}
                        onChange={e => setDefaultValue(e.target.value)}
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="">No Default</option>
                        {options.split(",").map(o => o.trim()).filter(Boolean).map(o => (
                            <option key={o} value={o}>{o}</option>
                        ))}
                    </select>
                ) : (
                    <Input value={defaultValue} onChange={e => setDefaultValue(e.target.value)} placeholder={type === "number" ? "e.g. 0" : "e.g. Sample"} className="h-8 text-sm" />
                )}
            </div>
            <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                    <div
                        onClick={() => setRequired(r => !r)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${required ? "bg-primary" : "bg-input"}`}
                    >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${required ? "translate-x-4" : "translate-x-1"}`} />
                    </div>
                    Required
                </label>
            </div>
            <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={saving || !label.trim()}>
                    {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                    Save Field
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                    <X className="h-3 w-3 mr-1" /> Cancel
                </Button>
            </div>
        </form>
    )
}

// Sortable row
function SortableFieldRow({
    field,
    onEdit,
    onDelete,
    isDeleting,
}: {
    field: FormField
    onEdit: () => void
    onDelete: () => void
    isDeleting: boolean
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

    const typeInfo = FIELD_TYPES.find(t => t.value === field.fieldType)

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-3 bg-card rounded-lg border group hover:border-primary/30 transition-colors">
            <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none">
                <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
                <span className="font-medium text-sm">{field.fieldLabel}</span>
                {field.isRequired && <span className="text-destructive ml-1 text-xs">*</span>}
            </div>
            <div className="flex items-center gap-1">
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {typeInfo?.icon}
                    {typeInfo?.label}
                </span>
                {field.isRequired && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Required</span>
                )}
            </div>
            <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                    <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </Button>
            </div>
        </div>
    )
}

// Live Preview of a single field
function FieldPreview({ field }: { field: FormField }) {
    const optionList = field.options ? field.options.split(",").map(o => o.trim()) : []
    return (
        <div className="space-y-1.5">
            <label className="text-sm font-medium">
                {field.fieldLabel}
                {field.isRequired && <span className="text-destructive ml-0.5">*</span>}
            </label>
            {field.fieldType === "text" && <input type="text" disabled defaultValue={field.defaultValue || ""} placeholder={`Enter ${field.fieldLabel.toLowerCase()}`} className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground cursor-not-allowed" />}
            {field.fieldType === "number" && <input type="number" disabled defaultValue={field.defaultValue || ""} placeholder="0" className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground cursor-not-allowed" />}
            {field.fieldType === "date" && <input type="date" disabled defaultValue={field.defaultValue || ""} className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground cursor-not-allowed" />}
            {field.fieldType === "dropdown" && (
                <select disabled defaultValue={field.defaultValue || ""} className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground cursor-not-allowed">
                    <option value="">Select an option</option>
                    {optionList.map(o => <option key={o}>{o}</option>)}
                </select>
            )}
            {field.fieldType === "checkbox" && (
                <div className="flex items-center gap-2">
                    <input type="checkbox" disabled defaultChecked={field.defaultValue === "true"} className="h-4 w-4 cursor-not-allowed" />
                    <span className="text-sm text-muted-foreground">{field.fieldLabel}</span>
                </div>
            )}
            {field.fieldType === "textarea" && <textarea disabled placeholder={field.defaultValue || `Enter ${field.fieldLabel.toLowerCase()}`} rows={3} className="flex w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed resize-none" />}
            {field.fieldType === "file" && <input type="file" disabled className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground cursor-not-allowed" />}
        </div>
    )
}

export default function FormBuilderClient({
    projectId,
    projectName,
    companyName,
}: {
    projectId: string
    projectName: string
    companyName: string
}) {
    const [fields, setFields] = useState<FormField[]>([])
    const [loading, setLoading] = useState(true)
    const [showAddForm, setShowAddForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [loadingDefault, setLoadingDefault] = useState(false)

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const fetchFields = useCallback(async () => {
        try {
            const res = await fetch(`/api/form-templates?projectId=${projectId}`)
            const data = await res.json()
            setFields(data)
        } catch {
            console.error("Failed to fetch fields")
        } finally {
            setLoading(false)
        }
    }, [projectId])

    useEffect(() => { fetchFields() }, [fetchFields])

    const handleAddField = async (data: Partial<FormField>) => {
        setSaving(true)
        try {
            const res = await fetch("/api/form-templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...data, projectId, displayOrder: fields.length }),
            })
            if (!res.ok) throw new Error("Failed")
            await fetchFields()
            setShowAddForm(false)
        } catch { /* ignore */ }
        finally { setSaving(false) }
    }

    const handleEditField = async (id: string, data: Partial<FormField>) => {
        setSaving(true)
        try {
            const res = await fetch(`/api/form-templates/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            })
            if (!res.ok) throw new Error("Failed")
            await fetchFields()
            setEditingId(null)
        } catch { /* ignore */ }
        finally { setSaving(false) }
    }

    const handleDeleteField = async (id: string, label: string) => {
        if (!confirm(`Delete field "${label}"?`)) return
        setDeletingId(id)
        try {
            await fetch(`/api/form-templates/${id}`, { method: "DELETE" })
            await fetchFields()
        } catch { /* ignore */ }
        finally { setDeletingId(null) }
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const oldIndex = fields.findIndex(f => f.id === active.id)
        const newIndex = fields.findIndex(f => f.id === over.id)
        const reordered = arrayMove(fields, oldIndex, newIndex)
        setFields(reordered)
        // Update displayOrder for all affected fields
        await Promise.all(
            reordered.map((field, index) =>
                fetch(`/api/form-templates/${field.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ displayOrder: index }),
                })
            )
        )
    }

    const handleLoadDefaultForm = async () => {
        if (!confirm("This will replace all your current fields with the default template. Continue?")) return
        setLoadingDefault(true)
        try {
            const res = await fetch("/api/form-templates/bulk-default", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId }),
            })
            if (!res.ok) throw new Error("Failed to load default form")
            await fetchFields()
        } catch { /* ignore */ }
        finally { setLoadingDefault(false) }
    }

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Form Builder</h1>
                <p className="text-sm text-muted-foreground">
                    <span className="font-medium">{projectName}</span>
                    <span className="mx-1.5">·</span>
                    {companyName}
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* LEFT PANEL — Field Editor */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base">Field Editor</CardTitle>
                                    <CardDescription className="text-xs">{fields.length} field{fields.length !== 1 ? "s" : ""} defined</CardDescription>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={handleLoadDefaultForm} disabled={loadingDefault}>
                                        {loadingDefault ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Copy className="h-4 w-4 mr-1" />}
                                        Load Default Form
                                    </Button>
                                    {!showAddForm && (
                                        <Button size="sm" onClick={() => { setShowAddForm(true); setEditingId(null) }}>
                                            <Plus className="h-4 w-4 mr-1" /> Add Field
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {showAddForm && (
                                <FieldEditorForm
                                    onSave={handleAddField}
                                    onCancel={() => setShowAddForm(false)}
                                    saving={saving}
                                />
                            )}

                            {loading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : fields.length === 0 && !showAddForm ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    No fields yet. Click "+ Add Field" to get started.
                                </div>
                            ) : (
                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                    <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                                        <div className="space-y-2">
                                            {fields.map(field => (
                                                <div key={field.id}>
                                                    {editingId === field.id ? (
                                                        <FieldEditorForm
                                                            initialData={field}
                                                            onSave={(data) => handleEditField(field.id, data)}
                                                            onCancel={() => setEditingId(null)}
                                                            saving={saving}
                                                        />
                                                    ) : (
                                                        <SortableFieldRow
                                                            field={field}
                                                            onEdit={() => { setEditingId(field.id); setShowAddForm(false) }}
                                                            onDelete={() => handleDeleteField(field.id, field.fieldLabel)}
                                                            isDeleting={deletingId === field.id}
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT PANEL — Live Preview */}
                <div className="lg:sticky lg:top-6">
                    <Card>
                        <CardHeader className="pb-2 border-b">
                            <CardTitle className="text-base">Form Preview</CardTitle>
                            <CardDescription className="text-xs">This is how inspectors will see the form</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {fields.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                                    No fields yet. Add fields from the left panel.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {fields.map(field => (
                                        <FieldPreview key={field.id} field={field} />
                                    ))}
                                    <div className="pt-2 border-t">
                                        <button
                                            disabled
                                            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium opacity-50 cursor-not-allowed"
                                        >
                                            Submit Inspection
                                        </button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
