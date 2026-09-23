import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export interface ErrorBoundaryProps {
  children: ReactNode
  fallbackTitle?: string
  fallbackMessage?: string
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Robust React Error Boundary
 * Prevents uncaught rendering exceptions from unmounting the DOM tree and making the transparent window disappear.
 * Renders a styled dark glass fallback card with recovery options.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo)
  }

  handleReload = (): void => {
    if (this.props.onReset) {
      this.props.onReset()
    }
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="island flex min-h-0 flex-1 flex-col items-center justify-center p-6 md:p-8 text-center select-none">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400 mb-4 shadow-[0_0_24px_rgba(239,68,68,0.2)]">
            <AlertTriangle size={28} />
          </div>
          <h3 className="text-base font-semibold text-ink">
            {this.props.fallbackTitle ?? 'Rendering error in this view'}
          </h3>
          <p className="mt-1.5 max-w-md text-xs text-muted leading-relaxed font-mono">
            {this.state.error?.message ??
              this.props.fallbackMessage ??
              'An unexpected rendering error occurred.'}
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-raised/90 px-4 text-xs font-semibold text-ink hover:bg-line hover:border-white/20 transition-all shadow-md active:scale-95"
            >
              <RefreshCw size={14} className="text-ember" />
              <span>Reload / بازخوانی</span>
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-medium text-faint hover:text-ink hover:bg-white/10 transition-colors"
            >
              <span>Restart App</span>
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
