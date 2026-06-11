import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'

const RANGES = [
  { value: '15m', label: '15 分钟' },
  { value: '1h', label: '1 小时' },
  { value: '6h', label: '6 小时' },
  { value: '24h', label: '24 小时' },
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' },
] as const

interface Props {
  range: string
  onRangeChange: (range: string, startTs?: number, endTs?: number) => void
}

export function RangeSelector({ range, onRangeChange }: Props) {
  const [showCustom, setShowCustom] = useState(range === 'custom')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')

  const applyCustom = () => {
    if (!startDate || !endDate) return
    const start = Math.floor(new Date(`${startDate}T${startTime || '00:00'}`).getTime() / 1000)
    const end = Math.floor(new Date(`${endDate}T${endTime || '23:59'}`).getTime() / 1000)
    onRangeChange('custom', start, end)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGES.map((r) => (
        <Button
          key={r.value}
          variant={range === r.value ? 'default' : 'outline'}
          size="sm"
          className={range === r.value ? 'bg-(--color-accent) hover:bg-(--color-accent-hover) text-white' : ''}
          onClick={() => {
            setShowCustom(false)
            onRangeChange(r.value)
          }}
        >
          {r.label}
        </Button>
      ))}
      <Button
        variant={range === 'custom' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setShowCustom(!showCustom)}
      >
        自定义
      </Button>

      {showCustom && (
        <div className="flex items-center gap-2 mt-2 w-full">
          <Input type="date" className="w-36" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input type="time" className="w-28" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <span className="text-(--color-muted) text-sm">至</span>
          <Input type="date" className="w-36" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <Input type="time" className="w-28" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          <Button size="sm" onClick={applyCustom}>确定</Button>
        </div>
      )}
    </div>
  )
}
