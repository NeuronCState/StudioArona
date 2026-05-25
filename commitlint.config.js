module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', [
      'web',
      'agent',
      'perception',
      'gateway',
      'skills',
      'contracts',
      'infra',
      'docs',
      'deps',
    ]],
    'type-enum': [2, 'always', [
      'feat',
      'fix',
      'refactor',
      'test',
      'docs',
      'chore',
      'perf',
      'revert',
      'style',
    ]],
    'subject-case': [0],
  },
};
