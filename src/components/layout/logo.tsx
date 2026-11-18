'use client';

import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useId } from 'react';
import { cn } from '@/lib/cn';

/** The brand mark: ribbon-shaped A, a CV card, and the AI spark (docs/brand/aligned-logos, 03 RibbonProfile). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = `ribbon-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg aria-hidden width={size} height={size} viewBox="70 70 380 345" className={className}>
      <defs>
        <linearGradient id={id} x1=".12" y1=".93" x2=".92" y2=".08">
          <stop offset="0" stopColor="#FF9365" />
          <stop offset=".33" stopColor="#D44AD7" />
          <stop offset=".66" stopColor="#7137E9" />
          <stop offset="1" stopColor="#4E5AFF" />
        </linearGradient>
      </defs>
      <path
        d="M86 400 L205 107 Q213 87 237 87 L287 87 Q308 87 319 109 L432 400 L345 400 L263 177 L175 400 Z"
        fill={`url(#${id})`}
      />{' '}
      <path d="M186 307 L348 307 L373 371 L160 371 Z" fill={`url(#${id})`} />
      <g transform="rotate(5 288 238)">
        <rect
          x="236"
          y="125"
          width="112"
          height="201"
          rx="16"
          fill="#FFFFFF"
          stroke="#D7C8FF"
          strokeWidth="3"
        />
        <circle cx="273" cy="174" r="15" fill="#6846CD" />
        <path d="M245 207 Q271 177 297 207" fill="#6846CD" />
        <rect x="307" y="164" width="28" height="7" rx="3.5" fill="#A4A1D7" />
        <rect x="307" y="181" width="22" height="7" rx="3.5" fill="#A4A1D7" />
        <rect x="250" y="231" width="82" height="7" rx="3.5" fill="#B0ABD8" />
        <rect x="250" y="250" width="69" height="7" rx="3.5" fill="#B0ABD8" />
        <rect x="250" y="269" width="78" height="7" rx="3.5" fill="#B0ABD8" />
      </g>
      <path
        d="M399 83 Q404 106 427 111 Q404 116 399 139 Q394 116 371 111 Q394 106 399 83Z"
        fill="#FF9B49"
      />
    </svg>
  );
}

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  const t = useT();
  return (
    <Link
      href={href}
      className={cn('text-ink inline-flex items-center gap-2.5 rounded-sm', className)}
    >
      <LogoMark size={36} />
      <span className="font-display text-[19px] leading-none font-semibold tracking-tight whitespace-nowrap">
        {/* The visible words are the link's name, so speech users can say what they see. */}
        <span className="text-primary align-[1px] text-[12px] font-bold tracking-[0.08em] uppercase">
          {t('AI')}
        </span>{' '}
        {t('CV Studio')}
        <span className="sr-only">{t(', home')}</span>
      </span>
    </Link>
  );
}
