/**
 * Small schematic pictures for Design Studio choices (spec §7.3 level 2: picture tiles). Drawn in
 * currentColor plus the primary colour so they follow the theme; purely decorative (aria-hidden),
 * the tile's text label is the accessible name.
 */
import type { ReactNode } from 'react';

const W = 56;
const H = 40;
const line = (x: number, y: number, w: number, o = 0.35) => (
  <rect x={x} y={y} width={w} height={2.4} rx={1.2} fill="currentColor" opacity={o} />
);
const lines = (x: number, y: number, w: number, n: number, gap = 5) =>
  Array.from({ length: n }, (_, i) => line(x, y + i * gap, i === n - 1 ? w * 0.7 : w));
const accent = 'var(--color-primary, #2563eb)';

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" className="shrink-0">
      <rect
        x={0.5}
        y={0.5}
        width={W - 1}
        height={H - 1}
        rx={3}
        fill="#fff"
        stroke="currentColor"
        strokeOpacity={0.25}
      />
      {children}
    </svg>
  );
}

export function LayoutPicture({ value }: { value: string }) {
  switch (value) {
    case 'sidebar-left':
      return (
        <Frame>
          <rect x={1} y={1} width={17} height={H - 2} rx={2} fill={accent} opacity={0.18} />
          {lines(4, 7, 10, 5)}
          {lines(22, 7, 29, 6)}
        </Frame>
      );
    case 'sidebar-right':
      return (
        <Frame>
          <rect x={W - 18} y={1} width={17} height={H - 2} rx={2} fill={accent} opacity={0.18} />
          {lines(5, 7, 28, 6)}
          {lines(W - 15, 7, 10, 5)}
        </Frame>
      );
    case 'two-equal':
      return (
        <Frame>
          {lines(5, 7, 20, 6)}
          {lines(31, 7, 20, 6)}
        </Frame>
      );
    case 'rails':
      return (
        <Frame>
          {lines(4, 7, 11, 5)}
          {lines(19, 7, 18, 6)}
          {lines(41, 7, 11, 5)}
        </Frame>
      );
    case 'label-column':
      return (
        <Frame>
          {[7, 19, 31].map((y) => (
            <g key={y}>
              <rect x={4} y={y} width={11} height={2.6} rx={1.3} fill={accent} />
              {lines(19, y, 32, 2)}
            </g>
          ))}
        </Frame>
      );
    case 'timeline':
      return (
        <Frame>
          <rect x={9} y={5} width={1.4} height={H - 10} fill={accent} opacity={0.5} />
          {[8, 20, 31].map((y) => (
            <g key={y}>
              <circle cx={9.7} cy={y + 1.2} r={2.4} fill={accent} />
              {lines(15, y, 35, 2)}
            </g>
          ))}
        </Frame>
      );
    default:
      return <Frame>{lines(6, 7, 44, 6)}</Frame>;
  }
}

export function HeaderPicture({ value }: { value: string }) {
  const name = (x: number, y: number, w: number, fill: string = 'currentColor') => (
    <rect
      x={x}
      y={y}
      width={w}
      height={4.5}
      rx={1.5}
      fill={fill}
      opacity={fill === '#fff' ? 1 : 0.8}
    />
  );
  switch (value) {
    case 'centered':
      return (
        <Frame>
          {name(14, 6, 28)}
          {line(18, 14, 20)}
          {lines(6, 22, 44, 3)}
        </Frame>
      );
    case 'band':
      return (
        <Frame>
          <rect x={1} y={1} width={W - 2} height={15} rx={2} fill={accent} />
          {name(6, 5, 24, '#fff')}
          {lines(6, 22, 44, 3)}
        </Frame>
      );
    case 'split':
      return (
        <Frame>
          {name(5, 6, 22)}
          {line(34, 6, 17)}
          {line(34, 11, 14)}
          {lines(5, 22, 46, 3)}
        </Frame>
      );
    case 'card':
      return (
        <Frame>
          <rect x={4} y={4} width={W - 8} height={13} rx={3} fill={accent} opacity={0.14} />
          {name(8, 7, 22)}
          {lines(6, 23, 44, 3)}
        </Frame>
      );
    case 'monogram':
      return (
        <Frame>
          <circle cx={W / 2} cy={9} r={5.5} fill="none" stroke={accent} strokeWidth={1.4} />
          {name(15, 17, 26)}
          {lines(6, 27, 44, 2)}
        </Frame>
      );
    case 'in-sidebar':
      return (
        <Frame>
          <rect x={1} y={1} width={W - 2} height={13} rx={2} fill={accent} />
          {name(5, 4, 20, '#fff')}
          <rect x={1} y={14} width={16} height={H - 15} fill={accent} opacity={0.18} />
          {lines(21, 19, 30, 3)}
        </Frame>
      );
    default:
      return (
        <Frame>
          {name(5, 6, 26)}
          {line(5, 14, 18)}
          {lines(5, 22, 46, 3)}
        </Frame>
      );
  }
}

export function HeadingPicture({ value }: { value: string }) {
  const h = (x = 6, fill: string = accent) => (
    <rect x={x} y={8} width={20} height={3.6} rx={1.2} fill={fill} />
  );
  const body = lines(6, 21, 44, 3);
  switch (value) {
    case 'underline':
      return (
        <Frame>
          {h()}
          <rect x={6} y={14} width={20} height={1} fill={accent} />
          {body}
        </Frame>
      );
    case 'overline':
      return (
        <Frame>
          <rect x={6} y={5} width={44} height={1} fill={accent} />
          {h()}
          {body}
        </Frame>
      );
    case 'rule-after':
      return (
        <Frame>
          {h()}
          <rect x={29} y={9.4} width={21} height={1} fill="currentColor" opacity={0.3} />
          {body}
        </Frame>
      );
    case 'bar-left':
      return (
        <Frame>
          <rect x={6} y={6.5} width={2} height={6.5} fill={accent} />
          {h(11)}
          {body}
        </Frame>
      );
    case 'filled':
      return (
        <Frame>
          <rect x={5} y={6} width={46} height={8} rx={1.5} fill={accent} />
          <rect x={8} y={8.2} width={18} height={3.6} rx={1.2} fill="#fff" />
          {body}
        </Frame>
      );
    case 'boxed':
      return (
        <Frame>
          <rect
            x={5}
            y={5.5}
            width={24}
            height={9}
            rx={1.5}
            fill="none"
            stroke={accent}
            strokeWidth={1}
          />
          {h(7)}
          {body}
        </Frame>
      );
    case 'numbered':
      return (
        <Frame>
          <rect x={6} y={8} width={4} height={3.6} rx={1} fill={accent} opacity={0.6} />
          {h(12)}
          {body}
        </Frame>
      );
    case 'icon':
      return (
        <Frame>
          <circle cx={8.5} cy={9.8} r={3} fill={accent} />
          {h(14)}
          {body}
        </Frame>
      );
    default:
      return (
        <Frame>
          {h(6, 'currentColor')}
          {body}
        </Frame>
      );
  }
}
