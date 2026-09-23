import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge class names with Tailwind conflict resolution (later wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(...inputs))
}

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

/** Latin digits → Persian digits. Non-digit characters pass through. */
export function toFaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)] ?? d)
}

/** Seconds → Latin `m:ss` (e.g. 84 → "1:24"). Null/invalid → "--:--". */
export function formatTime(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '--:--'
  }
  const total = Math.floor(totalSeconds)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

/** Seconds → Persian `mm:ss` (kept for opt-in Persian surfaces; timestamps default to Latin). */
export function formatTimeFa(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '--:--'
  }
  const total = Math.floor(totalSeconds)
  const mm = Math.floor(total / 60)
  const ss = (total % 60).toString().padStart(2, '0')
  return `${toFaDigits(mm)}:${toFaDigits(ss)}`
}
