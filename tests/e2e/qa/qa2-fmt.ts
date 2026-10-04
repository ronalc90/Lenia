import { fmtShort, fmt } from '../../../src/ui/format';
for (const n of [999, 1450, 3.41e3, 3.41e6, 3.41e9, 3.41e12, 3.41e15, 3.41e18, 3.41e21, 1.05e18, 3.33e15]) console.log(n, '|', fmtShort(n, 'es'), '|', fmtShort(n, 'en'));
