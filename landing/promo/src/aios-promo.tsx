import type React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { CtaScene } from './scenes/cta'
import { FeaturesScene } from './scenes/features'
import { IntroScene } from './scenes/intro'
import { ProblemScene } from './scenes/problem'
import { RevealScene } from './scenes/reveal'
import { WorkflowScene } from './scenes/workflow'
import { SCENES } from './theme'

export const AiosPromo: React.FC = () => {
  let from = 0
  const seq = (duration: number) => {
    const start = from
    from += duration
    return start
  }

  const intro = seq(SCENES.intro)
  const problem = seq(SCENES.problem)
  const reveal = seq(SCENES.reveal)
  const features = seq(SCENES.features)
  const workflow = seq(SCENES.workflow)
  const cta = seq(SCENES.cta)

  return (
    <AbsoluteFill style={{ background: '#211E19' }}>
      <Sequence from={intro} durationInFrames={SCENES.intro}>
        <IntroScene />
      </Sequence>
      <Sequence from={problem} durationInFrames={SCENES.problem}>
        <ProblemScene />
      </Sequence>
      <Sequence from={reveal} durationInFrames={SCENES.reveal}>
        <RevealScene />
      </Sequence>
      <Sequence from={features} durationInFrames={SCENES.features}>
        <FeaturesScene />
      </Sequence>
      <Sequence from={workflow} durationInFrames={SCENES.workflow}>
        <WorkflowScene />
      </Sequence>
      <Sequence from={cta} durationInFrames={SCENES.cta}>
        <CtaScene />
      </Sequence>
    </AbsoluteFill>
  )
}
