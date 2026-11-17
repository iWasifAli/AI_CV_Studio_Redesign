import { getT } from '@/i18n/server';
import { Check, Download, Palette, PencilLine } from 'lucide-react';
import { LogoMark } from '@/components/layout/logo';

/** Real design thumbnails (public/templates), all showing the same sample CV. */
const GRID = ['atelier', 'violet', 'heritage', 'terra'] as const;
const SWATCHES = ['#172a3d', '#5b45a0', '#dc786e', '#c69a61', '#2f7a6b'];

const thumb = (id: string) => `/templates/${id}.webp`;

/**
 * The hero's centrepiece: a picture of the studio — design list, the CV, the Design controls.
 * It is a still illustration built from real design thumbnails and the real control names; it is
 * not interactive, and says so to assistive technology.
 */
export async function StudioPreview() {
  const t = await getT();
  return (
    <figure
      className="landing-rise relative mx-auto w-full max-w-[640px] lg:max-w-none"
      style={{ '--d': '120ms' } as React.CSSProperties}
    >
      <figcaption className="sr-only">
        {t(
          'A picture of the studio: a list of designs, your CV in the chosen design, and the Design controls.',
        )}
      </figcaption>
      <div
        aria-hidden
        className="border-line bg-surface shadow-page overflow-hidden rounded-2xl border"
      >
        <div className="border-line flex items-center gap-3 border-b px-4 py-3">
          <LogoMark size={22} />
          <span className="bg-sunken text-ink-muted inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            <PencilLine size={13} /> {t('Content')}
          </span>
          <span className="bg-primary-soft text-violet inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            <Palette size={13} /> {t('Design')}
          </span>
          <span className="bg-primary text-on-primary ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold">
            <Download size={13} /> {t('Download')}
          </span>
        </div>
        <div className="grid grid-cols-[88px_1fr] sm:grid-cols-[104px_1fr_150px]">
          <div className="border-line bg-paper/60 flex flex-col gap-2 border-r p-2.5">
            <p className="text-ink-subtle px-0.5 text-[10px] font-bold tracking-wider uppercase">
              {t('Designs')}
            </p>
            {GRID.map((id, i) => (
              <div
                key={id}
                className={
                  i === 0
                    ? 'ring-violet overflow-hidden rounded-md ring-2'
                    : 'border-line overflow-hidden rounded-md border'
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static webp */}
                <img
                  src={thumb(id)}
                  alt=""
                  width={595}
                  height={842}
                  loading={i < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="block aspect-[595/842] w-full object-cover object-top"
                />
              </div>
            ))}
          </div>
          <div className="bg-sunken flex items-start justify-center p-4 sm:p-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static webp */}
            <img
              src={thumb('atelier')}
              alt=""
              width={595}
              height={842}
              fetchPriority="high"
              decoding="async"
              className="shadow-page aspect-[595/842] w-full max-w-[300px] rounded-sm object-cover object-top"
            />
          </div>
          <div className="border-line hidden flex-col gap-4 border-l p-3.5 sm:flex">
            <p className="text-sm font-bold">{t('Design')}</p>
            <div>
              <p className="text-ink-subtle text-[11px] font-semibold">{t('Colours')}</p>
              <div className="mt-2 flex gap-1.5">
                {SWATCHES.map((c, i) => (
                  <span
                    key={c}
                    className="relative inline-flex size-5 items-center justify-center rounded-full"
                    style={{ background: c }}
                  >
                    {i === 0 && <Check size={11} strokeWidth={3} className="text-white" />}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-ink-subtle text-[11px] font-semibold">{t('Columns')}</p>
              <div className="mt-2 flex flex-col gap-1.5 text-[11px] font-semibold">
                <span className="bg-primary-soft text-violet rounded-full px-2.5 py-1">
                  {t('Side column left')}
                </span>
                <span className="border-line text-ink-muted rounded-full border px-2.5 py-1">
                  {t('One column')}
                </span>
                <span className="border-line text-ink-muted rounded-full border px-2.5 py-1">
                  {t('Timeline')}
                </span>
              </div>
            </div>
            <div>
              <p className="text-ink-subtle text-[11px] font-semibold">{t('Spacing and lines')}</p>
              <div className="mt-2 space-y-1.5">
                <div className="bg-line h-1.5 rounded-full" />
                <div className="bg-line h-1.5 w-2/3 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        aria-hidden
        className="shadow-page absolute -right-3 -bottom-8 hidden w-[132px] rotate-[5deg] overflow-hidden rounded-md border border-white bg-white lg:block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static webp */}
        <img
          src={thumb('violet')}
          alt=""
          width={595}
          height={842}
          loading="lazy"
          decoding="async"
          className="block aspect-[595/842] w-full object-cover object-top"
        />
      </div>
    </figure>
  );
}
