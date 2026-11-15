/**
 * Drag to reorder with a finger or pen (HTML drag and drop only works with a mouse). The grip
 * captures the pointer; the drop target is the element under the finger carrying `attr`, whose
 * value is the index to move to. The target gets data-touch-over while hovered.
 */
export function touchDragHandlers(attr: string, onDrop: (index: number) => void) {
  let over: Element | null = null;
  const clear = () => {
    over?.removeAttribute('data-touch-over');
    over = null;
  };
  return {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointers (tests) cannot be captured; moves still arrive on the grip.
      }
      e.currentTarget.setAttribute('data-touch-dragging', '');
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      if (!e.currentTarget.hasAttribute('data-touch-dragging')) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest(`[${attr}]`) ?? null;
      if (el !== over) {
        clear();
        over = el;
        over?.setAttribute('data-touch-over', '');
      }
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      if (!e.currentTarget.hasAttribute('data-touch-dragging')) return;
      e.currentTarget.removeAttribute('data-touch-dragging');
      const index = over ? Number(over.getAttribute(attr)) : NaN;
      clear();
      if (Number.isFinite(index)) onDrop(index);
    },
    onPointerCancel(e: React.PointerEvent<HTMLElement>) {
      e.currentTarget.removeAttribute('data-touch-dragging');
      clear();
    },
  };
}
