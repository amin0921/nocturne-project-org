import React, { useCallback, useEffect, useRef, useState } from 'react'
import { MoonStar } from 'lucide-react'
import { useSleepTimer } from '../../stores/useSleepTimer'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { SleepTimerPopover } from './SleepTimerPopover'
import { CountdownPill } from './CountdownPill'

/**
 * SleepTimerToggle — moon trigger + countdown pill + popover, anchored here.
 * Rendered between FavoriteButton and the volume knob in the PlayerBar; it
 * adds its own icon and never alters the existing PlayerBar icons.
 */
export function SleepTimerToggle(): JSX.Element {
  const mode = useSleepTimer((s) => s.mode)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const active = mode !== 'inactive'

  const toggle = useCallback(() => setOpen((o) => !o), [])
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center">
      {active && <CountdownPill onClick={toggle} />}
      <Button
        size="icon"
        variant="ghost"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Sleep timer"
        title="Sleep timer"
        className={cn(
          'h-9 w-9 rounded-full text-muted transition-all duration-150 hover:text-ink',
          // Kill the WebView2/UA white square focus ring (index.css paints a
          // global bone-white :focus-visible outline) — mouse clicks must flash
          // nothing; keyboard focus gets the seamless ember ring instead.
          'outline-none focus:outline-none focus-visible:outline-none',
          'focus:ring-0 focus-visible:ring-1 focus-visible:ring-[#EAB308]/40 focus-visible:ring-offset-0',
          active && 'text-ember drop-shadow-[0_0_8px_rgba(234,179,8,0.5)] hover:text-ember'
        )}
      >
        <MoonStar size={16} aria-hidden />
      </Button>
      <SleepTimerPopover open={open} onClose={close} />
    </div>
  )
}

export default SleepTimerToggle
