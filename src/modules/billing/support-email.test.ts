import { describe, expect, it } from 'vitest';
import { businessConfig, DEFAULT_CONFIG, SUPPORT_EMAIL } from './config';

describe('support email', () => {
  const read = (email: string) =>
    businessConfig.parse({ ...DEFAULT_CONFIG, support: { email } }).support.email;
  it('defaults to the domain mailbox', () =>
    expect(DEFAULT_CONFIG.support.email).toBe(SUPPORT_EMAIL));
  it('reads an empty setting as the domain mailbox', () => expect(read('')).toBe(SUPPORT_EMAIL));
  it('reads the early Gmail inbox as the domain mailbox', () =>
    expect(read('aicvstudio.app@gmail.com')).toBe(SUPPORT_EMAIL));
  it('keeps any other address the owner sets', () =>
    expect(read('help@aicvstudio.app')).toBe('help@aicvstudio.app'));
});
