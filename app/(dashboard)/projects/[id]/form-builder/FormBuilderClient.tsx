"use client"

import Link from "next/link"
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
import {
    Plus, GripVertical, Pencil, Trash2, X, Save, Loader2,
    AlignLeft, Hash, Calendar, ChevronDown, CheckSquare, FileText, FileUp, Copy, ChevronLeft,
    Eye, EyeOff
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
    category: string
    reportRole?: string | null
    isHidden?: boolean
    displayOrder: number
}

// eslint-disable-next-line import/first
import { REPORT_ROLES } from "@/lib/report-roles"

const FIELD_TYPES: { value: FieldType; label: string; icon: React.ReactNode }[] = [
    { value: "text", label: "Text", icon: <AlignLeft className="h-[12px] w-[12px]" /> },
    { value: "number", label: "Number", icon: <Hash className="h-[12px] w-[12px]" /> },
    { value: "date", label: "Date", icon: <Calendar className="h-[12px] w-[12px]" /> },
    { value: "dropdown", label: "Dropdown", icon: <ChevronDown className="h-[12px] w-[12px]" /> },
    { value: "checkbox", label: "Checkbox", icon: <CheckSquare className="h-[12px] w-[12px]" /> },
    { value: "textarea", label: "Textarea", icon: <FileText className="h-[12px] w-[12px]" /> },
    { value: "file", label: "File Upload", icon: <FileUp className="h-[12px] w-[12px]" /> },
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
    const [reportRole, setReportRole] = useState(initialData?.reportRole ?? "")

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave({
            fieldLabel: label, fieldType: type, isRequired: required,
            options: type === "dropdown" ? options : null,
            defaultValue: defaultValue || null,
            // "" = infer from the field name (legacy behaviour); the API stores null.
            reportRole: reportRole || null,
        })
    }

    return (
        <form onSubmit={handleSubmit} className="border-b border-[#e8e6e1] bg-[#f9f8f5] p-[16px] space-y-[12px]">
            <div>
                <label className="block text-[12px] font-medium text-[#1a1a18] mb-[5px]">Field Label <span className="text-[#dc2626]">*</span></label>
                <input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="e.g. Inspector Name"
                    required
                    className="w-full p-[8px_12px] bg-white border border-[#e8e6e1] rounded-[8px] text-[13px] text-[#1a1a18] outline-none focus:border-[#1a9e6e] transition-colors"
                />
            </div>
            <div>
                <label className="block text-[12px] font-medium text-[#1a1a18] mb-[5px]">Field Type</label>
                <select
                    value={type}
                    onChange={e => setType(e.target.value as FieldType)}
                    className="w-full p-[8px_12px] bg-white border border-[#e8e6e1] rounded-[8px] text-[13px] text-[#1a1a18] outline-none focus:border-[#1a9e6e] transition-colors appearance-none"
                >
                    {FIELD_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </select>
            </div>
            <div>
                <label className="block text-[12px] font-medium text-[#1a1a18] mb-[5px]">Use in reports as</label>
                <select
                    value={reportRole}
                    onChange={e => setReportRole(e.target.value)}
                    className="w-full p-[8px_12px] bg-white border border-[#e8e6e1] rounded-[8px] text-[13px] text-[#1a1a18] outline-none focus:border-[#1a9e6e] transition-colors appearance-none"
                >
                    <option value="">Auto (match by field name)</option>
                    {REPORT_ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                </select>
                <p className="text-[11px] text-[#9e9b95] mt-[4px]">
                    Locks this field to a chart dimension, so renaming it never breaks the reports.
                </p>
            </div>
            {type === "dropdown" && (
                <div>
                    <label className="block text-[12px] font-medium text-[#1a1a18] mb-[5px]">Options (comma separated)</label>
                    <input
                        value={options}
                        onChange={e => setOptions(e.target.value)}
                        placeholder="e.g. Good, Average, Poor"
                        className="w-full p-[8px_12px] bg-white border border-[#e8e6e1] rounded-[8px] text-[13px] text-[#1a1a18] outline-none focus:border-[#1a9e6e] transition-colors"
                    />
                </div>
            )}
            <div>
                <label className="block text-[12px] font-medium text-[#1a1a18] mb-[5px]">Default Value</label>
                {type === "dropdown" ? (
                    <select
                        value={defaultValue}
                        onChange={e => setDefaultValue(e.target.value)}
                        className="w-full p-[8px_12px] bg-white border border-[#e8e6e1] rounded-[8px] text-[13px] text-[#1a1a18] outline-none focus:border-[#1a9e6e] transition-colors appearance-none"
                    >
                        <option value="">No Default</option>
                        {options.split(",").map(o => o.trim()).filter(Boolean).map(o => (
                            <option key={o} value={o}>{o}</option>
                        ))}
                    </select>
                ) : (
                    <input
                        value={defaultValue}
                        onChange={e => setDefaultValue(e.target.value)}
                        placeholder={type === "number" ? "e.g. 0" : "e.g. Sample"}
                        className="w-full p-[8px_12px] bg-white border border-[#e8e6e1] rounded-[8px] text-[13px] text-[#1a1a18] outline-none focus:border-[#1a9e6e] transition-colors"
                    />
                )}
            </div>
            <div className="flex items-center gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-[13px] font-medium text-[#1a1a18] select-none">
                    <div
                        onClick={() => setRequired(r => !r)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${required ? "bg-[#1a9e6e]" : "bg-[#d4d1ca]"}`}
                    >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${required ? "translate-x-4" : "translate-x-1"}`} />
                    </div>
                    Required Field
                </label>
            </div>
            <div className="flex gap-[8px] pt-2 border-t border-[#e8e6e1] mt-4 items-center">
                <button
                    type="submit"
                    disabled={saving || !label.trim()}
                    className="inline-flex items-center justify-center bg-[#1a9e6e] text-white rounded-[8px] text-[12.5px] font-[500] h-[32px] px-[14px] hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                    {saving ? <Loader2 className="h-[14px] w-[14px] animate-spin mr-[6px]" /> : <Save className="h-[14px] w-[14px] mr-[6px]" />}
                    Save Field
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex items-center justify-center bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[8px] text-[12.5px] font-[500] h-[32px] px-[14px] hover:bg-[#f9f8f5] hover:text-[#1a1a18] transition-colors"
                >
                    <X className="h-[14px] w-[14px] mr-[6px]" /> Cancel
                </button>
            </div>
        </form>
    )
}

function SortableFieldRow({ field, onEdit, onDelete, onToggleHidden, isDeleting }: { field: FormField, onEdit: () => void, onDelete: () => void, onToggleHidden: () => void, isDeleting: boolean }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: field.id,
        disabled: field.category === "AUTO"
    })
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

    const isFixed = field.category === "FIXED"
    const isAuto = field.category === "AUTO"
    const isDefect = field.category === "DEFECT"

    let pillClass = ""
    let pillText = field.fieldType.toUpperCase()
    if (field.fieldType === "date") pillClass = "bg-[#eff6ff] text-[#3b82f6]"
    else if (field.fieldType === "dropdown") pillClass = "bg-[#f5f3ff] text-[#7c3aed]"
    else if (field.fieldType === "number") pillClass = "bg-[#fef3c7] text-[#d97706]"
    else pillClass = "bg-[#f9f8f5] border border-[#e8e6e1] text-[#9e9b95]"

    let catBadge = ""
    if (isFixed) catBadge = "bg-[#eff6ff] text-[#3b82f6]"
    else if (isDefect) catBadge = "bg-[#fef3c7] text-[#d97706]"
    else if (isAuto) catBadge = "bg-[#e8f7f1] text-[#0d6b4a]"

    return (
        <div ref={setNodeRef} style={style} className={`flex items-center gap-[10px] p-[10px_14px] border-b border-[#e8e6e1] hover:bg-[#f9f8f5] transition-colors ${field.isHidden ? "bg-[#f9f8f5]" : "bg-white"}`}>
            {!isAuto ? (
                <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-[#9e9b95] opacity-50 hover:opacity-100 touch-none shrink-0 w-[16px] flex justify-center">
                    <GripVertical className="h-[14px] w-[14px]" />
                </button>
            ) : (
                <div className="w-[16px] shrink-0" />
            )}

            <div className="flex-1 min-w-0 flex items-center pr-[10px]">
                <span className={`text-[12.5px] font-[500] truncate ${field.isHidden ? "text-[#9e9b95] line-through" : "text-[#1a1a18]"}`}>{field.fieldLabel}</span>
                {field.isRequired && !field.isHidden && <span className="text-[#dc2626] ml-[4px] text-[12px]">*</span>}
                {field.isHidden && (
                    <span className="ml-[6px] text-[10px] font-[700] rounded-[20px] px-[7px] py-[2px] bg-[#f3f4f6] text-[#6b7280] shrink-0">HIDDEN</span>
                )}
            </div>

            <div className="flex items-center gap-[6px] shrink-0">
                <span className={`text-[11px] font-[500] rounded-[20px] px-[9px] py-[2px] ${pillClass}`}>
                    {pillText}
                </span>
                <span className={`text-[10.5px] font-[600] rounded-[20px] px-[9px] py-[2px] ${catBadge}`}>
                    {isFixed ? "FIXED" : isDefect ? "DEFECT" : "AUTO"}
                </span>
            </div>

            <div className="flex gap-[2px] shrink-0 ml-[4px]">
                {!isAuto && (
                    <button
                        onClick={onToggleHidden}
                        title={field.isHidden ? "Show on the inspection form" : "Hide from the inspection form (answers already recorded are kept)"}
                        className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-[#9e9b95] hover:bg-[#f9f8f5] hover:text-[#1a1a18] transition-colors"
                    >
                        {field.isHidden ? <EyeOff className="h-[14px] w-[14px]" /> : <Eye className="h-[14px] w-[14px]" />}
                    </button>
                )}
                {!isAuto && (
                    <button onClick={onEdit} className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-[#9e9b95] hover:bg-[#f9f8f5] hover:text-[#1a1a18] transition-colors">
                        <Pencil className="h-[14px] w-[14px]" />
                    </button>
                )}
                {isDefect && (
                    <button onClick={onDelete} disabled={isDeleting} className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-[#9e9b95] hover:bg-[#fef2f2] hover:text-[#dc2626] disabled:opacity-50 transition-colors">
                        {isDeleting ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Trash2 className="h-[14px] w-[14px]" />}
                    </button>
                )}
            </div>
        </div>
    )
}

function FieldPreview({ field }: { field: FormField }) {
    let pillClass = ""
    let pillText = field.fieldType.toUpperCase()
    if (field.fieldType === "date") pillClass = "bg-[#eff6ff] text-[#3b82f6]"
    else if (field.fieldType === "dropdown") pillClass = "bg-[#f5f3ff] text-[#7c3aed]"
    else if (field.fieldType === "number") pillClass = "bg-[#fef3c7] text-[#d97706]"
    else pillClass = "bg-[#f9f8f5] border border-[#e8e6e1] text-[#9e9b95]"

    const dropdownBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239e9b95' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='9 18 15 12 9 6'/%3E%3C/svg%3E")`

    return (
        <div className="bg-white border border-[#e8e6e1] rounded-[10px] mb-[8px] opacity-70 cursor-not-allowed">
            <div className="p-[10px_14px_0] flex justify-between items-center">
                <div className="text-[11px] font-[600] text-[#6b6860] uppercase tracking-[0.4px]">
                    {field.fieldLabel}
                    {field.isRequired && <span className="text-[#dc2626] ml-1">*</span>}
                </div>
                <div className={`text-[10px] font-[500] px-[8px] py-[2px] rounded-[20px] ${pillClass}`}>
                    {pillText}
                </div>
            </div>
            <div className="p-[4px_12px_10px]">
                {field.fieldType === "dropdown" ? (
                    <select disabled className="w-full bg-transparent border-none outline-none text-[14px] font-[500] text-[#1a1a18] appearance-none" style={{ backgroundImage: dropdownBg, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0px center' }}>
                        <option value="">Select option...</option>
                    </select>
                ) : (
                    <input disabled type={field.fieldType} placeholder={field.fieldType === 'number' ? '0' : `Enter ${field.fieldLabel.toLowerCase()}...`} className="w-full bg-transparent border-none outline-none text-[14px] font-[500] text-[#1a1a18] placeholder:text-[#9e9b95]" />
                )}
            </div>
        </div>
    )
}

export default function FormBuilderClient({
    projectId,
    projectName,
    siteName,
}: {
    projectId: string
    projectName: string
    siteName: string
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

    // Retire / restore a field. Deliberately NOT delete: InspectionData cascades
    // on fieldId, so deleting erases that field's answer from every inspection
    // ever submitted. Hiding keeps the history and stops the question being asked.
    const handleToggleHidden = async (field: FormField) => {
        const next = !field.isHidden
        setFields(prev => prev.map(f => f.id === field.id ? { ...f, isHidden: next } : f))
        try {
            const res = await fetch(`/api/form-templates/${field.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isHidden: next }),
            })
            if (!res.ok) throw new Error()
        } catch {
            // Roll the optimistic flip back so the row never lies about the server.
            setFields(prev => prev.map(f => f.id === field.id ? { ...f, isHidden: !next } : f))
        }
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

    const renderSection = (category: string, title: string) => {
        const sectionFields = fields.filter(f => f.category === category)
        const isDefect = category === "DEFECT"

        return (
            <div className="mb-0">
                <div className="bg-[#f9f8f5] border-y border-[#e8e6e1] p-[10px_14px_6px] flex items-center justify-between mt-[-1px]">
                    <div className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[0.8px]">{title}</div>

                    {isDefect && (
                        <div className="flex items-center gap-[8px]">
                            <input
                                type="text"
                                id="new-defect-input"
                                placeholder="New defect name..."
                                className="h-[26px] bg-[#f9f8f5] border border-[#e8e6e1] rounded-[8px] px-[10px] text-[12.5px] outline-none focus:border-[#1a9e6e] focus:bg-white"
                                onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                        const val = (e.target as HTMLInputElement).value.trim()
                                        if (val) {
                                            await handleAddField({ fieldLabel: val, fieldType: "number", category: "DEFECT", isRequired: false, defaultValue: "0" })
                                                ; (e.target as HTMLInputElement).value = ""
                                        }
                                    }
                                }}
                            />
                            <button
                                onClick={() => {
                                    const input = document.getElementById('new-defect-input') as HTMLInputElement
                                    const val = input.value.trim()
                                    if (val) {
                                        handleAddField({ fieldLabel: val, fieldType: "number", category: "DEFECT", isRequired: false, defaultValue: "0" })
                                        input.value = ""
                                    }
                                }}
                                className="h-[26px] px-[10px] bg-[#1a9e6e] text-white rounded-[8px] text-[12px] font-[500] hover:bg-[#158a5e] flex items-center gap-1 transition-colors"
                            >
                                <Plus className="h-[14px] w-[14px]" /> Add Defect
                            </button>
                        </div>
                    )}
                </div>

                <SortableContext items={sectionFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col">
                        {sectionFields.length === 0 && !isDefect && (
                            <div className="p-[16px] text-center text-[12px] text-[#9e9b95] border-b border-[#e8e6e1] bg-white">
                                {title} will appear here.
                            </div>
                        )}
                        {sectionFields.map(field => (
                            <div key={field.id}>
                                {editingId === field.id ? (
                                    <FieldEditorForm
                                        initialData={field}
                                        onSave={(data) => handleEditField(field.id, { ...data, category: field.category })}
                                        onCancel={() => setEditingId(null)}
                                        saving={saving}
                                    />
                                ) : (
                                    <SortableFieldRow
                                        field={field}
                                        onEdit={() => { setEditingId(field.id); setShowAddForm(false) }}
                                        onDelete={() => handleDeleteField(field.id, field.fieldLabel)}
                                        onToggleHidden={() => handleToggleHidden(field)}
                                        isDeleting={deletingId === field.id}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </SortableContext>
            </div>
        )
    }

    return (
        <div className="min-h-[calc(100vh-54px)] bg-[#f5f4f0] p-[24px]">
            <div className="flex items-start gap-[14px] mb-[20px]">
                <Link
                    href="/projects"
                    className="w-[30px] h-[30px] bg-white border border-[#e8e6e1] rounded-[8px] flex items-center justify-center text-[#6b6860] hover:bg-[#f9f8f5] transition-colors shrink-0 mt-1"
                >
                    <ChevronLeft size={16} />
                </Link>
                <div>
                    <h1 className="text-[20px] font-[600] text-[#1a1a18] leading-tight">Form Builder</h1>
                    <p className="text-[12px] text-[#6b6860] mt-[2px]">
                        {projectName} <span className="mx-1 text-[#9e9b95]">•</span> {siteName}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[16px] items-start">

                {/* LEFT PANEL — Field Editor */}
                <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden flex flex-col shadow-sm">
                    <div className="p-[14px_18px] border-b border-[#e8e6e1] flex items-center justify-between shrink-0 bg-white">
                        <div className="flex items-center gap-[8px]">
                            <h2 className="text-[13.5px] font-[600] text-[#1a1a18]">Field Editor</h2>
                            <span className="bg-[#e8f7f1] text-[#0d6b4a] rounded-[20px] text-[11px] font-[500] px-[8px] py-[2px]">
                                {fields.length}
                            </span>
                        </div>
                        <div className="flex items-center gap-[8px]">
                            <button
                                onClick={handleLoadDefaultForm}
                                disabled={loadingDefault}
                                className="inline-flex items-center justify-center bg-white border border-[#e8e6e1] rounded-[8px] text-[12px] font-[500] text-[#1a1a18] px-[12px] h-[30px] hover:bg-[#f9f8f5] transition-colors"
                            >
                                {loadingDefault ? <Loader2 className="h-[14px] w-[14px] mr-[6px] animate-spin" /> : <Copy className="h-[14px] w-[14px] mr-[6px]" />}
                                Load Default Form
                            </button>
                            {!showAddForm && (
                                <button
                                    onClick={() => { setShowAddForm(true); setEditingId(null) }}
                                    className="inline-flex items-center justify-center bg-[#1a9e6e] text-white rounded-[8px] text-[12px] font-[500] px-[12px] h-[30px] hover:bg-[#158a5e] transition-colors"
                                >
                                    <Plus className="h-[14px] w-[14px] mr-[4px]" /> Add Field
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[calc(100vh-200px)]">
                        {showAddForm && (
                            <FieldEditorForm
                                onSave={(data) => handleAddField({ ...data, category: "FIXED" })}
                                onCancel={() => setShowAddForm(false)}
                                saving={saving}
                            />
                        )}

                        {loading ? (
                            <div className="flex items-center justify-center py-[40px]">
                                <Loader2 className="h-6 w-6 animate-spin text-[#9e9b95]" />
                            </div>
                        ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                {renderSection("FIXED", "Fixed Fields")}
                                {renderSection("DEFECT", "Defect Columns")}
                                {renderSection("AUTO", "Auto Calculated")}
                            </DndContext>
                        )}
                    </div>
                </div>

                {/* RIGHT PANEL — Form Preview */}
                <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden flex flex-col shadow-sm">
                    <div className="p-[14px_18px] border-b border-[#e8e6e1] shrink-0 bg-white">
                        <h2 className="text-[13.5px] font-[600] text-[#1a1a18]">Form Preview</h2>
                        <p className="text-[11.5px] text-[#9e9b95] mt-[2px]">This is how inspectors will see the form</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-[16px_18px] max-h-[calc(100vh-200px)] bg-white">
                        {fields.length === 0 ? (
                            <div className="text-center py-[40px] text-[12px] text-[#9e9b95] border border-dashed border-[#d4d1ca] rounded-[8px] bg-[#f9f8f5]">
                                No fields yet. Add fields from the left panel.
                            </div>
                        ) : (
                            <div className="w-full">
                                <div className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[1px] border-b-[1.5px] border-[#e8e6e1] pb-[8px] mb-[14px]">
                                    Basic Info
                                </div>
                                {fields.filter(f => f.category === "FIXED").map(field => (
                                    <FieldPreview key={field.id} field={field} />
                                ))}

                                {fields.filter(f => f.category === "DEFECT").length > 0 && (
                                    <>
                                        <div className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[1px] border-b-[1.5px] border-[#e8e6e1] pb-[8px] mb-[14px] mt-[24px]">
                                            Defect Entry
                                        </div>
                                        <div className="grid grid-cols-3 gap-[8px]">
                                            {fields.filter(f => f.category === "DEFECT").map(field => (
                                                <div key={field.id} className="bg-white border border-[#e8e6e1] rounded-[9px] p-[9px_10px] opacity-70 cursor-not-allowed">
                                                    <div className="text-[10px] font-[500] text-[#9e9b95] uppercase leading-[1.3] mb-[5px] truncate" title={field.fieldLabel}>
                                                        {field.fieldLabel}
                                                    </div>
                                                    <div className="w-full bg-[#f9f8f5] border border-[#e8e6e1] rounded-[6px] p-[7px] text-[15px] font-[700] font-mono text-center text-[#9e9b95]">
                                                        0
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {fields.filter(f => f.category === "AUTO").length > 0 && (
                                    <>
                                        <div className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[1px] border-b-[1.5px] border-[#e8e6e1] pb-[8px] mb-[14px] mt-[24px]">
                                            Calculated (Auto)
                                        </div>
                                        <div className="grid grid-cols-2 gap-[8px]">
                                            {fields.filter(f => f.category === "AUTO").map(field => {
                                                if (field.fieldLabel.toUpperCase() === "INSPECTOR NAME") {
                                                    return (
                                                        <div key={field.id} className="col-span-2 bg-[#f0fdf4] border border-[rgba(26,158,110,0.2)] rounded-[9px] p-[11px_13px] flex items-center gap-[10px] opacity-70">
                                                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-[#1a9e6e]"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                                            <span className="text-[13px] font-[600] text-[#0d6b4a]">Inspector Name Auto-fill</span>
                                                        </div>
                                                    )
                                                }
                                                return (
                                                    <div key={field.id} className="bg-[#f9f8f5] border-[1.5px] border-dashed border-[#d4d1ca] rounded-[9px] p-[11px_13px] opacity-70">
                                                        <div className="text-[10px] font-[500] text-[#9e9b95] uppercase">{field.fieldLabel}</div>
                                                        <div className="text-[20px] font-[700] font-mono tracking-[-0.5px] text-[#1a1a18]">
                                                            0
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
