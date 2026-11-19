'use client';

import { useT } from '@/i18n/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { TextArea, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { CheckboxField } from '@/features/editor/fields';
import { METERED, PLAN_IDS, type BusinessConfig, type Metered } from '@/modules/billing/config';
import { LETTER_TYPES } from '@/modules/letters/types';

const AI_WEIGHTS = [
  ['kit', 'Application kit'],
  ['mockTurn', 'Mock interview turn'],
  ['coachTurn', 'Coach chat turn'],
  ['storyDraft', 'Story draft'],
  ['skillGap', 'Skill gap plan'],
  ['linkedinReview', 'LinkedIn review'],
  ['proofread', 'Proofread the whole CV'],
  ['quantify', 'Questions to add numbers to a point'],
  ['gap', 'Wording for a gap in work history'],
  ['translate', 'Translate a CV'],
  ['brief', 'Company brief'],
  ['paths', 'Career paths'],
] as const;
import { AdminHeading } from './admin-shell';
import { adminGet, adminSend } from './api';
import { TASK_IDS, type TaskId } from '@/modules/ai/schemas';

type ConfigResponse = { version: number; value: BusinessConfig };

const METER_LABEL: Record<Metered, string> = {
  'pdf.download': 'PDF downloads',
  'import.cv': 'CV imports',
  'ai.action': 'AI actions',
  'design.ai': 'AI designs (Designer)',
  'ats.check': 'ATS checks (-1 = no limit)',
};

/** Every AI task, in plain words, for the per-task switches. */
const TASK_LABEL: Record<TaskId, string> = {
  'intake.interpret': 'Start: reading what the person wants',
  'design.interpret': 'Start: choosing a design from a description',
  'write.summary': 'Write the profile',
  'write.improveBullets': 'Improve job points',
  'write.fromNotes': 'Job points from notes',
  'write.rewrite': 'AI on selected text',
  'cv.edit': 'Edit the CV by instruction',
  'write.quantify': 'Questions to add numbers',
  'coach.gap': 'Wording for a gap in work history',
  'translate.document': 'Translate a CV',
  'job.brief': 'Company brief',
  'career.paths': 'Career paths',
  'suggest.skills': 'Suggest skills',
  'import.structure': 'Sort an imported CV (AI import)',
  'job.match': 'Job match',
  'job.tailor': 'Tailor a CV to a job',
  'letter.write': 'Cover letter for a job',
  'letter.generic': 'Letter library, statements and bios',
  'quality.atsKeywords': 'ATS check keywords',
  'quality.proofread': 'Proofread the whole CV',
  'linkedin.write': 'LinkedIn profile text',
  'linkedin.review': 'LinkedIn review',
  'interview.prep': 'Interview questions',
  'interview.turn': 'Mock interview',
  'coach.chat': 'Coach chat',
  'story.draft': 'Story bank drafts',
  'skills.gap': 'Skill gap plan',
  'jobs.extract': 'Job from a link',
  'import.transcribe': 'Read scans and photos of CVs',
  'makeover.diagnose': 'Makeover polish check',
  'design.compose': 'AI Designer',
  'design.refine': 'AI Designer refine',
};

