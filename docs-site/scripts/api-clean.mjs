import {rm} from 'node:fs/promises';
await rm('site/api', {recursive: true, force: true});
