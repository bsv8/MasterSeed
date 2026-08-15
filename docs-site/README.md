# MasterSeed documentation

Unified VitePress documentation for the `masterseed` TypeScript package and the root Go module. Every dev/build generates TypeDoc from `../typescript/src/index.ts` and gomarkdoc v1.1.0 from `github.com/bsv8/MasterSeed`; generated API output is ignored.

```sh
npm ci
npm run build
DOCS_BASE=masterseed npm run build
```

`DOCS_BASE` configures subpath deployment. The package is installed with `npm install masterseed`.
