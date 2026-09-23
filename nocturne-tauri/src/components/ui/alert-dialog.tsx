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
    <div
      className="vf-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel()
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nocturne-alert-title"
        aria-describedby={description ? 'nocturne-alert-description' : undefined}
        className="vf-modal-panel w-full max-w-sm rounded-xl border border-line bg-surface p-5"
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
