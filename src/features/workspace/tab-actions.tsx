'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react';
import { useT } from '@/i18n/client';

type Props = {
  label: string;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  named: boolean;
  disabled: boolean;
  onRename: () => void;
  onReset: () => void;
  onMove: (direction: -1 | 1) => void;
};

/** Portalled so the rail's scrolling viewport cannot clip its actions. */
export function TabActions({
  label,
  canMoveLeft,
  canMoveRight,
  named,
  disabled,
  onRename,
  onReset,
  onMove,
}: Props) {
  const t = useT();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const shown = !!anchor && !disabled;
  const dismiss = (restore = false) => {
    setAnchor(null);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!shown || !popup.current) return;
    const menu = popup.current;
    const rect = menu.getBoundingClientRect();
    const origin = trigger.current!.getBoundingClientRect();
    // Rects use visual pixels; fixed positioning uses layout pixels under CSS zoom.
    const scale = rect.width / menu.offsetWidth || 1;
    const gap = 8 * scale;
    const left = Math.max(gap, Math.min(origin.right - rect.width, innerWidth - rect.width - gap));
    const top = Math.max(gap, Math.min(origin.bottom + 6 * scale, innerHeight - rect.height - gap));
    menu.style.left = `${left / scale}px`;
    menu.style.top = `${top / scale}px`;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [shown]);

  useEffect(() => {
    if (!shown) return;
    const origin = trigger.current!.getBoundingClientRect();
    const viewport = { width: innerWidth, height: innerHeight };
    const outside = (event: PointerEvent) => {
      if (
        !popup.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setAnchor(null);
    };
    const reposition = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target)) return;
      const current = trigger.current?.getBoundingClientRect();
      // Focus can queue a scroll notification before opening. Keep a stationary anchor open.
      if (
        current?.right === origin.right &&
        current?.bottom === origin.bottom &&
        innerWidth === viewport.width &&
        innerHeight === viewport.height
      )
        return;
      if (popup.current?.contains(document.activeElement))
        trigger.current?.focus({ preventScroll: true });
      setAnchor(null);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
    };
  }, [shown]);

  const actions = [
    { label: 'Rename', icon: Pencil, disabled: false, action: onRename },
    { label: 'Reset name', icon: RotateCcw, disabled: !named, action: onReset },
    { label: 'Move left', icon: ArrowLeft, disabled: !canMoveLeft, action: () => onMove(-1) },
    { label: 'Move right', icon: ArrowRight, disabled: !canMoveRight, action: () => onMove(1) },
  ];

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="workspace-tab-action"
        aria-label={t('Actions for {title}', { title: label })}
        title={t('Actions for {title}', { title: label })}
        aria-haspopup="menu"
        aria-expanded={shown}
        aria-controls={shown ? id : undefined}
        disabled={disabled}
        data-testid="tab-menu"
        onClick={() => {
          if (shown) dismiss(true);
          else {
            const rect = trigger.current!.getBoundingClientRect();
            setAnchor({ left: rect.right - 208, top: rect.bottom + 6 });
          }
        }}
      >
        <MoreHorizontal aria-hidden size={16} />
      </button>
      {shown &&
        createPortal(
          <div
            ref={popup}
            id={id}
            role="menu"
            aria-label={t('Workspace actions')}
            className="workspace-tab-menu border-line bg-surface shadow-2 fixed z-50 w-52 max-w-[calc(100vw-1rem)] rounded-md border p-1"
            style={anchor}
            onKeyDown={(event) => {
              const buttons = Array.from(
                popup.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              );
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              let next: number | undefined;
              if (event.key === 'Escape') {
                event.preventDefault();
                dismiss(true);
              } else if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
              else if (event.key === 'ArrowUp')
                next = (index - 1 + buttons.length) % buttons.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = buttons.length - 1;
              else if (event.key === 'Tab') {
                // Return to the opener before the browser performs its normal Tab/Shift+Tab move.
                dismiss(true);
              }
              if (next !== undefined) {
                event.preventDefault();
                buttons[next]?.focus({ preventScroll: true });
              }
            }}
          >
            {actions.map(({ label: text, icon: Icon, disabled: unavailable, action }) => (
              <button
                key={text}
                type="button"
                role="menuitem"
                aria-keyshortcuts={text === 'Rename' ? 'F2' : undefined}
                tabIndex={-1}
                disabled={unavailable}
                onClick={() => {
                  dismiss();
                  action();
                }}
                className="text-ink hover:bg-sunken focus-visible:bg-primary-soft flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-sm disabled:cursor-default disabled:opacity-40"
              >
                <Icon size={16} aria-hidden />
                {t(text)}
                {text === 'Rename' && (
                  <kbd aria-hidden className="text-ink-subtle ml-auto text-xs">
                    F2
                  </kbd>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
