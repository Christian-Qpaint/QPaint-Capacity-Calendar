import { useState } from 'react'
import { toast } from 'sonner'
import { useCrmData } from '@/context/CrmDataContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { colorForIndex } from '@/lib/marketingColors'
import type { CrmFieldDefinition, CrmPipeline, CrmStage } from '@/types'

const FIELD_TYPES: CrmFieldDefinition['fieldType'][] = ['text', 'number', 'date', 'boolean', 'select', 'multiselect', 'address', 'monetary']

function swapOrder<T extends { id: string; order: number }>(items: T[], index: number, direction: -1 | 1): [T, T] | null {
  const other = items[index + direction]
  if (!other) return null
  return [items[index], other]
}

function PipelinesAndStagesTab() {
  const { pipelines, stages, addPipeline, updatePipeline, deletePipeline, addStage, updateStage, deleteStage } = useCrmData()
  const [newPipelineName, setNewPipelineName] = useState('')
  const [newStageName, setNewStageName] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'pipeline' | 'stage'; id: string; label: string } | null>(null)

  const sortedPipelines = [...pipelines].sort((a, b) => a.order - b.order)

  async function movePipeline(index: number, direction: -1 | 1) {
    const pair = swapOrder(sortedPipelines, index, direction)
    if (!pair) return
    const [a, b] = pair
    await Promise.all([updatePipeline(a.id, { name: a.name, order: b.order }), updatePipeline(b.id, { name: b.name, order: a.order })])
  }

  async function moveStage(pipelineStages: CrmStage[], index: number, direction: -1 | 1) {
    const pair = swapOrder(pipelineStages, index, direction)
    if (!pair) return
    const [a, b] = pair
    await Promise.all([
      updateStage(a.id, { pipelineId: a.pipelineId, name: a.name, order: b.order, isWonStage: a.isWonStage, color: a.color }),
      updateStage(b.id, { pipelineId: b.pipelineId, name: b.name, order: a.order, isWonStage: b.isWonStage, color: b.color }),
    ])
  }

  async function handleAddPipeline() {
    if (!newPipelineName.trim()) return
    try {
      await addPipeline({ name: newPipelineName.trim(), order: sortedPipelines.length })
      setNewPipelineName('')
      toast.success('Pipeline added')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add pipeline')
    }
  }

  async function handleAddStage(pipeline: CrmPipeline, count: number) {
    const name = newStageName[pipeline.id]?.trim()
    if (!name) return
    try {
      await addStage({ pipelineId: pipeline.id, name, order: count })
      setNewStageName((prev) => ({ ...prev, [pipeline.id]: '' }))
      toast.success('Stage added')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add stage')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      if (deleteTarget.type === 'pipeline') await deletePipeline(deleteTarget.id)
      else await deleteStage(deleteTarget.id)
      toast.success('Deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Can't delete — it still has deals referencing it")
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      {sortedPipelines.map((pipeline, pIndex) => {
        const pipelineStages = stages.filter((s) => s.pipelineId === pipeline.id).sort((a, b) => a.order - b.order)
        return (
          <div key={pipeline.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <Input
                value={pipeline.name}
                onChange={(e) => updatePipeline(pipeline.id, { name: e.target.value, order: pipeline.order })}
                className="max-w-xs font-medium"
              />
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" disabled={pIndex === 0} onClick={() => movePipeline(pIndex, -1)}><ArrowUp /></Button>
                <Button variant="ghost" size="icon-sm" disabled={pIndex === sortedPipelines.length - 1} onClick={() => movePipeline(pIndex, 1)}><ArrowDown /></Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-danger hover:bg-danger-bg hover:text-danger"
                  onClick={() => setDeleteTarget({ type: 'pipeline', id: pipeline.id, label: pipeline.name })}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {pipelineStages.map((stage, sIndex) => (
                <div key={stage.id} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={stage.color ?? colorForIndex(sIndex)}
                    onChange={(e) => updateStage(stage.id, { pipelineId: stage.pipelineId, name: stage.name, order: stage.order, isWonStage: stage.isWonStage, color: e.target.value })}
                    title="Stage color"
                    className="size-8 shrink-0 cursor-pointer rounded border border-border p-0.5"
                  />
                  <Input
                    value={stage.name}
                    onChange={(e) => updateStage(stage.id, { pipelineId: stage.pipelineId, name: e.target.value, order: stage.order, isWonStage: stage.isWonStage, color: stage.color })}
                    className="flex-1"
                  />
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox
                      checked={stage.isWonStage}
                      onCheckedChange={(checked) =>
                        updateStage(stage.id, { pipelineId: stage.pipelineId, name: stage.name, order: stage.order, isWonStage: !!checked, color: stage.color })
                      }
                    />
                    Won stage
                  </label>
                  <Button variant="ghost" size="icon-sm" disabled={sIndex === 0} onClick={() => moveStage(pipelineStages, sIndex, -1)}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-sm" disabled={sIndex === pipelineStages.length - 1} onClick={() => moveStage(pipelineStages, sIndex, 1)}><ArrowDown /></Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-danger hover:bg-danger-bg hover:text-danger"
                    onClick={() => setDeleteTarget({ type: 'stage', id: stage.id, label: stage.name })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newStageName[pipeline.id] ?? ''}
                  onChange={(e) => setNewStageName((prev) => ({ ...prev, [pipeline.id]: e.target.value }))}
                  placeholder="New stage name"
                />
                <Button size="sm" onClick={() => handleAddStage(pipeline, pipelineStages.length)}>
                  <Plus /> Add stage
                </Button>
              </div>
            </div>
          </div>
        )
      })}

      <div className="flex gap-2">
        <Input value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} placeholder="New pipeline name" className="max-w-xs" />
        <Button onClick={handleAddPipeline}><Plus /> Add pipeline</Button>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.type === 'pipeline' ? 'pipeline' : 'stage'} "${deleteTarget?.label}"?`}
        description="Blocked while any deal still references it — move or delete those deals first. This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  )
}

function FieldsTab() {
  const { fieldDefinitions, addFieldDefinition, updateFieldDefinition, deleteFieldDefinition } = useCrmData()
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<CrmFieldDefinition['fieldType']>('text')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null)

  const sorted = [...fieldDefinitions].sort((a, b) => a.order - b.order)

  async function moveField(index: number, direction: -1 | 1) {
    const pair = swapOrder(sorted, index, direction)
    if (!pair) return
    const [a, b] = pair
    await Promise.all([
      updateFieldDefinition(a.id, { label: a.label, fieldType: a.fieldType, options: a.options, order: b.order }),
      updateFieldDefinition(b.id, { label: b.label, fieldType: b.fieldType, options: b.options, order: a.order }),
    ])
  }

  async function handleAdd() {
    if (!newLabel.trim()) return
    try {
      await addFieldDefinition({ label: newLabel.trim(), fieldType: newType, order: sorted.length })
      setNewLabel('')
      setNewType('text')
      toast.success('Field added')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add field')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteFieldDefinition(deleteTarget.id)
      toast.success('Field deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete field')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="p-3 font-medium">Label</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Key</th>
              <th className="w-32 p-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((field, index) => (
              <tr key={field.id} className="border-b border-border last:border-0">
                <td className="p-2">
                  <Input
                    value={field.label}
                    onChange={(e) => updateFieldDefinition(field.id, { label: e.target.value, fieldType: field.fieldType, options: field.options, order: field.order })}
                  />
                </td>
                <td className="p-2 text-muted-foreground">{field.fieldType}</td>
                <td className="p-2 font-mono text-xs text-muted-foreground">{field.key.startsWith('local_') ? field.key : `${field.key.slice(0, 10)}… (Pipedrive)`}</td>
                <td className="p-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveField(index, -1)}><ArrowUp /></Button>
                    <Button variant="ghost" size="icon-sm" disabled={index === sorted.length - 1} onClick={() => moveField(index, 1)}><ArrowDown /></Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-danger hover:bg-danger-bg hover:text-danger"
                      onClick={() => setDeleteTarget({ id: field.id, label: field.label })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">No fields configured yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New field label" className="max-w-xs" />
        <Select value={newType} onValueChange={(v) => v && setNewType(v as CrmFieldDefinition['fieldType'])}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={handleAdd}><Plus /> Add field</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Options for select/multiselect fields (and each field's options list) aren't editable here yet — reach out if you need one added or changed.
      </p>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete field "${deleteTarget?.label}"?`}
        description="Existing deal data under this field is hidden, not deleted. This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  )
}

export function CrmConfig() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-medium">Deals configuration</h1>
      <Tabs defaultValue="pipelines">
        <TabsList>
          <TabsTrigger value="pipelines">Pipelines & Stages</TabsTrigger>
          <TabsTrigger value="fields">Fields</TabsTrigger>
        </TabsList>
        <TabsContent value="pipelines" className="pt-4">
          <PipelinesAndStagesTab />
        </TabsContent>
        <TabsContent value="fields" className="pt-4">
          <FieldsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
