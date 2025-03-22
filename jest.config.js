/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

// Use process.cwd() instead of import.meta.url
const rootDir = process.cwd();

const config = {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  
  // Modern ts-jest configuration
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: true,
      module: 'NodeNext',  // Explicitly set module
      tsconfig: 'tsconfig.json'  // Point to your tsconfig
    }],
    '^(?!.*\\.dist\\/).*\\.js$': 'babel-jest',
  },
  testMatch: [
    '**/test/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  // This ensures compiled files are used when running tests
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  rootDir: rootDir,
  verbose: true,
  transformIgnorePatterns: [
    '\\.dist/'
  ],  
};

export default config;