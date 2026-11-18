'use client';

import { useT } from '@/i18n/client';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import type { ConflictDetails } from './api';

/** Keep the rejected draft and server suggestion inspectable until an explicit choice. */
export function ConflictNotice({
  details,
  onKeepDraft,
  onApply,
}: {
  details: ConflictDetails | null | undefined;
  onKeepDraft?: () => void;
  onApply?: () => void;
}) {
  const t = useT();
  if (!details) return null;
  return (
    <Banner tone="warning" title={t('This item changed while you were working')}>
      <p>
        {t(
          'Your draft is kept. Review the current version and any generated suggestion before saving again.',
        )}
      </p>
      {details.current !== undefined && (
        <details>
          <summary>{t('Current saved version')}</summary>
          <pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap">
            {JSON.stringify(details.current, null, 2)}
          </pre>
        </details>
      )}
      {details.generated !== undefined && (
        <details>
          <summary>{t('Generated suggestion')}</summary>
          <pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap">
            {JSON.stringify(details.generated, null, 2)}
          </pre>
        </details>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {onKeepDraft && (
          <Button size="sm" variant="secondary" onClick={onKeepDraft}>
            {t('Keep my draft against this version')}
          </Button>
        )}
        {onApply && details.generated !== undefined && (
          <Button size="sm" variant="secondary" onClick={onApply}>
            {t('Use suggestion in my draft')}
          </Button>
        )}
      </div>
    </Banner>
  );
}
