'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/cn';
import { MAX_TAB_NAME_LENGTH, type Tab } from './tabs';
import { TabActions } from './tab-actions';

type Props = {
  tab: Tab;
  selected: boolean;
  editing: boolean;
  dragging: boolean;
  reducedMotion: boolean;
  index: number;
  count: number;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onClose: () => void;
  onStartRename: () => void;
  onFinishRename: (name: string | undefined, restoreFocus: boolean) => void;
  onReset: () => void;
  onMove: (direction: -1 | 1) => void;
  suppressClick: () => boolean;
};

export function WorkspaceTabItem({
  tab,
  selected,
  editing,
  dragging,
  reducedMotion,
  index,
  count,
  register,
  onSelect,
  onClose,
  onStartRename,
  onFinishRename,
  onReset,
  onMove,
  suppressClick,
}: Props) {
  const t = useT();
  const label = tab.customTitle ?? t(tab.title);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tab.id,
    disabled: editing,
    transition: { duration: 200, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
  });
  return (
    <li
      ref={setNodeRef}
      data-tab-id={tab.id}
      className={cn(
        'workspace-tab',
        selected && 'workspace-tab-selected',
        isDragging && 'workspace-tab-dragging',
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: reducedMotion ? 'none' : transition,
      }}
    >
      {editing ? (
        <RenameField initialName={label} onFinish={onFinishRename} />
      ) : (
        <button
          ref={(node) => {
            setActivatorNodeRef(node);
            register(tab.id, node);
          }}
          {...listeners}
          type="button"
          aria-current={selected ? 'page' : undefined}
          aria-keyshortcuts="F2"
          aria-describedby={attributes['aria-describedby']}
          title={label + '\n' + t('Drag to reorder, or use the workspace actions menu.')}
          className="workspace-tab-label"
          data-testid="tab"
          onClick={(event) => {
            if (suppressClick()) {
              event.preventDefault();
              return;
            }
            onSelect();
          }}
          onKeyDown={(event) => {
            if (event.key === 'F2' && !dragging) {
              event.preventDefault();
              onStartRename();
            }
          }}
        >
          <span className="truncate">{label}</span>
          {tab.ready && !selected && (
            <span
              className="bg-primary ml-auto size-2 shrink-0 rounded-full"
              role="img"
              aria-label={t('Ready')}
              data-testid="tab-ready"
            />
          )}
        </button>
      )}
      {editing && tab.ready && !selected && (
        <span
          className="bg-primary size-2 shrink-0 rounded-full"
          role="img"
          aria-label={t('Ready')}
          data-testid="tab-ready"
        />
      )}
      <TabActions
        label={label}
        canMoveLeft={index > 0}
        canMoveRight={index < count - 1}
        named={tab.customTitle !== undefined}
        disabled={dragging || editing}
        onRename={onStartRename}
        onReset={onReset}
        onMove={onMove}
      />
      <button
        type="button"
        aria-label={t('Close {title}', { title: label })}
        title={t('Close {title}', { title: label })}
        className="workspace-tab-action workspace-tab-close"
        disabled={dragging}
        onClick={onClose}
        data-testid="tab-close"
      >
        <X aria-hidden size={15} />
      </button>
    </li>
  );
}

function RenameField({
  initialName,
  onFinish,
}: {
  initialName: string;
  onFinish: Props['onFinishRename'];
}) {
  const t = useT();
  const [value, setValue] = useState(initialName);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const composing = useRef(false);
  const errorId = useId();
  const finish = (name: string | undefined, focus: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onFinish(name, focus);
  };
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);
  return (
    <span className="flex min-w-0 flex-1 items-center pl-1">
      <input
        ref={input}
        aria-label={t('Workspace name')}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? errorId : undefined}
        placeholder={t('Enter a workspace name')}
        title={invalid ? t('Enter a workspace name') : undefined}
        value={value}
        className={cn('workspace-tab-input', invalid && 'workspace-tab-input-invalid')}
        onChange={(event) => {
          setValue(
            composing.current
              ? event.target.value
              : Array.from(event.target.value).slice(0, MAX_TAB_NAME_LENGTH).join(''),
          );
          setInvalid(false);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          setValue(Array.from(event.currentTarget.value).slice(0, MAX_TAB_NAME_LENGTH).join(''));
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            finish(undefined, true);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (value.trim()) finish(value.trim(), true);
            else {
              setValue('');
              setInvalid(true);
            }
          }
        }}
        onBlur={() => finish(value.trim() || undefined, false)}
      />
      {invalid && (
        <span id={errorId} role="alert" className="sr-only">
          {t('Enter a workspace name')}
        </span>
      )}
    </span>
  );
}
