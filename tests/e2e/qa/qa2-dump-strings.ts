import { writeFileSync } from 'node:fs';
import { STRINGS } from '../../../src/ui/i18n';
import { UPGRADE_TEXT } from '../../../src/game/content';
writeFileSync('/tmp/qa2/strings.json', JSON.stringify({ STRINGS, UPGRADE_TEXT }, null, 1));
