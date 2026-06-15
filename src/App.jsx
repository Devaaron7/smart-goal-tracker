import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowRight, BarChart3, CalendarDays, Check, ChevronLeft,
  Clock3, Copy, Download, Flag, History, Info, LayoutDashboard, Menu, Plus,
  Moon, Pencil, RotateCcw, Settings2, Sparkles, Sun, Target, Trash2, TrendingUp, Upload, X,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const STORAGE_KEY = 'goal-tracker-data-v1'
const DAY = 86400000
const defaultGoal = {
  name: '', description: '', endDate: '', measurement: '', unit: '',
  startValue: 0, targetValue: 1, direction: 'increase', weeklyTarget: '',
}

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
const today = () => new Date().toISOString().slice(0, 10)
const localDate = (value) => new Date(`${value}T12:00:00`)
const formatNum = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
const formatDate = (value, opts = { month: 'short', day: 'numeric' }) =>
  localDate(value).toLocaleDateString(undefined, opts)
const daysBetween = (a, b) => Math.max(0, Math.ceil((localDate(b) - localDate(a)) / DAY))
const weeksBetween = (a, b) => Math.max(1, daysBetween(a, b) / 7)
const activityOrder = (a, b) => a.date.localeCompare(b.date) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
const startOfWeek = (dateValue = today()) => {
  const d = localDate(dateValue)
  const diff = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

function signedProgress(goal, value = goal.currentValue) {
  return goal.direction === 'decrease' ? goal.startValue - value : value - goal.startValue
}

function totalNeeded(goal) {
  return Math.abs(goal.targetValue - goal.startValue)
}

function progressPercent(goal) {
  const needed = totalNeeded(goal)
  return needed === 0 ? 100 : Math.min(100, Math.max(0, (signedProgress(goal) / needed) * 100))
}

function weeklyProgress(goal, activities) {
  const weekStart = startOfWeek()
  const goalEntries = activities.filter((a) => a.goalId === goal.id).sort(activityOrder)
  const hasManualWeek = goal.weekStartedAt && goal.weekStartedAt.slice(0, 10) >= weekStart
  const excludedActivityIds = new Set(goal.weekExcludedActivityIds || [])
  const entries = goalEntries.filter((a) => {
    if (a.date > today()) return false
    if (hasManualWeek && Array.isArray(goal.weekExcludedActivityIds)) return !excludedActivityIds.has(a.id)
    if (hasManualWeek) return String(a.createdAt || '') > goal.weekStartedAt
    return a.date >= weekStart
  })
  if (goal.direction === 'decrease') {
    const startingPoint = hasManualWeek ? Number(goal.weekStartValue) : calculateCurrent(goal, goalEntries.filter((a) => a.date < weekStart))
    return Math.max(0, startingPoint - calculateCurrent({ ...goal, startValue: startingPoint }, entries))
  }
  return entries.reduce((sum, a) => sum + (a.entryType === 'add' ? Number(a.amount) : 0), 0)
}

function calculateCurrent(goal, activities) {
  return [...activities].sort(activityOrder).reduce((current, activity) => {
    if (activity.entryType === 'set') return Number(activity.amount)
    return current + (goal.direction === 'decrease' ? -Number(activity.amount) : Number(activity.amount))
  }, Number(goal.startValue))
}

function normalizeData(data) {
  const goals = Array.isArray(data?.goals) ? data.goals : []
  const activities = Array.isArray(data?.activities) ? data.activities.map((activity) => {
    if (activity.entryType === 'set' || activity.entryType === 'add') return activity
    const goal = goals.find((item) => item.id === activity.goalId)
    return { ...activity, entryType: goal?.direction === 'decrease' ? 'set' : 'add' }
  }) : []
  return {
    activities,
    goals: goals.map((goal) => ({
      ...goal,
      currentValue: calculateCurrent(goal, activities.filter((activity) => activity.goalId === goal.id)),
    })),
  }
}

function getStatus(goal) {
  if (progressPercent(goal) >= 100) return 'Completed'
  const elapsedWeeks = Math.max(0, daysBetween(goal.startDate, today()) / 7)
  const expected = Math.min(totalNeeded(goal), elapsedWeeks * Number(goal.weeklyTarget || goal.suggestedWeeklyTarget))
  const actual = Math.max(0, signedProgress(goal))
  const margin = Number(goal.weeklyTarget || goal.suggestedWeeklyTarget) * 0.25
  if (actual > expected + margin) return 'Ahead'
  if (actual + margin < expected) return 'Behind'
  return 'On track'
}

const statusStyle = {
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Ahead: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  'On track': 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Behind: 'bg-amber-50 text-amber-700 ring-amber-600/20',
}

function Badge({ children }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle[children] || 'bg-slate-50 text-slate-600 ring-slate-500/20'}`}>{children}</span>
}

function ProgressBar({ value, color = 'bg-brand-600', testId }) {
  return <div data-testid={testId} data-progress={Math.round(value)} className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
}

function Modal({ children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7 ${wide ? 'max-w-2xl' : 'max-w-lg'}`} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function SetupWizard({ onFinish, onCancel, allowCancel = false }) {
  const [step, setStep] = useState(0)
  const [showDirectionHelp, setShowDirectionHelp] = useState(false)
  const [draft, setDraft] = useState({ ...defaultGoal, endDate: new Date(Date.now() + 90 * DAY).toISOString().slice(0, 10) })
  const [created, setCreated] = useState([])
  const steps = ['Goal', 'Timeline', 'Measurement', 'Values', 'Weekly target', 'Another goal?']
  const update = (key, value) => setDraft((d) => ({ ...d, [key]: value }))
  const suggested = useMemo(() => totalNeeded(draft) / weeksBetween(today(), draft.endDate), [draft])
  const canNext = step === 0 ? draft.name.trim() : step === 1 ? draft.endDate >= today() : step === 2 ? draft.measurement.trim() && draft.unit.trim() : step === 3 ? Number(draft.targetValue) !== Number(draft.startValue) : true

  const saveDraft = () => {
    const goal = {
      ...draft, id: uid(), startDate: today(), startValue: Number(draft.startValue),
      currentValue: Number(draft.startValue), targetValue: Number(draft.targetValue),
      suggestedWeeklyTarget: suggested, weeklyTarget: Number(draft.weeklyTarget || suggested),
      createdAt: new Date().toISOString(),
    }
    setCreated((items) => [...items, goal])
    return goal
  }

  const next = () => {
    if (step === 4) saveDraft()
    setStep((s) => s + 1)
  }
  const addAnother = () => {
    setDraft({ ...defaultGoal, endDate: new Date(Date.now() + 90 * DAY).toISOString().slice(0, 10) })
    setStep(0)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-600">Goal setup</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{steps[step]}</h1>
        </div>
        {allowCancel && <button className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onCancel}><X size={20} /></button>}
      </div>
      <div className="mb-8 flex gap-1.5">{steps.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-slate-200'}`} />)}</div>
      <div className="card p-5 sm:p-8">
        {step === 0 && <div className="space-y-5">
          <div><label className="label">What is your goal?</label><input data-testid="goal-name-input" autoFocus className="field text-base" placeholder="e.g. Build an emergency fund" value={draft.name} onChange={(e) => update('name', e.target.value)} /></div>
          <div><label className="label">Description <span className="normal-case tracking-normal text-slate-400">(optional)</span></label><textarea className="field min-h-24 resize-none" placeholder="Why does this goal matter?" value={draft.description} onChange={(e) => update('description', e.target.value)} /></div>
        </div>}
        {step === 1 && <div>
          <label className="label">When do you want to reach this goal?</label>
          <input data-testid="goal-end-date-input" type="date" min={today()} className="field text-base" value={draft.endDate} onChange={(e) => update('endDate', e.target.value)} />
          <p className="mt-4 rounded-xl bg-brand-50 p-4 text-sm text-brand-700"><CalendarDays className="mr-2 inline" size={17} />That gives you <strong>{Math.ceil(weeksBetween(today(), draft.endDate))} weeks</strong> to make it happen.</p>
        </div>}
        {step === 2 && <div className="space-y-5">
          <div><label className="label">How should progress be measured?</label><input data-testid="goal-measurement-input" autoFocus className="field" placeholder="e.g. Dollars saved, workouts completed" value={draft.measurement} onChange={(e) => update('measurement', e.target.value)} /></div>
          <div><label className="label">Unit of measurement</label><input data-testid="goal-unit-input" className="field" placeholder="e.g. dollars, workouts, pounds" value={draft.unit} onChange={(e) => update('unit', e.target.value)} /></div>
          <div><div className="mb-1.5 flex items-center gap-1.5"><label className="label mb-0">Direction</label><button data-testid="direction-info-button" type="button" aria-label="Explain goal directions" aria-expanded={showDirectionHelp} className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600" onClick={() => setShowDirectionHelp((visible) => !visible)}><Info size={15} /></button></div>
          {showDirectionHelp && <div data-testid="direction-info-panel" className="mb-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
            <div className="flex items-start justify-between gap-3"><p className="font-semibold text-slate-900">Direction determines how activity changes your goal’s progress.</p><button type="button" aria-label="Close direction help" className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700" onClick={() => setShowDirectionHelp(false)}><X size={15} /></button></div>
            <div className="mt-4 space-y-4">
              <div><p className="font-semibold text-slate-900">Increase value</p><p className="mt-1">Your current value grows toward the target. Examples: save $5,000, work 100 hours, or earn $10,000. Logging 100 dollars adds 100.</p></div>
              <div><p className="font-semibold text-slate-900">Decrease value</p><p className="mt-1">Your current value falls toward the target. Examples: reduce weight from 200 to 180 pounds or pay debt from $10,000 to $0. Log a new current value or an amount to subtract.</p></div>
              <div><p className="font-semibold text-slate-900">Complete count</p><p className="mt-1">You count completed actions toward a target. Examples: complete 48 workouts, read 12 books, or submit 30 applications. Logging 2 workouts adds 2.</p></div>
            </div>
            <p className="mt-4 border-t pt-3 text-xs">Increase value and Complete count behave similarly. The distinction describes a growing measurement versus finished actions.</p>
          </div>}
          <div className="grid gap-2 sm:grid-cols-3">
            {[['increase', 'Increase value'], ['decrease', 'Decrease value'], ['count', 'Complete count']].map(([value, label]) => <button key={value} onClick={() => update('direction', value)} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${draft.direction === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
          </div></div>
        </div>}
        {step === 3 && <div className="grid gap-5 sm:grid-cols-2">
          <div><label className="label">Starting value</label><input data-testid="goal-start-value-input" autoFocus type="number" step="any" className="field" value={draft.startValue} onChange={(e) => update('startValue', e.target.value)} /></div>
          <div><label className="label">Target value</label><input data-testid="goal-target-value-input" type="number" step="any" className="field" value={draft.targetValue} onChange={(e) => update('targetValue', e.target.value)} /></div>
          <p className="sm:col-span-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">You’re aiming to {draft.direction === 'decrease' ? 'reduce by' : 'complete'} <strong>{formatNum(totalNeeded(draft))} {draft.unit || 'units'}</strong>.</p>
        </div>}
        {step === 4 && <div className="space-y-6">
          <div className="rounded-2xl bg-brand-600 p-5 text-white"><Sparkles size={20} /><p className="mt-4 text-sm text-brand-100">Suggested weekly target</p><p className="mt-1 text-3xl font-bold">{formatNum(suggested)} <span className="text-base font-medium">{draft.unit} / week</span></p><p className="mt-3 text-sm text-brand-100">Based on {formatNum(totalNeeded(draft))} {draft.unit} across {Math.ceil(weeksBetween(today(), draft.endDate))} weeks.</p></div>
          <div><label className="label">Your weekly target</label><input data-testid="goal-weekly-target-input" type="number" step="any" className="field" placeholder={formatNum(suggested)} value={draft.weeklyTarget} onChange={(e) => update('weeklyTarget', e.target.value)} /><p className="mt-2 text-xs text-slate-500">Leave blank to use the suggested target.</p></div>
        </div>}
        {step === 5 && <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Check size={28} /></div>
          <h2 className="mt-5 text-xl font-bold">{created.at(-1)?.name} is ready.</h2>
          <p className="mt-2 text-sm text-slate-500">Do you want to add another goal?</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2"><button className="btn-secondary" onClick={addAnother}><Plus size={17} />Add another</button><button data-testid="finish-goal-setup" className="btn-primary" onClick={() => onFinish(created)}>Go to dashboard<ArrowRight size={17} /></button></div>
        </div>}
        {step < 5 && <div className="mt-8 flex justify-between border-t pt-5">
          <button className="btn-secondary disabled:opacity-0" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ChevronLeft size={17} />Back</button>
          <button data-testid="goal-setup-next" className="btn-primary" disabled={!canNext} onClick={next}>{step === 4 ? 'Create goal' : 'Continue'}<ArrowRight size={17} /></button>
        </div>}
      </div>
    </div>
  )
}

function GoalCard({ goal, activities, onLog, onEdit, onStartWeek, onDelete }) {
  const percent = progressPercent(goal)
  const weekly = weeklyProgress(goal, activities)
  const weeklyPercent = Math.min(100, (weekly / goal.weeklyTarget) * 100)
  const status = getStatus(goal)
  return (
    <article data-testid="goal-card" className="card flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{goal.measurement}</p><h3 className="mt-1 truncate text-lg font-bold">{goal.name}</h3></div>
        <div className="flex items-center gap-1"><Badge>{status}</Badge><button aria-label={`Edit ${goal.name}`} onClick={() => onEdit(goal)} className="rounded-lg p-1.5 text-slate-300 hover:bg-brand-50 hover:text-brand-600"><Pencil size={15} /></button><button aria-label={`Delete ${goal.name}`} onClick={() => onDelete(goal.id)} className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button></div>
      </div>
      <div className="mt-6">
        <div className="mb-2 flex items-end justify-between"><span className="text-2xl font-bold">{formatNum(goal.currentValue)} <span className="text-sm font-medium text-slate-400">{goal.unit}</span></span><span className="text-sm font-semibold text-slate-500">{Math.round(percent)}%</span></div>
        <ProgressBar value={percent} testId="overall-progress-bar" />
        <div className="mt-2 flex justify-between text-xs text-slate-400"><span>Started at {formatNum(goal.startValue)}</span><span>Target {formatNum(goal.targetValue)}</span></div>
      </div>
      <div className="mt-6 rounded-xl bg-slate-50 p-4">
        <div className="flex flex-col justify-between gap-3 text-sm sm:flex-row sm:items-center"><span className="font-semibold">This week</span><div className="flex items-center justify-between gap-3 sm:justify-end"><span><strong>{formatNum(weekly)}</strong> / {formatNum(goal.weeklyTarget)} {goal.unit}</span><button title="Clear this week's progress" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-brand-600" onClick={() => onStartWeek(goal)}><RotateCcw size={13} />Start new week</button></div></div>
        <div className="mt-3"><ProgressBar value={weeklyPercent} color={weeklyPercent >= 100 ? 'bg-emerald-500' : 'bg-slate-700'} testId="weekly-progress-bar" /></div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span className="flex items-center gap-1.5"><Clock3 size={14} />{daysBetween(today(), goal.endDate)} days left</span><span>Due {formatDate(goal.endDate)}</span></div>
      <button className="btn-primary mt-5 w-full" onClick={() => onLog(goal)}><Plus size={17} />Log activity</button>
    </article>
  )
}

function EditGoal({ goal, onSave, onClose }) {
  const [form, setForm] = useState({ ...goal })
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const suggested = totalNeeded(form) / weeksBetween(form.startDate, form.endDate)
  const valid = form.name.trim() && form.measurement.trim() && form.unit.trim() && form.startDate && form.endDate >= form.startDate && Number(form.targetValue) !== Number(form.startValue) && Number(form.weeklyTarget) > 0
  return <Modal onClose={onClose} wide>
    <div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-brand-600">Edit goal</p><h2 className="mt-1 text-2xl font-bold">{goal.name}</h2></div><button className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose}><X size={20} /></button></div>
    <div className="mt-7 grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2"><label className="label">Goal name</label><input autoFocus className="field" value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
      <div className="sm:col-span-2"><label className="label">Description <span className="normal-case tracking-normal text-slate-400">(optional)</span></label><textarea className="field min-h-20 resize-none" value={form.description} onChange={(e) => update('description', e.target.value)} /></div>
      <div><label className="label">Start date</label><input type="date" className="field" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} /></div>
      <div><label className="label">Target end date</label><input type="date" min={form.startDate} className="field" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} /></div>
      <div><label className="label">Measurement</label><input className="field" value={form.measurement} onChange={(e) => update('measurement', e.target.value)} /></div>
      <div><label className="label">Unit</label><input className="field" value={form.unit} onChange={(e) => update('unit', e.target.value)} /></div>
      <div className="sm:col-span-2"><label className="label">Direction</label><div className="grid gap-2 sm:grid-cols-3">{[['increase', 'Increase value'], ['decrease', 'Decrease value'], ['count', 'Complete count']].map(([value, label]) => <button key={value} onClick={() => update('direction', value)} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${form.direction === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div></div>
      <div><label className="label">Starting value</label><input type="number" step="any" className="field" value={form.startValue} onChange={(e) => update('startValue', e.target.value)} /></div>
      <div><label className="label">Target value</label><input type="number" step="any" className="field" value={form.targetValue} onChange={(e) => update('targetValue', e.target.value)} /></div>
      <div className="sm:col-span-2"><label className="label">Weekly target</label><input type="number" min="0" step="any" className="field" value={form.weeklyTarget} onChange={(e) => update('weeklyTarget', e.target.value)} /><p className="mt-2 text-xs text-slate-500">Suggested from the updated timeline: {formatNum(suggested)} {form.unit || 'units'} per week.</p></div>
    </div>
    <div className="mt-7 flex justify-end gap-3 border-t pt-5"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!valid} onClick={() => onSave({ ...form, startValue: Number(form.startValue), targetValue: Number(form.targetValue), weeklyTarget: Number(form.weeklyTarget), suggestedWeeklyTarget: suggested })}><Check size={17} />Save changes</button></div>
  </Modal>
}

function LogActivity({ goal, onSave, onClose }) {
  const [form, setForm] = useState({ date: today(), amount: '', note: '', entryType: goal.direction === 'decrease' ? 'set' : 'add' })
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  return <Modal onClose={onClose}>
    <div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-brand-600">Log activity</p><h2 className="mt-1 text-2xl font-bold">{goal.name}</h2></div><button className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose}><X size={20} /></button></div>
    <div className="mt-7 space-y-5">
      {goal.direction === 'decrease' && <div><label className="label">Entry type</label><div className="grid grid-cols-2 gap-2">{[['set', 'Set current value'], ['add', `Subtract ${goal.unit}`]].map(([v, l]) => <button key={v} onClick={() => update('entryType', v)} className={`rounded-xl border p-3 text-sm font-semibold ${form.entryType === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'text-slate-600'}`}>{l}</button>)}</div></div>}
      <div className="grid gap-4 sm:grid-cols-2"><div><label className="label">Date</label><input type="date" max={today()} className="field" value={form.date} onChange={(e) => update('date', e.target.value)} /></div><div><label className="label">{form.entryType === 'set' ? 'Current value' : 'Amount'} ({goal.unit})</label><input autoFocus type="number" step="any" className="field" placeholder="0" value={form.amount} onChange={(e) => update('amount', e.target.value)} /></div></div>
      <div><label className="label">Note <span className="normal-case tracking-normal text-slate-400">(optional)</span></label><textarea className="field min-h-20 resize-none" placeholder="What did you do?" value={form.note} onChange={(e) => update('note', e.target.value)} /></div>
      <button className="btn-primary w-full" disabled={form.amount === ''} onClick={() => onSave({ ...form, amount: Number(form.amount), goalId: goal.id, id: uid(), createdAt: new Date().toISOString(), unit: goal.unit })}><Check size={17} />Save activity</button>
    </div>
  </Modal>
}

function Dashboard({ goals, activities, onLog, onEdit, onStartWeek, onStartAllWeeks, onDelete }) {
  const completed = goals.filter((g) => getStatus(g) === 'Completed').length
  const onTrack = goals.filter((g) => ['On track', 'Ahead'].includes(getStatus(g))).length
  return <div>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-brand-600">{formatDate(today(), { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Your goals</h1><p className="mt-2 text-sm text-slate-500">Small steps, clearly measured.</p></div><div className="flex flex-wrap gap-3"><button className="btn-secondary" disabled={!goals.length} onClick={onStartAllWeeks}><RotateCcw size={16} />Start new week</button><div className="card px-4 py-3"><p className="text-xs text-slate-400">On track</p><p className="mt-1 text-xl font-bold">{onTrack}<span className="text-sm font-normal text-slate-400"> / {goals.length}</span></p></div><div className="card px-4 py-3"><p className="text-xs text-slate-400">Completed</p><p className="mt-1 text-xl font-bold">{completed}</p></div></div></div>
    {goals.length ? <div className="mt-7 grid gap-5">{goals.map((goal) => <GoalCard key={goal.id} goal={goal} activities={activities} onLog={onLog} onEdit={onEdit} onStartWeek={onStartWeek} onDelete={onDelete} />)}</div> : <div className="card mt-8 py-16 text-center"><Target className="mx-auto text-slate-300" size={40} /><h2 className="mt-4 text-lg font-bold">No goals yet</h2><p className="mt-1 text-sm text-slate-500">Create a goal to start tracking progress.</p></div>}
  </div>
}

function buildChartData(goal, activities) {
  const goalActivities = activities.filter((a) => a.goalId === goal.id).sort((a, b) => a.date.localeCompare(b.date))
  let current = goal.startValue
  return [{ date: goal.startDate, value: current }, ...goalActivities.map((a) => {
    if (a.entryType === 'set') current = a.amount
    else current += goal.direction === 'decrease' ? -a.amount : a.amount
    return { date: a.date, value: current }
  })]
}

function HistoryPage({ goals, activities }) {
  const [selected, setSelected] = useState(goals[0]?.id || '')
  const grouped = useMemo(() => activities.reduce((acc, a) => { const week = startOfWeek(a.date); (acc[week] ||= []).push(a); return acc }, {}), [activities])
  const goal = goals.find((g) => g.id === selected) || goals[0]
  return <div>
    <div data-testid="history-page"><p className="text-sm font-semibold text-brand-600">Progress over time</p><h1 className="mt-1 text-3xl font-bold tracking-tight">History</h1></div>
    {goal && <div className="card mt-7 p-5 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Progress chart</p><h2 className="mt-1 text-lg font-bold">{goal.name}</h2></div><select className="field w-full sm:w-56" value={goal.id} onChange={(e) => setSelected(e.target.value)}>{goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
      <div className="mt-6 h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={buildChartData(goal, activities)} margin={{ left: -15, right: 10 }}><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(v) => formatDate(v, { month: 'long', day: 'numeric', year: 'numeric' })} formatter={(v) => [`${formatNum(v)} ${goal.unit}`, goal.measurement]} /><Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} fill="url(#fill)" /></AreaChart></ResponsiveContainer></div>
    </div>}
    <h2 className="mt-9 text-lg font-bold">Weekly activity</h2>
    <div className="mt-4 space-y-4">{Object.keys(grouped).sort().reverse().map((week) => <div className="card overflow-hidden" key={week}><div className="flex items-center justify-between border-b bg-slate-50 px-5 py-3"><span className="text-sm font-semibold">Week of {formatDate(week, { month: 'long', day: 'numeric' })}</span><span className="text-xs text-slate-400">{grouped[week].length} entries</span></div><div className="divide-y">{grouped[week].sort((a,b) => b.date.localeCompare(a.date)).map((a) => { const g = goals.find((x) => x.id === a.goalId); return <div className="flex items-start justify-between gap-4 px-5 py-4" key={a.id}><div><p className="text-sm font-semibold">{g?.name || 'Deleted goal'}</p><p className="mt-1 text-xs text-slate-500">{a.note || (a.entryType === 'set' ? 'Updated current value' : 'Logged progress')} · {formatDate(a.date)}</p></div><span className="shrink-0 text-sm font-bold">{a.entryType === 'set' ? '' : '+'}{formatNum(a.amount)} {a.unit}</span></div>})}</div></div>)}
    {!activities.length && <div className="card py-12 text-center text-sm text-slate-500">Your logged activity will appear here.</div>}</div>
  </div>
}

function ExportPage({ goals, activities, onImport }) {
  const [copied, setCopied] = useState('')
  const [importError, setImportError] = useState('')
  const summary = goals.map((g) => `${getStatus(g)} — ${g.name}: ${formatNum(g.currentValue)} / ${formatNum(g.targetValue)} ${g.unit} (${Math.round(progressPercent(g))}%), ${daysBetween(today(), g.endDate)} days left`).join('\n')
  const weekly = goals.map((g) => `${g.name}: ${formatNum(weeklyProgress(g, activities))} / ${formatNum(g.weeklyTarget)} ${g.unit} this week — ${getStatus(g)}`).join('\n')
  const copy = async (text, name) => { await navigator.clipboard.writeText(text); setCopied(name); setTimeout(() => setCopied(''), 1800) }
  const download = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), goals, activities }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `goal-tracker-${today()}.json`; a.click(); URL.revokeObjectURL(url)
  }
  const importBackup = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const backup = JSON.parse(await file.text())
      if (!backup || !Array.isArray(backup.goals) || !Array.isArray(backup.activities)) throw new Error('Backup must contain goals and activities arrays.')
      if (!backup.goals.every((goal) => goal && typeof goal.id === 'string' && typeof goal.name === 'string')) throw new Error('One or more goals are missing required fields.')
      if (!backup.activities.every((activity) => activity && typeof activity.id === 'string' && typeof activity.goalId === 'string')) throw new Error('One or more activities are missing required fields.')
      if (!confirm(`Restore ${backup.goals.length} goals and ${backup.activities.length} activity entries? This will replace your current dashboard.`)) return
      setImportError('')
      onImport({ goals: backup.goals, activities: backup.activities })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'This file is not a valid Goal Tracker backup.')
    }
  }
  return <div data-testid="export-page"><p className="text-sm font-semibold text-brand-600">Take your data anywhere</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Export</h1><div className="mt-7 grid gap-5 lg:grid-cols-2">
    {[['Dashboard summary', summary, 'dashboard'], ['Weekly summary', weekly, 'weekly']].map(([title, text, id]) => <div className="card p-5 sm:p-6" key={id}><h2 className="font-bold">{title}</h2><pre className="mt-4 min-h-36 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-sm leading-6 text-slate-600">{text || 'No goals to summarize yet.'}</pre><button className="btn-secondary mt-4 w-full" onClick={() => copy(text, id)}>{copied === id ? <Check size={17} /> : <Copy size={17} />}{copied === id ? 'Copied' : 'Copy text'}</button></div>)}
    <div className="card p-5 sm:col-span-2 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-bold">Full data backup</h2><p className="mt-1 text-sm text-slate-500">Export every goal and activity entry, or restore a previous JSON backup.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="btn-secondary cursor-pointer"><Upload size={17} />Import JSON<input className="hidden" type="file" accept="application/json,.json" onChange={importBackup} /></label><button className="btn-primary" onClick={download}><Download size={17} />Export JSON</button></div></div>{importError && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{importError}</p>}</div>
  </div></div>
}

