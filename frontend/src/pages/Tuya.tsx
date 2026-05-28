/**
 * Tuya IoT page — embeds the standalone Tuya bridge UI inside the
 * platform layout. The bridge UI lives at /tuya-app/ (a deliberately
 * different path from the React route /tuya so nginx doesn't 301 the
 * SPA navigation away from React-Router).
 */
import { useEffect } from 'react'

export default function Tuya() {
  useEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null
    if (!main) return
    const prev = {
      display: main.style.display,
      overflow: main.style.overflow,
      padding: main.style.padding,
    }
    main.style.display = 'flex'
    main.style.overflow = 'hidden'
    main.style.padding = '0'
    return () => {
      main.style.display = prev.display
      main.style.overflow = prev.overflow
      main.style.padding = prev.padding
    }
  }, [])

  return (
    <iframe
      src="/tuya-app/"
      title="Tuya IoT"
      allow="camera; autoplay; fullscreen"
      style={{
        flex: '1 1 auto',
        width: '100%',
        height: '100%',
        border: 0,
        display: 'block',
        background: '#0a0e17',
      }}
    />
  )
}
