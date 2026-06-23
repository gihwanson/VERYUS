import React from 'react';
import { Mic, Headphones, ListMusic } from 'lucide-react';
import '../styles/ChorusHowToGuide.css';

interface Props {
  variant?: 'compact' | 'full';
  className?: string;
}

const STEPS = [
  {
    icon: Mic,
    title: '첫 소절 올리기',
    desc: '한 사람이 노래의 첫 소절을 녹음해서 올립니다.',
  },
  {
    icon: Headphones,
    title: '다음 소절 이어붙이기',
    desc: '다음 사람이 앞 소절을 듣고, 바로 이어지는 다음 소절을 녹음합니다.',
  },
  {
    icon: ListMusic,
    title: '처음부터 끝까지 듣기',
    desc: '1소절 → 2소절 → 3소절… 순서대로 이어져 들립니다.',
  },
];

const ChorusHowToGuide: React.FC<Props> = ({ variant = 'full', className = '' }) => (
  <div className={`chorus-howto chorus-howto--${variant} ${className}`.trim()} role="note" aria-label="이용 방법">
    <p className="chorus-howto__heading">이렇게 이어 불러요</p>
    <ol className="chorus-howto__steps">
      {STEPS.map((step, i) => (
        <li key={step.title} className="chorus-howto__step">
          <span className="chorus-howto__num">{i + 1}</span>
          <step.icon size={variant === 'compact' ? 16 : 18} aria-hidden className="chorus-howto__icon" />
          <div className="chorus-howto__text">
            <strong>{step.title}</strong>
            {variant === 'full' && <span>{step.desc}</span>}
          </div>
        </li>
      ))}
    </ol>
  </div>
);

export default ChorusHowToGuide;
