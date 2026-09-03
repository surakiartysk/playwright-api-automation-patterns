/**
 * Conventional Commits, with the scopes this repo actually uses.
 *
 * `scope-enum` is deliberately closed: an open list drifts into a dozen
 * near-synonyms within a month. Adding a scope should be a decision, so it is
 * an edit here.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        // packages
        'contract',
        'mock',
        'functional-style',
        'class-style',
        // services — mirrors src/services/<svc>/
        'items',
        'reservations',
        'maintenance-logs',
        'auth',
        // cross-cutting
        'core',
        'ci',
        'deps',
      ],
    ],
    // The body carries the reasoning in this repo, so it gets room.
    'body-max-line-length': [2, 'always', 100],
  },
}
