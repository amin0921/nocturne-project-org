/**
 * FLIP Animation: Measures source cover DOMRect from normal stage
 * and animates smoothly into the cinema stage cover position over 300ms
 * using the GPU-composited Web Animations API.
 */
export function flipEnter(
  targetEl: HTMLElement | null,
  sourceSelector = '[data-stage-cover="true"]'
): Animation | null {
  if (!targetEl) return null

  // Honor prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null
  }

  const sourceEl = document.querySelector<HTMLElement>(sourceSelector)
  if (!sourceEl) return null

  const firstRect = sourceEl.getBoundingClientRect()
  const lastRect = targetEl.getBoundingClientRect()

  if (
    firstRect.width === 0 ||
    firstRect.height === 0 ||
    lastRect.width === 0 ||
    lastRect.height === 0
  ) {
    return null
  }

  const firstCenterX = firstRect.left + firstRect.width / 2
  const firstCenterY = firstRect.top + firstRect.height / 2
  const lastCenterX = lastRect.left + lastRect.width / 2
  const lastCenterY = lastRect.top + lastRect.height / 2

  const deltaX = firstCenterX - lastCenterX
  const deltaY = firstCenterY - lastCenterY
  const scaleX = firstRect.width / lastRect.width
  const scaleY = firstRect.height / lastRect.height

  try {
    const animation = targetEl.animate(
      [
        {
          transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`,
          borderRadius: '16px'
        },
        {
          transform: 'translate3d(0, 0, 0) scale(1, 1)',
          borderRadius: '18px'
        }
      ],
      {
        duration: 300,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both'
      }
    )

    animation.onfinish = () => {
      // Clear inline transform/styles applied by fill: 'both' so standard CSS rules apply cleanly
      animation.cancel()
    }

    return animation
  } catch (err) {
    console.debug('FLIP animation error:', err)
    return null
  }
}