export function AdminSettings() {
  const tx = useT();
  const toast = useToast();
  const [base, setBase] = useState<ConfigResponse | null>(null);
  const [draft, setDraft] = useState<BusinessConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    adminGet<ConfigResponse>('/api/admin/config').then(
      (r) => {
        setBase(r);
        setDraft(structuredClone(r.value));
      },
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(load, [load]);

  const dirty = useMemo(
    () => !!base && !!draft && JSON.stringify(base.value) !== JSON.stringify(draft),
    [base, draft],
  );

  const edit = (fn: (c: BusinessConfig) => void) =>
    setDraft((d) => {
      if (!d) return d;
      const next = structuredClone(d);
      fn(next);
      return next;
    });

  const editPass = (i: number, fn: (p: BusinessConfig['passes'][number]) => void) =>
    edit((c) => {
      const p = c.passes[i];
      if (p) fn(p);
    });

  const editCoupon = (i: number, fn: (c: BusinessConfig['coupons'][number]) => void) =>
    edit((c) => {
      const x = c.coupons[i];
      if (x) fn(x);
    });

  const editMethod = (i: number, fn: (m: BusinessConfig['payments']['methods'][number]) => void) =>
    edit((c) => {
      const m = c.payments.methods[i];
      if (m) fn(m);
    });

  const save = async () => {
    if (!base || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const r = await adminSend<{ version: number; changes: string[] }>(
        '/api/admin/config',
        'PUT',
        {
          baseVersion: base.version,
          value: draft,
        },
      );
      toast.show({
        tone: 'success',
        message: `Saved as version ${r.version} (${r.changes.length} change${r.changes.length === 1 ? '' : 's'}).`,
      });
      setBase({ version: r.version, value: structuredClone(draft) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!draft || !base)
    return (
      <>
        <AdminHeading title={tx('Settings')} />
        {error ? (
          <Banner tone="error" title={tx('Could not load settings')}>
            {error}
          </Banner>
        ) : (
          <div className="skeleton h-64 rounded-lg" aria-busy="true" />
        )}
      </>
    );

  const freeEnabled = draft.designs.some((d) => d.enabled && d.tier === 'free');
  const salesProblem =
    draft.features.sales &&
    (!draft.passes.some((p) => p.active) || !draft.payments.methods.some((m) => m.active));

  return (
    <>
      <AdminHeading
        title={tx('Settings')}
        intro="Plans, designs, prices and switches. Changes take effect within a minute of saving and every save is kept in History."
      />
      <div className="flex flex-col gap-6 pb-28">
        <Section
          title={tx('Plans and monthly limits')}
          hint={tx('Use −1 for unlimited and 0 for not included.')}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-ink-muted text-left">
                  <th className="py-2 pr-3 font-semibold">{tx('Plan')}</th>
                  {METERED.map((m) => (
                    <th key={m} className="py-2 pr-3 font-semibold">
                      {METER_LABEL[m]}
                    </th>
                  ))}
                  <th className="py-2 pr-3 font-semibold">{tx('Jobs tracked')}</th>
                  <th className="py-2 pr-3 font-semibold">{tx('Stories kept')}</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_IDS.map((p) => (
                  <tr key={p} className="border-line border-t">
                    <th scope="row" className="py-2 pr-3 text-left font-semibold">
                      {draft.plans[p].label}
                    </th>
                    {METERED.map((m) => (
                      <td key={m} className="py-2 pr-3">
                        <input
                          type="number"
                          min={-1}
                          aria-label={`${draft.plans[p].label}: ${METER_LABEL[m]} per month`}
                          className="border-line-strong bg-surface h-10 w-28 rounded-sm border px-2"
                          value={draft.plans[p].limits[m]}
                          onChange={(e) =>
                            edit((c) => {
                              c.plans[p].limits[m] = Math.max(
                                -1,
                                Math.floor(Number(e.target.value) || 0),
                              );
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={-1}
                        aria-label={tx('{label}: jobs tracked at once', {
                          label: draft.plans[p].label,
                        })}
                        className="border-line-strong bg-surface h-10 w-28 rounded-sm border px-2"
                        value={draft.plans[p].maxJobs}
                        onChange={(e) =>
                          edit((c) => {
                            c.plans[p].maxJobs = Math.max(
                              -1,
                              Math.floor(Number(e.target.value) || 0),
                            );
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={-1}
                        aria-label={tx('{label}: stories kept', { label: draft.plans[p].label })}
                        className="border-line-strong bg-surface h-10 w-28 rounded-sm border px-2"
                        value={draft.plans[p].maxStories}
                        onChange={(e) =>
                          edit((c) => {
                            c.plans[p].maxStories = Math.max(
                              -1,
                              Math.floor(Number(e.target.value) || 0),
                            );
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title={tx('Designs')}
          hint={tx(
            'Free accounts and visitors can still preview Premium designs but download only free ones.',
          )}
        >
          {!freeEnabled && (
            <Banner
              tone="warning"
              title={tx('Keep at least one design free and shown.')}
              className="mb-3"
            />
          )}
          <p className="text-[15px]">
            {tx('Status, tier and tags for each design are set in')}{' '}
            <a href="/admin/designs" className="text-primary font-semibold underline">
              {tx('Designs')}
            </a>
            .
          </p>
        </Section>

        <Section
          title={tx('Premium passes')}
          hint={tx('What people can buy once sales are on. Prices are in PKR.')}
        >
          <ul className="flex flex-col gap-3">
            {draft.passes.map((p, i) => (
              <li key={i} className="flex flex-wrap items-end gap-3">
                <TextField
                  label={tx('Name')}
                  value={p.label}
                  onChange={(e) => editPass(i, (p) => void (p.label = e.target.value))}
                  containerClassName="w-40"
                />
                <TextField
                  label={tx('Days')}
                  type="number"
                  min={1}
                  value={p.days}
                  onChange={(e) =>
                    editPass(i, (p) => void (p.days = Math.floor(Number(e.target.value) || 1)))
                  }
                  containerClassName="w-24"
                />
                <TextField
                  label={tx('Price (PKR)')}
                  type="number"
                  min={0}
                  value={p.pricePkr}
                  onChange={(e) =>
                    editPass(i, (p) => void (p.pricePkr = Math.floor(Number(e.target.value) || 0)))
                  }
                  containerClassName="w-32"
                />
                <CheckboxField
                  label={tx('On sale')}
                  checked={p.active}
                  onChange={(v) => editPass(i, (p) => void (p.active = v))}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={tx('Remove {v0}', { v0: tx(p.label) })}
                  icon={<Trash2 aria-hidden size={16} />}
                  onClick={() => edit((c) => void c.passes.splice(i, 1))}
                />
              </li>
            ))}
          </ul>
          {draft.passes.length < 6 && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              icon={<Plus aria-hidden size={16} />}
              onClick={() =>
                edit(
                  (c) =>
                    void c.passes.push({
                      id: `pass-${Date.now().toString(36)}`,
                      label: 'New pass',
                      days: 30,
                      pricePkr: 0,
                      active: false,
                    }),
                )
              }
            >
              {tx('Add a pass')}
            </Button>
          )}
        </Section>

        <Section
          title={tx('Discount codes')}
          hint={tx(
            'Codes buyers can enter on the Premium page. A code can take a percentage off, add days, or both. Leave “Passes” empty to allow every pass; 0 uses means no limit.',
          )}
        >
          <ul className="flex flex-col gap-4" data-testid="coupons">
            {draft.coupons.map((c, i) => (
              <li key={i} className="border-line flex flex-wrap items-end gap-3 border-b pb-4">
                <TextField
                  label={tx('Code')}
                  value={c.code}
                  maxLength={20}
                  onChange={(e) =>
                    editCoupon(
                      i,
                      (c) =>
                        void (c.code = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')),
                    )
                  }
                  containerClassName="w-36"
                />
                <TextField
                  label={tx('% off')}
                  type="number"
                  min={0}
                  max={90}
                  value={c.percentOff}
                  onChange={(e) =>
                    editCoupon(
                      i,
                      (c) =>
                        void (c.percentOff = Math.min(
                          90,
                          Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        )),
                    )
                  }
                  containerClassName="w-24"
                />
                <TextField
                  label={tx('Extra days')}
                  type="number"
                  min={0}
                  value={c.extraDays}
                  onChange={(e) =>
                    editCoupon(
                      i,
                      (c) =>
                        void (c.extraDays = Math.min(
                          365,
                          Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        )),
                    )
                  }
                  containerClassName="w-24"
                />
                <TextField
                  label={tx('Max uses')}
                  type="number"
                  min={0}
                  value={c.maxUses}
                  onChange={(e) =>
                    editCoupon(
                      i,
                      (c) =>
                        void (c.maxUses = Math.max(0, Math.floor(Number(e.target.value) || 0))),
                    )
                  }
                  containerClassName="w-24"
                />
                <TextField
                  label={tx('Last day')}
                  optional
                  type="date"
                  value={c.expiresOn}
                  onChange={(e) => editCoupon(i, (c) => void (c.expiresOn = e.target.value))}
                  containerClassName="w-44"
                />
                <fieldset className="flex flex-wrap items-center gap-x-3">
                  <legend className="text-sm font-semibold">{tx('Passes')}</legend>
                  {draft.passes.map((p) => (
                    <CheckboxField
                      key={p.id}
                      label={tx(p.label)}
                      checked={c.passIds.includes(p.id)}
                      onChange={(v) =>
                        editCoupon(
                          i,
                          (c) =>
                            void (c.passIds = v
                              ? [...c.passIds, p.id]
                              : c.passIds.filter((x) => x !== p.id)),
                        )
                      }
                    />
                  ))}
                </fieldset>
                <CheckboxField
                  label={tx('Active')}
                  checked={c.active}
                  onChange={(v) => editCoupon(i, (c) => void (c.active = v))}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={tx('Remove code {code}', { code: c.code })}
                  icon={<Trash2 aria-hidden size={16} />}
                  onClick={() => edit((c) => void c.coupons.splice(i, 1))}
                />
              </li>
            ))}
          </ul>
          {draft.coupons.length < 30 && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              icon={<Plus aria-hidden size={16} />}
              onClick={() =>
                edit(
                  (c) =>
                    void c.coupons.push({
                      code: `CODE${c.coupons.length + 1}`,
                      percentOff: 10,
                      extraDays: 0,
                      passIds: [],
                      maxUses: 0,
                      expiresOn: '',
                      active: false,
                    }),
                )
              }
            >
              {tx('Add a code')}
            </Button>
          )}
        </Section>

        <Section
          title={tx('Invite friends')}
          hint={tx(
            'Each account gets an invite link on its Account page (shown while sales are on). When a friend who joined with it has their first pass approved, the inviter gets Premium days and the friend gets extra days on that pass.',
          )}
        >
          <div className="flex flex-wrap items-end gap-4">
            <CheckboxField
              label={tx('Invites are on')}
              checked={draft.referrals.enabled}
              onChange={(v) => edit((c) => void (c.referrals.enabled = v))}
            />
            <TextField
              label={tx('Days for the inviter')}
              type="number"
              min={0}
              value={draft.referrals.rewardDays}
              onChange={(e) =>
                edit(
                  (c) =>
                    void (c.referrals.rewardDays = Math.min(
                      365,
                      Math.max(0, Math.floor(Number(e.target.value) || 0)),
                    )),
                )
              }
              containerClassName="w-40"
            />
            <TextField
              label={tx('Extra days for the friend')}
              type="number"
              min={0}
              value={draft.referrals.welcomeDays}
              onChange={(e) =>
                edit(
                  (c) =>
                    void (c.referrals.welcomeDays = Math.min(
                      365,
                      Math.max(0, Math.floor(Number(e.target.value) || 0)),
                    )),
                )
              }
              containerClassName="w-48"
            />
          </div>
        </Section>

        <Section
          title={tx('How to pay')}
          hint={tx(
            'Shown on the Premium page while sales are open. Put each account detail on its own line; buyers get a copy button for every line.',
          )}
        >
          <ul className="flex flex-col gap-4">
            {draft.payments.methods.map((m, i) => (
              <li key={i} className="border-line flex flex-col gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <TextField
                    label={tx('Method')}
                    value={m.label}
                    placeholder={tx('Bank transfer')}
                    onChange={(e) => editMethod(i, (x) => void (x.label = e.target.value))}
                    containerClassName="w-56"
                  />
                  <CheckboxField
                    label={tx('Shown')}
                    checked={m.active}
                    onChange={(v) => editMethod(i, (x) => void (x.active = v))}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={tx('Remove {v0}', { v0: tx(m.label) })}
                    icon={<Trash2 aria-hidden size={16} />}
                    onClick={() => edit((c) => void c.payments.methods.splice(i, 1))}
                  />
                </div>
                <TextArea
                  label={tx('Account details')}
                  rows={3}
                  value={m.details}
                  placeholder={tx('Account title: …\nIBAN: …')}
                  onChange={(e) => editMethod(i, (x) => void (x.details = e.target.value))}
                />
              </li>
            ))}
          </ul>
          {draft.payments.methods.length < 6 && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              icon={<Plus aria-hidden size={16} />}
              onClick={() =>
                edit(
                  (c) =>
                    void c.payments.methods.push({
                      id: `pay-${Date.now().toString(36)}`,
                      label: 'Bank transfer',
                      details: '',
                      active: true,
                    }),
                )
              }
            >
              {tx('Add a payment method')}
            </Button>
          )}
          <TextArea
            label={tx('Instructions for buyers')}
            rows={3}
            maxLength={600}
            containerClassName="mt-4"
            value={draft.payments.instructions}
            onChange={(e) => edit((c) => void (c.payments.instructions = e.target.value))}
          />
          <TextField
            label={tx('WhatsApp number for payment screenshots')}
            hint={tx(
              'Buyers get a button that opens WhatsApp to this number with their order number and amount already written. Example: +92 300 1234567',
            )}
            type="tel"
            maxLength={20}
            containerClassName="mt-4 max-w-md"
            value={draft.payments.whatsapp}
            onChange={(e) => edit((c) => void (c.payments.whatsapp = e.target.value))}
          />
        </Section>

        <Section title={tx('Switches')}>
          <CheckboxField
            label={tx('Premium sales are open (shows prices and “Get Premium”)')}
            checked={draft.features.sales}
            onChange={(v) => edit((c) => void (c.features.sales = v))}
          />
          {salesProblem && (
            <Banner
              tone="warning"
              className="my-2"
              title={tx(
                'To open sales, keep at least one pass on sale and one payment method shown.',
              )}
            />
          )}
          <CheckboxField
            label={tx('AI help is available')}
            checked={draft.features.ai}
            onChange={(v) => edit((c) => void (c.features.ai = v))}
          />
          <CheckboxField
            label={tx('CV import is available')}
            checked={draft.features.import}
            onChange={(v) => edit((c) => void (c.features.import = v))}
          />
          <CheckboxField
            label={tx('New accounts can sign up')}
            checked={draft.features.signups}
            onChange={(v) => edit((c) => void (c.features.signups = v))}
          />
          <CheckboxField
            label={tx('Maintenance mode (downloads and AI paused)')}
            checked={draft.features.maintenance}
            onChange={(v) => edit((c) => void (c.features.maintenance = v))}
          />
          <CheckboxField
            label={tx('Design Studio (adjust and fine-tune every design detail)')}
            checked={draft.features.designStudio}
            onChange={(v) => edit((c) => void (c.features.designStudio = v))}
          />
          <CheckboxField
            label={tx('AI Designer (describe a design in words or with a picture)')}
            checked={draft.features.designer}
            onChange={(v) => edit((c) => void (c.features.designer = v))}
          />
          <CheckboxField
            label={tx('ATS check (in the editor’s Check tab)')}
            checked={draft.features.atsCheck}
            onChange={(v) => edit((c) => void (c.features.atsCheck = v))}
          />
          <CheckboxField
            label={tx('Letter library (resignation, reference request, thank-you…)')}
            checked={draft.features.letters}
            onChange={(v) => edit((c) => void (c.features.letters = v))}
          />
          <CheckboxField
            label={tx('Application kit on jobs (tailored CV, letter and email together)')}
            checked={draft.features.kit}
            onChange={(v) => edit((c) => void (c.features.kit = v))}
          />
          <CheckboxField
            label={tx('Mock interview on jobs and in Coach')}
            checked={draft.features.mockInterview}
            onChange={(v) => edit((c) => void (c.features.mockInterview = v))}
          />
          <CheckboxField
            label={tx('Workspace tabs (several places open at once in the app)')}
            checked={draft.features.workspaceTabs}
            onChange={(v) => edit((c) => void (c.features.workspaceTabs = v))}
          />
          <CheckboxField
            label={tx('Career coach chat')}
            checked={draft.features.coach}
            onChange={(v) => edit((c) => void (c.features.coach = v))}
          />
          <CheckboxField
            label={tx('Story bank (achievement stories for interviews and letters)')}
            checked={draft.features.stories}
            onChange={(v) => edit((c) => void (c.features.stories = v))}
          />
          <CheckboxField
            label={tx('Skill gap and learning plan')}
            checked={draft.features.skillGap}
            onChange={(v) => edit((c) => void (c.features.skillGap = v))}
          />
          <CheckboxField
            label={tx('Add a job from its link (the server reads the advert page)')}
            checked={draft.features.jobFromUrl}
            onChange={(v) => edit((c) => void (c.features.jobFromUrl = v))}
          />
          <CheckboxField
            label={tx('Reminders on jobs, and the daily reminder email')}
            checked={draft.features.reminders}
            onChange={(v) => edit((c) => void (c.features.reminders = v))}
          />
          <CheckboxField
            label={tx('Comments on share links (each person turns them on for their own link)')}
            checked={draft.features.shareComments}
            onChange={(v) => edit((c) => void (c.features.shareComments = v))}
          />
          <CheckboxField
            label={tx('Contact forms on portfolio pages (each person turns theirs on)')}
            checked={draft.features.portfolioContact}
            onChange={(v) => edit((c) => void (c.features.portfolioContact = v))}
          />
          <CheckboxField
            label={tx("LinkedIn review (from the person's LinkedIn PDF export)")}
            checked={draft.features.linkedinReview}
            onChange={(v) => edit((c) => void (c.features.linkedinReview = v))}
          />
          <CheckboxField
            label={tx('Application results (replies and interviews by CV and design)')}
            checked={draft.features.jobInsights}
            onChange={(v) => edit((c) => void (c.features.jobInsights = v))}
          />
          <CheckboxField
            label={tx('Proofread the whole CV (AI)')}
            checked={draft.features.proofread}
            onChange={(v) => edit((c) => void (c.features.proofread = v))}
          />
          <CheckboxField
            label={tx('Questions that add numbers to CV points (AI)')}
            checked={draft.features.quantify}
            onChange={(v) => edit((c) => void (c.features.quantify = v))}
          />
          <CheckboxField
            label={tx('Application pack (CV, letter and certificates as one PDF or ZIP)')}
            checked={draft.features.pack}
            onChange={(v) => edit((c) => void (c.features.pack = v))}
          />
          <CheckboxField
            label={tx('Explain a gap in work history (AI wording)')}
            checked={draft.features.gapCoach}
            onChange={(v) => edit((c) => void (c.features.gapCoach = v))}
          />
          <CheckboxField
            label={tx(
              'Community designs (shared designs, shown only after you approve them in Design review)',
            )}
            checked={draft.features.community}
            onChange={(v) => edit((c) => void (c.features.community = v))}
          />
          <CheckboxField
            label={tx('Translate a CV into another language (AI)')}
            checked={draft.features.translate}
            onChange={(v) => edit((c) => void (c.features.translate = v))}
          />
          <CheckboxField
            label={tx('Company brief on jobs (AI)')}
            checked={draft.features.companyBrief}
            onChange={(v) => edit((c) => void (c.features.companyBrief = v))}
          />
          <CheckboxField
            label={tx('Career paths (AI)')}
            checked={draft.features.careerPaths}
            onChange={(v) => edit((c) => void (c.features.careerPaths = v))}
          />
        </Section>

        <Section
          title={tx('AI action weights')}
          hint={tx('How many AI actions bigger tasks count as against a plan’s monthly allowance.')}
        >
          {AI_WEIGHTS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm font-semibold">
              <span className="w-56">{label}</span>
              <input
                type="number"
                min={1}
                max={10}
                aria-label={tx('AI actions per {v0}', { v0: label.toLowerCase() })}
                className="border-line-strong bg-surface h-10 w-24 rounded-sm border px-2"
                value={draft.aiWeights[key]}
                onChange={(e) =>
                  edit(
                    (c) =>
                      void (c.aiWeights[key] = Math.min(
                        10,
                        Math.max(1, Math.floor(Number(e.target.value) || 1)),
                      )),
                  )
                }
              />
            </label>
          ))}
        </Section>

        <Section
          title={tx('AI tasks')}
          hint={tx(
            'Untick a task to switch off just that AI help; the tool says AI isn’t available and nothing is counted.',
          )}
        >
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2" data-testid="ai-tasks">
            {TASK_IDS.map((t) => (
              <CheckboxField
                key={t}
                label={TASK_LABEL[t]}
                checked={!draft.ai.offTasks.includes(t)}
                onChange={(v) =>
                  edit((c) => {
                    const off = new Set(c.ai.offTasks);
                    if (v) off.delete(t);
                    else off.add(t);
                    c.ai.offTasks = TASK_IDS.filter((x) => off.has(x));
                  })
                }
              />
            ))}
          </div>
        </Section>

        <Section
          title={tx('AI models')}
          hint={tx(
            "Which model each kind of task uses, by its name at your AI provider (for example gemini-flash-latest). Leave empty to keep the server's setting. Run the AI evaluation after a change.",
          )}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="ai-models">
            {(
              [
                ['fast', 'Fast tasks (writing help, import, extraction)'],
                ['smart', 'Careful tasks (coach, match, letters, reviews)'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex flex-col gap-1 text-sm font-semibold">
                {label}
                <input
                  className="border-line-strong bg-surface min-h-11 rounded-md border px-3 font-mono text-sm font-normal"
                  value={draft.ai.models?.[k] ?? ''}
                  placeholder={tx('Server setting')}
                  spellCheck={false}
                  onChange={(e) =>
                    edit((c) => {
                      c.ai.models = {
                        ...(c.ai.models ?? { fast: '', smart: '' }),
                        [k]: e.target.value.trim().toLowerCase().slice(0, 61),
                      };
                    })
                  }
                />
              </label>
            ))}
          </div>
        </Section>

        <Section
          title={tx('AI cost estimate')}
          hint={tx(
            'Prices per million tokens in US dollars (from your AI provider’s price list) and the rupee rate. Used only for the estimate on the Overview.',
          )}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ['fastIn', 'Fast model, input'],
                ['fastOut', 'Fast model, output'],
                ['smartIn', 'Smart model, input'],
                ['smartOut', 'Smart model, output'],
              ] as const
            ).map(([k, label]) => (
              <TextField
                key={k}
                label={tx('{label} ($ per million)', { label: label })}
                type="number"
                min={0}
                step="0.01"
                value={String(draft.ai.pricing[k])}
                onChange={(e) =>
                  edit(
                    (c) =>
                      void (c.ai.pricing[k] = Math.min(
                        100,
                        Math.max(0, Number(e.target.value) || 0),
                      )),
                  )
                }
              />
            ))}
            <TextField
              label={tx('Rupees per US dollar')}
              type="number"
              min={1}
              value={String(draft.ai.usdToPkr)}
              onChange={(e) =>
                edit(
                  (c) =>
                    void (c.ai.usdToPkr = Math.min(
                      10_000,
                      Math.max(1, Number(e.target.value) || 1),
                    )),
                )
              }
            />
          </div>
        </Section>

        <Section
          title={tx('Payment emails')}
          hint={tx(
            'Order details, dates and links are filled in automatically. {order} in a subject becomes the order number. Leave a field empty for the standard wording.',
          )}
        >
          {(['approved', 'rejected'] as const).map((k) => (
            <div key={k} className="flex flex-col gap-2" data-testid={`email-${k}`}>
              <h3 className="font-semibold">
                {k === 'approved' ? tx('Payment approved') : tx('Payment not confirmed')}
              </h3>
              <TextField
                label={tx('Subject')}
                maxLength={160}
                placeholder={
                  k === 'approved'
                    ? tx('Premium is active — order {order}')
                    : tx('About your order {order}')
                }
                value={draft.emails[k].subject}
                onChange={(e) => edit((c) => void (c.emails[k].subject = e.target.value))}
              />
              <TextArea
                label={tx('Extra note (optional)')}
                rows={2}
                maxLength={600}
                value={draft.emails[k].note}
                onChange={(e) => edit((c) => void (c.emails[k].note = e.target.value))}
              />
              <SampleEmail kind={k} />
            </div>
          ))}
        </Section>

        <Section
          title={tx('Premium page wording')}
          hint={tx(
            'The headline and the line under it on the Premium page. Prices and limits come from the plans above.',
          )}
        >
          <TextField
            label={tx('Headline')}
            maxLength={120}
            value={draft.content.offer.title}
            onChange={(e) => edit((c) => void (c.content.offer.title = e.target.value))}
          />
          <TextArea
            label={tx('Line under the headline')}
            rows={2}
            maxLength={400}
            value={draft.content.offer.intro}
            onChange={(e) => edit((c) => void (c.content.offer.intro = e.target.value))}
          />
        </Section>

        <Section
          title={tx('AI Designer example prompts')}
          hint={tx(
            'One per line, up to 8. Shown under “Describe the CV you imagine” for everyone. Leave empty to use the built-in examples, which change with the kind of work.',
          )}
        >
          <TextArea
            label={tx('Example prompts')}
            rows={4}
            value={(draft.content.designerPrompts ?? []).join('\n')}
            onChange={(e) =>
              edit((c) => {
                c.content.designerPrompts = e.target.value
                  .split('\n')
                  .map((l) => l.slice(0, 120))
                  .slice(0, 8);
              })
            }
            data-testid="designer-prompts"
          />
        </Section>

        <Section
          title={tx('Help page questions')}
          hint={tx('Shown on the Help page in this order. Keep answers short and plain.')}
        >
          <ol className="flex flex-col gap-4" data-testid="faq-editor">
            {draft.content.faq.map((f, i) => (
              <li key={i} className="border-line flex flex-col gap-2 rounded-md border p-3">
                <TextField
                  label={tx('Question {v0}', { v0: i + 1 })}
                  maxLength={200}
                  value={f.q}
                  onChange={(e) => edit((c) => void (c.content.faq[i]!.q = e.target.value))}
                />
                <TextArea
                  label={tx('Answer {v0}', { v0: i + 1 })}
                  rows={3}
                  maxLength={1500}
                  value={f.a}
                  onChange={(e) => edit((c) => void (c.content.faq[i]!.a = e.target.value))}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === 0}
                    aria-label={tx('Move question {v0} up', { v0: i + 1 })}
                    onClick={() =>
                      edit((c) => {
                        const a = c.content.faq;
                        [a[i - 1], a[i]] = [a[i]!, a[i - 1]!];
                      })
                    }
                  >
                    {tx('↑ Up')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === draft.content.faq.length - 1}
                    aria-label={tx('Move question {v0} down', { v0: i + 1 })}
                    onClick={() =>
                      edit((c) => {
                        const a = c.content.faq;
                        [a[i], a[i + 1]] = [a[i + 1]!, a[i]!];
                      })
                    }
                  >
                    {tx('↓ Down')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 aria-hidden size={16} />}
                    aria-label={tx('Remove question {v0}', { v0: i + 1 })}
                    onClick={() => edit((c) => void c.content.faq.splice(i, 1))}
                  >
                    {tx('Remove')}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          {draft.content.faq.length < 30 && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus aria-hidden size={16} />}
              className="self-start"
              onClick={() =>
                edit((c) => void c.content.faq.push({ q: 'New question', a: 'The answer.' }))
              }
            >
              {tx('Add a question')}
            </Button>
          )}
        </Section>

        <Section
          title={tx('Letter types')}
          hint={tx('Untick a type to stop offering it. Letters already written stay.')}
        >
          {LETTER_TYPES.map((t) => (
            <CheckboxField
              key={t.id}
              label={t.title}
              checked={!draft.content.hiddenLetterTypes.includes(t.id)}
              onChange={(v) =>
                edit((c) => {
                  const h = new Set(c.content.hiddenLetterTypes);
                  if (v) h.delete(t.id);
                  else h.add(t.id);
                  c.content.hiddenLetterTypes = [...h];
                })
              }
            />
          ))}
        </Section>

        <Section
          title={tx('Support contact')}
          hint={tx(
            'Shown on the Help, Terms and Premium pages so people can reach you about payments, privacy and problems.',
          )}
        >
          <TextField
            label={tx('Support email')}
            type="email"
            value={draft.support.email}
            onChange={(e) => edit((c) => void (c.support.email = e.target.value.trim()))}
          />
          <TextField
            label={tx('Operator (your full legal name)')}
            hint={tx(
              'Shown on Contact and Terms as who runs AI CV Studio. Use the name on your ID and bank account.',
            )}
            value={draft.support.operator}
            onChange={(e) => edit((c) => void (c.support.operator = e.target.value))}
          />
          <TextField
            label={tx('Phone or WhatsApp (with country code)')}
            value={draft.support.phone}
            onChange={(e) => edit((c) => void (c.support.phone = e.target.value.trim()))}
          />
          <TextField
            label={tx('Office or postal address')}
            hint={tx('Shown on the Contact page. Payment providers ask for a local address.')}
            value={draft.support.address}
            onChange={(e) => edit((c) => void (c.support.address = e.target.value))}
          />
          <TextField
            label={tx('Hours or reply time')}
            value={draft.support.hours}
            onChange={(e) => edit((c) => void (c.support.hours = e.target.value))}
          />
          <EmailCheck />
        </Section>

        <Section
          title={tx('Announcement')}
          hint={tx('A short message shown at the top of every page.')}
        >
          <CheckboxField
            label={tx('Show the announcement')}
            checked={draft.announcement.enabled}
            onChange={(v) => edit((c) => void (c.announcement.enabled = v))}
          />
          <TextField
            label={tx('Message')}
            maxLength={240}
            value={draft.announcement.text}
            onChange={(e) => edit((c) => void (c.announcement.text = e.target.value))}
          />
        </Section>
      </div>

      <div className="border-line bg-surface/95 fixed right-0 bottom-[var(--shell-bottom,0px)] left-[var(--shell-left,0px)] z-20 border-t backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-end gap-3 px-4 py-3 md:px-8">
          {error && (
            <p role="alert" className="text-danger mr-auto text-sm">
              {error}
            </p>
          )}
          <span className="text-ink-muted text-sm" aria-live="polite">
            {dirty
              ? tx('Unsaved changes')
              : tx('Version {version} · saved', { version: base.version })}
          </span>
          <Button
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() => setDraft(structuredClone(base.value))}
          >
            {tx('Discard')}
          </Button>
          <Button
            disabled={!dirty || saving || !freeEnabled || salesProblem}
            loading={saving}
            onClick={save}
          >
            {tx('Save changes')}
          </Button>
        </div>
      </div>
    </>
  );
}

/** Whether buyer emails can be sent, and a test send to the admin's own address. */
function EmailCheck() {
  const tx = useT();
  const toast = useToast();
  const [status, setStatus] = useState<{ configured: boolean; from: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    adminGet<{ configured: boolean; from: string }>('/api/admin/notify')
      .then(setStatus)
      .catch(() => {});
  }, []);
  return (
    <div className="mt-4 flex flex-col gap-2" data-testid="email-check">
      <p className="text-sm">
        {status === null
          ? tx('Checking email…')
          : status.configured
            ? tx('Buyer emails are on{v0}.', {
                v0: status.from ? `, sent from ${status.from}` : '',
              })
            : tx(
                'Buyer emails are off: the mailbox password (SMTP_PASSWORD) is not set on the server yet.',
              )}
      </p>
      <div>
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setProblem(null);
            try {
              const r = await adminSend<{ to: string }>('/api/admin/notify', 'POST', {});
              toast.show({ tone: 'success', message: `Test email sent to ${r.to}` });
            } catch (e) {
              setProblem((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tx('Send a test email to me')}
        </Button>{' '}
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setProblem(null);
            try {
              const r = await adminSend<{ to: string }>('/api/admin/notify', 'POST', {
                kind: 'reminder',
              });
              toast.show({ tone: 'success', message: `Sample reminder email sent to ${r.to}` });
            } catch (e) {
              setProblem((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tx('Send a sample reminder email')}
        </Button>{' '}
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setProblem(null);
            try {
              const r = await adminSend<{ to: string }>('/api/admin/notify', 'POST', {
                kind: 'comment',
              });
              toast.show({ tone: 'success', message: `Sample comment email sent to ${r.to}` });
            } catch (e) {
              setProblem((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tx('Send a sample comment email')}
        </Button>{' '}
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setProblem(null);
            try {
              const r = await adminSend<{ to: string }>('/api/admin/notify', 'POST', {
                kind: 'contact',
              });
              toast.show({ tone: 'success', message: `Sample contact message sent to ${r.to}` });
            } catch (e) {
              setProblem((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tx('Send a sample portfolio message')}
        </Button>
      </div>
      {problem && (
        <p role="alert" className="text-danger text-sm">
          {problem}
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="border-line bg-surface rounded-lg border p-5"
      aria-labelledby={`s-${title}`}
    >
      <h2 id={`s-${title}`} className="text-lg font-semibold">
        {title}
      </h2>
      {hint && <p className="text-ink-muted mt-0.5 mb-3 text-sm">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

/** Sends the saved payment email wording to the admin's own address. */
function SampleEmail({ kind }: { kind: 'approved' | 'rejected' }) {
  const tx = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="secondary"
        className="self-start"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setProblem(null);
          try {
            const r = await adminSend<{ to: string }>('/api/admin/notify', 'POST', { kind });
            toast.show({ tone: 'success', message: `Sample sent to ${r.to}` });
          } catch (e) {
            setProblem((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {tx('Send me a sample (saved wording)')}
      </Button>
      {problem && (
        <p role="alert" className="text-danger text-sm">
          {problem}
        </p>
      )}
    </div>
  );
}