function App() {
  const [data, setData] = useState(() => { try { return normalizeData(JSON.parse(localStorage.getItem(STORAGE_KEY)) || { goals: [], activities: [] }) } catch { return { goals: [], activities: [] } } })
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('goal-tracker-theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [page, setPage] = useState('dashboard')
  const [setup, setSetup] = useState(data.goals.length === 0)
  const [logging, setLogging] = useState(null)
  const [editing, setEditing] = useState(null)
  const [mobileNav, setMobileNav] = useState(false)
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(data)), [data])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('goal-tracker-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const addGoals = (goals) => { setData((d) => ({ ...d, goals: [...d.goals, ...goals] })); setSetup(false); setPage('dashboard') }
  const saveActivity = (activity) => {
    setData((d) => { const activities = [...d.activities, activity]; return { activities, goals: d.goals.map((g) => {
      if (g.id !== activity.goalId) return g
      return { ...g, currentValue: calculateCurrent(g, activities.filter((a) => a.goalId === g.id)) }
    }) } }); setLogging(null)
  }
  const saveGoal = (updatedGoal) => {
    setData((d) => {
      const activities = d.activities.map((activity) => activity.goalId === updatedGoal.id ? { ...activity, unit: updatedGoal.unit } : activity)
      const goalActivities = activities.filter((activity) => activity.goalId === updatedGoal.id)
      const goal = { ...updatedGoal, currentValue: calculateCurrent(updatedGoal, goalActivities) }
      return { activities, goals: d.goals.map((item) => item.id === goal.id ? goal : item) }
    })
    setEditing(null)
  }
  const startNewWeek = (goal) => {
    if (!confirm(`Start a new week for "${goal.name}"? This clears the weekly progress bar but keeps total progress and activity history.`)) return
    setData((d) => ({
      ...d,
      goals: d.goals.map((item) => item.id === goal.id ? {
        ...item,
        weekStartedAt: new Date().toISOString(),
        weekStartValue: item.currentValue,
        weekExcludedActivityIds: d.activities.filter((activity) => activity.goalId === item.id).map((activity) => activity.id),
      } : item),
    }))
  }
  const startAllWeeks = () => {
    if (!confirm('Start a new week for every goal? This clears all weekly progress bars but keeps total progress and activity history.')) return
    const weekStartedAt = new Date().toISOString()
    setData((d) => ({
      ...d,
      goals: d.goals.map((goal) => ({
        ...goal,
        weekStartedAt,
        weekStartValue: goal.currentValue,
        weekExcludedActivityIds: d.activities.filter((activity) => activity.goalId === goal.id).map((activity) => activity.id),
      })),
    }))
  }
  const deleteGoal = (id) => { if (confirm('Delete this goal and its activity history?')) setData((d) => ({ goals: d.goals.filter((g) => g.id !== id), activities: d.activities.filter((a) => a.goalId !== id) })) }
  const nav = [['dashboard', LayoutDashboard, 'Dashboard'], ['history', History, 'History'], ['export', Download, 'Export']]
  if (setup) return <main className="min-h-screen px-4 py-8 sm:py-14"><SetupWizard onFinish={addGoals} allowCancel={data.goals.length > 0} onCancel={() => setSetup(false)} /></main>
  return <div className="min-h-screen">
    <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><button className="flex items-center gap-2.5" onClick={() => setPage('dashboard')}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white"><Target size={19} /></span><span className="font-bold tracking-tight">Goal Tracker</span></button><nav className="hidden items-center gap-1 md:flex">{nav.map(([id, Icon, label]) => <button data-testid={`nav-${id}`} key={id} onClick={() => setPage(id)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${page === id ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}><Icon size={16}/>{label}</button>)}<button aria-label={darkMode ? 'Use light mode' : 'Use dark mode'} title={darkMode ? 'Use light mode' : 'Use dark mode'} className="ml-2 rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun size={18}/> : <Moon size={18}/>}</button><button data-testid="new-goal-button" className="btn-primary ml-1" onClick={() => setSetup(true)}><Plus size={16}/>New goal</button></nav><div className="flex items-center gap-1 md:hidden"><button aria-label={darkMode ? 'Use light mode' : 'Use dark mode'} className="rounded-xl p-2 text-slate-500" onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun size={20}/> : <Moon size={20}/>}</button><button className="rounded-xl p-2" onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? <X size={21}/> : <Menu size={21}/>}</button></div></div>
    {mobileNav && <div className="border-t bg-white p-3 md:hidden">{nav.map(([id, Icon, label]) => <button key={id} onClick={() => { setPage(id); setMobileNav(false) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600"><Icon size={17}/>{label}</button>)}<button className="btn-primary mt-2 w-full" onClick={() => { setSetup(true); setMobileNav(false) }}><Plus size={16}/>New goal</button></div>}</header>
    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">{page === 'dashboard' && <Dashboard goals={data.goals} activities={data.activities} onLog={setLogging} onEdit={setEditing} onStartWeek={startNewWeek} onStartAllWeeks={startAllWeeks} onDelete={deleteGoal} />}{page === 'history' && <HistoryPage goals={data.goals} activities={data.activities} />}{page === 'export' && <ExportPage goals={data.goals} activities={data.activities} onImport={(backup) => { setData(normalizeData(backup)); setPage('dashboard') }} />}</main>
    {logging && <LogActivity goal={logging} onSave={saveActivity} onClose={() => setLogging(null)} />}
    {editing && <EditGoal goal={editing} onSave={saveGoal} onClose={() => setEditing(null)} />}
  </div>
}

export default App
