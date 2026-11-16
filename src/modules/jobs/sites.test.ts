import { describe, expect, it } from 'vitest';
import { routeJobLink } from './sites';

describe('job links from the big job sites', () => {
  it('a LinkedIn search page with a job open becomes that job’s public page', () => {
    const r = routeJobLink(
      'https://www.linkedin.com/jobs/search-results/?currentJobId=4472572355&keywords=Senior%20Software%20Developer&geoId=101282230',
    );
    expect(r).toEqual({ kind: 'read', url: 'https://www.linkedin.com/jobs/view/4472572355/' });
    expect(
      routeJobLink('https://www.linkedin.com/jobs/view/senior-dev-at-acme-4489352655/?trk=x'),
    ).toEqual({ kind: 'read', url: 'https://www.linkedin.com/jobs/view/4489352655/' });
  });

  it('a LinkedIn list without a job says so and points to pasting', () => {
    const r = routeJobLink('https://www.linkedin.com/jobs/search/?keywords=developer');
    expect(r).toMatchObject({ kind: 'refuse', reason: 'list' });
    if (r.kind === 'refuse') expect(r.message).toMatch(/Fill in from the advert text/);
  });

  it('Glassdoor: a search page is a list; job pages can’t be read; both point to pasting', () => {
    expect(
      routeJobLink('https://www.glassdoor.com/Job/islamabad-jobs-SRCH_IL.0,9_IC3139539.htm'),
    ).toMatchObject({ kind: 'refuse', reason: 'list' });
    expect(
      routeJobLink(
        'https://www.glassdoor.com/job-listing/senior-developer-acme-JV_IC1.htm?jl=1009',
      ),
    ).toMatchObject({ kind: 'refuse', reason: 'closed' });
  });

  it('Indeed: the open job of a search becomes its job page; other sites are left alone', () => {
    expect(routeJobLink('https://pk.indeed.com/jobs?q=developer&vjk=0123abcd4567ef89')).toEqual({
      kind: 'read',
      url: 'https://pk.indeed.com/viewjob?jk=0123abcd4567ef89',
    });
    expect(routeJobLink('https://careers.example.com/jobs/123')).toEqual({
      kind: 'read',
      url: 'https://careers.example.com/jobs/123',
    });
  });
});
