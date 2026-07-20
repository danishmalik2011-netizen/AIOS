import React from 'react'
import { createRoot } from 'react-dom/client'
import { Player } from '@remotion/player'
import { AiosPromo } from './aios-promo'
import { FPS, HEIGHT, TOTAL_DURATION, WIDTH } from './theme'
import { playClick } from './sound'

const App: React.FC = () => {
  const playerRef = React.useRef<any>(null)

  const onPlayerClick = React.useCallback((variant: 'soft' | 'tick' | 'confirm') => {
    playClick(variant)
  }, [])

  return (
    <div
      onClick={() => onPlayerClick('soft')}
      style={{ width: '100%', cursor: 'pointer' }}
    >
      <Player
        ref={playerRef}
        component={AiosPromo}
        durationInFrames={TOTAL_DURATION}
        fps={FPS}
        compositionWidth={WIDTH}
        compositionHeight={HEIGHT}
        controls
        loop
        autoPlay
        acknowledgeRemotionLicense
        initiallyMuted
        style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden' }}
        onClick={() => onPlayerClick('tick')}
      />
    </div>
  )
}

const el = document.getElementById('promo-root')
if (el) {
  createRoot(el).render(<App />)
}
