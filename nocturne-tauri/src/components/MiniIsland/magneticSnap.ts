import { currentMonitor, getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window'
import { IS_MACOS } from '../../lib/platform'

export const MINI_WINDOW_WIDTH = 360
export const MINI_WINDOW_HEIGHT = 130

/**
 * Placement constants, branched per platform.
 *
 * The `false` branch is the literal set the Windows build shipped with and is
 * untouched. macOS needs different numbers for two structural reasons:
 *
 *  - TOP_DOCK_Y / TOP_SNAP_ZONE_Y: the macOS menu bar occupies the top ~24pt
 *    of every display, and MacBooks add a camera notch below it. Docking the
 *    130px island at y=16 puts it under the menu bar and the notch, so macOS
 *    docks lower and gets a taller snap zone to compensate.
 *
 *  - TASKBAR_RESERVE: the Windows taskbar is ~40px, which is what the constant
 *    encoded. The macOS Dock is ~70px, so reusing 40 would let the island settle
 *    underneath it. macOS uses 0 instead and relies purely on `workAreaBottom`,
 *    because winit reports `visibleFrame` on macOS — which already excludes both
 *    the menu bar and the Dock, whatever their current size. That also stays
 *    correct when the Dock is set to auto-hide and the work area is full-height.
 */
const TOP_SNAP_ZONE_Y = IS_MACOS ? 72 : 48
const TOP_CENTER_TOLERANCE_X = 140
const TOP_DOCK_Y = IS_MACOS ? 40 : 16
const EDGE_SNAP_ZONE_X = 40
const EDGE_MARGIN = 16
const TASKBAR_RESERVE = IS_MACOS ? 0 : 40
const GLIDE_DURATION_MS = 130
const GLIDE_STEPS = 4

/**
 * Y offset used when docking the island to the top-center of a display, in
 * logical px. Shared with App.tsx so the initial placement and the magnetic snap
 * always agree — 16 on Windows, 40 on macOS.
 */
export const MINI_TOP_DOCK_Y = TOP_DOCK_Y

export interface SnapPoint {
  x: number
  y: number
}

export interface SnapPlan {
  target: SnapPoint
  currentLogical: SnapPoint
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

/**
 * Pure magnetic snap math — all inputs in logical pixels (DPI already
 * divided out). Priority: top-center notch → side rails → always-on
 * taskbar/work-area Y guard. Returns the snapped target for a drop at
 * (currentX, currentY) on a screenWidth × screenHeight logical desktop.
 */
export function computeSnapTarget(
  currentX: number,
  currentY: number,
  screenWidth: number,
  screenHeight: number,
  workAreaBottom?: number
): SnapPoint {
  const centerX = Math.round((screenWidth - MINI_WINDOW_WIDTH) / 2)
  let x = currentX
  let y = currentY

  if (currentY <= TOP_SNAP_ZONE_Y && Math.abs(currentX - centerX) <= TOP_CENTER_TOLERANCE_X) {
    x = centerX
    y = TOP_DOCK_Y
  } else if (currentX < EDGE_SNAP_ZONE_X) {
    x = EDGE_MARGIN
  } else if (currentX > screenWidth - MINI_WINDOW_WIDTH - EDGE_SNAP_ZONE_X) {
    x = screenWidth - MINI_WINDOW_WIDTH - EDGE_MARGIN
  }

  let maxY = screenHeight - MINI_WINDOW_HEIGHT - TASKBAR_RESERVE
  if (typeof workAreaBottom === 'number') {
    maxY = Math.min(maxY, workAreaBottom - MINI_WINDOW_HEIGHT)
  }
  y = Math.min(y, maxY)

  return { x: Math.round(x), y: Math.round(y) }
}

/**
 * Read the current monitor (physical px + scaleFactor), convert the window's
 * physical position and the desktop bounds into logical pixels, and resolve
 * the snap target. Returns null when no monitor context is available.
 */
export async function resolveSnapPlan(
  win: ReturnType<typeof getCurrentWindow>
): Promise<SnapPlan | null> {
  const monitor = await currentMonitor()
  if (!monitor) return null
  const scaleFactor = monitor.scaleFactor
  const screenWidth = monitor.size.width / scaleFactor
  const screenHeight = monitor.size.height / scaleFactor
  const originX = monitor.position.x / scaleFactor
  const originY = monitor.position.y / scaleFactor
  const workAreaBottom =
    (monitor.workArea.position.y + monitor.workArea.size.height) / scaleFactor - originY

  const physical = await win.outerPosition()
  const currentLogical = {
    x: physical.x / scaleFactor - originX,
    y: physical.y / scaleFactor - originY
  }

  const target = computeSnapTarget(
    currentLogical.x,
    currentLogical.y,
    screenWidth,
    screenHeight,
    workAreaBottom
  )

  return { target, currentLogical }
}

/**
 * 4-step ease-out glide (~130ms total) from the drop point to the snapped
 * logical target, expressed in absolute logical desktop coordinates.
 * Commits the exact final coordinate as the last setPosition.
 */
export async function glideToTarget(
  win: ReturnType<typeof getCurrentWindow>,
  fromLogicalAbs: SnapPoint,
  toLogicalAbs: SnapPoint
): Promise<void> {
  for (let i = 1; i <= GLIDE_STEPS; i++) {
    const t = i / GLIDE_STEPS
    const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
    const x = Math.round(fromLogicalAbs.x + (toLogicalAbs.x - fromLogicalAbs.x) * eased)
    const y = Math.round(fromLogicalAbs.y + (toLogicalAbs.y - fromLogicalAbs.y) * eased)
    await win.setPosition(new LogicalPosition(x, y))
    if (i < GLIDE_STEPS) await sleep(GLIDE_DURATION_MS / GLIDE_STEPS)
  }
  await win.setPosition(
    new LogicalPosition(Math.round(toLogicalAbs.x), Math.round(toLogicalAbs.y))
  )
}

/**
 * Full settle pass: resolve snap zones, and if the drop qualifies (or the
 * taskbar guard clamps Y), glide the window into place and return the final
 * PHYSICAL coordinate to persist. Returns null when no movement is needed.
 */
export async function settleMagneticSnap(
  win: ReturnType<typeof getCurrentWindow>
): Promise<SnapPoint | null> {
  try {
    const plan = await resolveSnapPlan(win)
    if (!plan) return null

    const monitor = await currentMonitor()
    if (!monitor) return null
    const scaleFactor = monitor.scaleFactor
    const originX = monitor.position.x / scaleFactor
    const originY = monitor.position.y / scaleFactor

    const dx = plan.target.x - plan.currentLogical.x
    const dy = plan.target.y - plan.currentLogical.y
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null

    await glideToTarget(
      win,
      { x: plan.currentLogical.x + originX, y: plan.currentLogical.y + originY },
      { x: plan.target.x + originX, y: plan.target.y + originY }
    )

    return {
      x: Math.round((plan.target.x + originX) * scaleFactor),
      y: Math.round((plan.target.y + originY) * scaleFactor)
    }
  } catch {
    return null
  }
}
