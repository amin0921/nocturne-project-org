import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { Button } from './button'

export interface AlertDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  waitingLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

/**
 * Nocturne alert dialog (vibefarsi spec: role="alertdialog", initial focus
 * on cancel, confirm disabled while pending with waiting copy).
 * LTR, Nocturne dark tokens, Latin digits. Dismisses on Esc / overlay click.
 */
export function AlertDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  waitingLabel = 'Working…',
  destructive = false,
  onConfirm,
  onCancel
}: AlertDialogProps): JSX.Element | null {
  const [pending, setPending] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setPending(false)
    // Initial focus on cancel, never on the destructive action.
    cancelRef.current?.focus()
  }, [open ])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
        return
      }
      // Minimal focus trap: cycle Tab within the panel.
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled])'
        )
        if (focusables.length === 0) return
        const first = focusables[0] as HTMLElement
        const last = focusables[focusables.length - 1] as HTMLElement
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onCancel])

  // Non-blocking dismissal (nocturne-ui-spec): the overlay wrapper is
  // pointer-events-none, so outside clicks fall through to whatever control
  // sits underneath. This window listener observes the same pointerdown in
  // the capture phase — WITHOUT consuming it — so a click on Play/Pause, the
  // seeker, or any island both dismisses the dialog AND performs that
  // control's own action.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (pending) return
      if (
        panelRef.current &&
        e.target instanceof Node &&
        panelRef.current.contains(e.target)
      ) {
        return
      }
      onCancel()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, pending, onCancel])

  if (!open) return null

  const handleConfirm = (): void => {
    const result = onConfirm()
    if (result instanceof Promise) {
      setPending(true)
      const done = (): void => setPending(false)
      result.then(done, done)
    }
  }

  return (
    // Passthrough contract (nocturne-ui-spec §2/§4.4): the window is frameless
    // and fully transparent, and this alert must not block the rest of the
    // app. The wrapper stays an invisible, non-capturing centering frame
    // (pointer-events-none — no scrim, no click swallowing); only the glass
    // card itself is interactive. Outside-click dismissal lives in the window
    // listener above.
    <div className="vf-modal-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nocturne-alert-title"
        aria-describedby={description ? 'nocturne-alert-description' : undefined}
        className="vf-modal-panel pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-[#121419]/95 p-6 backdrop-blur-xl"
      >
        <h2 id="nocturne-alert-title" className="text-[15px] font-semibold text-ink">
          {title}
        </h2>
        {description && (
          <p id="nocturne-alert-description" className="mt-2 text-[13px] leading-relaxed text-muted">
            {description}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} variant="outline" size="md" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            size="md"
            onClick={handleConfirm}
            disabled={pending}
            className={cn(!destructive && 'bg-ember text-base hover:bg-emberhover')}
          >
            {pending ? waitingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
