import { parseSpec } from '@/modules/design/spec';
import type { CommunityDesign } from './types';

/** What visitors see of an approved design: no account id. */
export function publicDesign(d: CommunityDesign) {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    credit: d.credit,
    featured: d.featured,
    spec: parseSpec(d.spec),
  };
}
