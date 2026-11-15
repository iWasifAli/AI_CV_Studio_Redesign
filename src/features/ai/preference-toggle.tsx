'use client';

import { useT } from '@/i18n/client';
import { CheckboxField } from '@/features/editor/fields';
import { setAiPreference, useAi } from './client';

/** Per-device on/off switch for AI help. */
export function AiPreferenceToggle() {
  const t = useT();
  const ai = useAi();
  return (
    <div className="border-line bg-surface rounded-md border px-4 py-2">
      <CheckboxField
        label={t('Offer AI writing help on this device')}
        checked={ai.userOn}
        onChange={(on) => setAiPreference(on)}
      />
      {!ai.available && (
        <p className="text-ink-muted pb-2 text-sm">
          {t('AI help is not available on this site right now.')}
        </p>
      )}
    </div>
  );
}
