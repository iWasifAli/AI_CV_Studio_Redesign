/**
 * Community designs (spec §15 "Design review", R10): people share a design they made; the owner
 * reviews each one in the Console and only approved designs are shown to others. Off by default.
 */
export const COMMUNITY_STATUS = ['pending', 'approved', 'rejected', 'removed'] as const;
export type CommunityStatus = (typeof COMMUNITY_STATUS)[number];

export type CommunityDesign = {
  id: string;
  uid: string;
  /** Shown as the designer's credit, or null to stay anonymous. */
  credit: string | null;
  name: string;
  description: string;
  /** A Design Spec v2 (validated and normalised when submitted). */
  spec: unknown;
  status: CommunityStatus;
  /** The automated checks at submission (shown to the reviewer). */
  checks: { notes: string[] };
  featured: boolean;
  reason?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

/** Designs one account may have waiting for review at a time. */
export const MAX_PENDING = 3;
