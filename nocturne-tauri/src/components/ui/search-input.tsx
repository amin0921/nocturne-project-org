import { forwardRef, useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface SearchInputProps {
  value: string
  /** Fired debounced (default 200ms); also fired immediately on clear/Escape. */
  onChange: (value: string) => void
  debounceMs?: number
  placeholder?: string
  ariaLabel?: string
  className?: string
}

/** Nocturne-styled search field: Lucide glass, clear button, Esc to clear. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, debounceMs = 200, placeholder = 'Search…', ariaLabel = 'Search', className },
  ref
) {
  const [text, setText] = useState(value)

  useEffect(() => {
    setText(value)
  }, [value])

  useEffect(() => {
    if (text === value) return
    const timer = setTimeout(() => onChange(text), debounceMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, debounceMs])

  const clear = (): void => {
    setText('')
    onChange('')
  }

  return (
    <div className={cn('relative w-full', className)}>
      <Search
        size={14}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        ref={ref}
        type="text"
        role="searchbox"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && text) {
            e.stopPropagation()
            clear()
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-9 w-full rounded-lg border border-line bg-raised pl-9 pr-8 text-sm text-ink placeholder:text-faint focus:border-linestrong focus:outline-none"
      />
      {text && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  )
})
