// Single native HTMLAudioElement for the whole app. Created once, never destroyed.
// No Howler/Tone/Web-Audio decode (AGENTS.md). timeupdate fires ~4Hz natively.

type Handler = () => void

class AudioController {
  private audio: HTMLAudioElement | null = null
  private timeHandlers = new Set<Handler>()

  private ensure(): HTMLAudioElement {
    if (!this.audio) {
      const el = new Audio()
      el.preload = 'auto'
      // Native timeupdate fires ~4Hz — the spec'd seek-bar clock. No extra throttle.
      el.addEventListener('timeupdate', () => {
        this.timeHandlers.forEach((h) => h())
      })
      this.audio = el
    }
    return this.audio
  }

  get element(): HTMLAudioElement {
    return this.ensure()
  }

  load(url: string): void {
    const el = this.ensure()
    if (el.getAttribute('src') !== url) {
      el.src = url
      el.load()
    }
  }

  async play(): Promise<void> {
    await this.ensure().play()
  }

  pause(): void {
    this.ensure().pause()
  }

  seek(seconds: number): void {
    const el = this.ensure()
    if (Number.isFinite(el.duration) && el.duration > 0) {
      el.currentTime = Math.min(Math.max(0, seconds), el.duration)
    } else {
      el.currentTime = Math.max(0, seconds)
    }
    this.timeHandlers.forEach((h) => h())
  }

  setVolume(volume01: number): void {
    this.ensure().volume = Math.min(1, Math.max(0, volume01))
  }

  setMuted(muted: boolean): void {
    this.ensure().muted = muted
  }

  getTime(): number {
    return this.ensure().currentTime
  }

  getDuration(): number {
    return this.ensure().duration
  }

  onTime(cb: Handler): () => void {
    this.timeHandlers.add(cb)
    return () => {
      this.timeHandlers.delete(cb)
    }
  }
}

export const audioController = new AudioController()
