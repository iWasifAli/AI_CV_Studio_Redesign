/**
 * Job links from the big job sites, before anything is fetched. People often copy the address
 * of a search page with one job open (LinkedIn "currentJobId", Indeed "vjk") rather than the job's
 * own page; we turn those into the job's public page. Search and list pages, and sites that don't
 * let other sites read their adverts, get a plain message pointing to the paste-the-text route.
 */
export type JobLink =
  | { kind: 'read'; url: string }
  | { kind: 'refuse'; reason: 'list' | 'closed'; message: string };

const PASTE =
  'Open the job, copy the advert text and paste it into “The job advert” below — then use “Fill in from the advert text”.';

export function routeJobLink(raw: string): JobLink {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { kind: 'read', url: raw };
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const site = (name: string) => host === name || host.endsWith(`.${name}`);

  if (site('linkedin.com')) {
    const id =
      u.searchParams.get('currentJobId') ??
      /\/jobs\/view\/(?:[^/]*-)?(\d{6,})/.exec(u.pathname)?.[1] ??
      null;
    if (id && /^\d{6,}$/.test(id))
      return { kind: 'read', url: `https://www.linkedin.com/jobs/view/${id}/` };
    return {
      kind: 'refuse',
      reason: 'list',
      message: `That LinkedIn link is a list of jobs, not one job. Click the job, then copy the link from its “Share” button — or: ${PASTE}`,
    };
  }
  if (site('glassdoor.com') || /(^|\.)glassdoor\.[a-z.]+$/.test(host)) {
    const list = /SRCH_|\/Job\/[^/]*-jobs-/i.test(u.pathname) && !u.searchParams.get('jl');
    return {
      kind: 'refuse',
      reason: list ? 'list' : 'closed',
      message: list
        ? `That Glassdoor link is a list of jobs, not one job. Glassdoor also doesn’t let other sites read its adverts. ${PASTE}`
        : `Glassdoor doesn’t let other sites read its adverts. ${PASTE}`,
    };
  }
  if (site('indeed.com') || /(^|\.)indeed\.[a-z.]+$/.test(host)) {
    const jk = u.searchParams.get('vjk') ?? u.searchParams.get('jk');
    if (jk && /^[0-9a-f]{8,}$/i.test(jk))
      return { kind: 'read', url: `https://${u.hostname}/viewjob?jk=${jk}` };
    if (/\/jobs\b|\/q-/.test(u.pathname))
      return {
        kind: 'refuse',
        reason: 'list',
        message: `That Indeed link is a list of jobs, not one job. Click the job and copy its link — or: ${PASTE}`,
      };
  }
  return { kind: 'read', url: u.toString() };
}

export const PASTE_HINT = PASTE;
