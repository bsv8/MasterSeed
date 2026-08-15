import {isSdkName, resolveSdkPreference} from '../src/lib/sdkPreference.mjs';

const cases = [
  ['go', 'typescript', 'go'],
  ['typescript', 'go', 'typescript'],
  ['invalid', 'go', 'go'],
  ['invalid', 'invalid', 'typescript'],
  [null, 'go', 'go'],
  [null, null, 'typescript'],
];

for (const [query, stored, expected] of cases) {
  const actual = resolveSdkPreference(query, stored);
  if (actual !== expected) {
    throw new Error(`SDK preference resolution regression: ${query}/${stored} -> ${actual}, expected ${expected}`);
  }
}

if (!isSdkName('typescript') || !isSdkName('go') || isSdkName('rust')) {
  throw new Error('SDK name validation regression');
}

console.log(`SDK state check passed: ${cases.length} preference cases, query precedence, and storage fallback.`);
