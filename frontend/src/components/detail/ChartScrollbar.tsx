import { useEffect, useRef, useCallback } from 'react'
import type { MutableRefObject } from 'react'
import type { AnyChartInstance } from '@/plugins/chart/types'
import { setScrollbarDragging } from '@/plugins/chart/scrollbarSync'

interface Props {
  chartRef: MutableRefObject<AnyChartInstance | null>
  leftPct: number
  widthPct: number
  onPan: (targetMin: number, targetMax: number, viewRange: number) => void
  fullMin: number
  fullMax: number
}

export function ChartScrollbar({ chartRef, leftPct, widthPct, onPan, fullMin, fullMax }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startLeftPct = useRef(0)

  const getClientX = useCallback((e: MouseEvent | TouchEvent) => {
    return 'touches' in e ? e.touches[0].clientX : e.clientX
  }, [])

  const applyPan = useCallback(
    (pct: number) => {
      const fullRange = fullMax - fullMin
      const viewRange = chartRef.current ? (chartRef.current.scales.x.max - chartRef.current.scales.x.min) : fullRange
      const targetMin = fullMin + (pct / 100) * fullRange
      dragging.current = true
      onPan(targetMin, targetMin + viewRange, viewRange)
      dragging.current = false
    },
    [chartRef, fullMin, fullMax, onPan]
  )

  useEffect(() => {
    const thumb = thumbRef.current
    const track = trackRef.current
    if (!thumb || !track) return

    const onDragStart = (e: MouseEvent | TouchEvent) => {
      dragging.current = true
      setScrollbarDragging(true)
      startX.current = getClientX(e)
      startLeftPct.current = parseFloat(thumb.style.left || '0')
      e.preventDefault()
      e.stopPropagation()
    }

    const onTrackClick = (e: MouseEvent | TouchEvent) => {
      if (e.target === thumb) return
      const rect = track.getBoundingClientRect()
      const clickPct = ((getClientX(e) - rect.left) / rect.width) * 100
      const w = parseFloat(thumb.style.width || '100')
      applyPan(Math.max(0, Math.min(100 - w, clickPct - w / 2)))
    }

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return
      e.preventDefault()
      const rect = track.getBoundingClientRect()
      const dxPct = ((getClientX(e) - startX.current) / rect.width) * 100
      const w = parseFloat(thumb.style.width || '100')
      applyPan(Math.max(0, Math.min(100 - w, startLeftPct.current + dxPct)))
    }

    const onEnd = () => { dragging.current = false; setScrollbarDragging(false) }

    thumb.addEventListener('mousedown', onDragStart)
    thumb.addEventListener('touchstart', onDragStart, { passive: false })
    track.addEventListener('mousedown', onTrackClick)
    track.addEventListener('touchstart', onTrackClick, { passive: false })
    document.addEventListener('mousemove', onMove)
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('mouseup', onEnd)
    document.addEventListener('touchend', onEnd)

    return () => {
      thumb.removeEventListener('mousedown', onDragStart)
      thumb.removeEventListener('touchstart', onDragStart)
      track.removeEventListener('mousedown', onTrackClick)
      track.removeEventListener('touchstart', onTrackClick)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('mouseup', onEnd)
      document.removeEventListener('touchend', onEnd)
    }
  }, [getClientX, applyPan])

  return (
    <div className="h-4 mt-2 bg-(--color-hover) rounded cursor-pointer" ref={trackRef}>
      <div
        ref={thumbRef}
        className="h-full bg-(--color-accent)/30 rounded hover:bg-(--color-accent)/50 transition-colors"
        style={{ width: `${widthPct}%`, marginLeft: `${leftPct}%` }}
      />
    </div>
  )
}
