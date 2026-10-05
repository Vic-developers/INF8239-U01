module.exports = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',
  overrides: [
    {
      files: ['*.md', '*.json', '*.yml', '*.yaml'],
      options: { printWidth: 80, singleQuote: false },
    },
  ],
};