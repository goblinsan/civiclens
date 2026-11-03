/** Human-readable labels for each policy tag slug. */
export const TAG_LABELS: Record<string, string> = {
  healthcare:       'Healthcare',
  education:        'Education',
  environment:      'Environment',
  economy:          'Economy',
  defense:          'Defense',
  immigration:      'Immigration',
  housing:          'Housing',
  infrastructure:   'Infrastructure',
  'civil-rights':   'Civil Rights',
  'foreign-policy': 'Foreign Policy',
};

export function tagLabel(slug: string): string {
  return TAG_LABELS[slug] ?? slug.replace(/-/g, ' ');
}
