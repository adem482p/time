// domain-model/index.js — Barrel. The library is the four modules below;
// this file only re-exports so `import … from 'domain-model/index.js'` works.

export * from './objects.js';
export * from './catalog.js';
export * from './query.js';
export * from './csv.js';
export * from './print.js';
export { catalogue } from './catalogue.js';
