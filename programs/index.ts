import { ProgramDefinition, parseProgramJSON } from '../src/utils/programParser';

// Add new programs here — just import the JSON and add to the array.
import oldman2026 from './oldman2026.json';
import testProgram from './test-program.json';
import testProgram2 from './test-program-2.json';

export const programs: ProgramDefinition[] = [
  parseProgramJSON(JSON.stringify(testProgram)),
  parseProgramJSON(JSON.stringify(testProgram2)),
  parseProgramJSON(JSON.stringify(oldman2026)),
];
