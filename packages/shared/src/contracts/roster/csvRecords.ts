/** RFC 4180 records; line numbers refer to the source spreadsheet, including its header. */
export interface CsvRecord {
  line: number;
  cells: string[];
}

interface CsvState {
  records: CsvRecord[];
  cells: string[];
  cell: string;
  quoted: boolean;
  line: number;
  recordLine: number;
}

function finishCell(state: CsvState): void {
  state.cells.push(state.cell);
  state.cell = '';
}

function finishRecord(state: CsvState): void {
  finishCell(state);
  if (state.cells.some((cell) => cell.trim())) {
    state.records.push({ line: state.recordLine, cells: state.cells });
  }
  state.cells = [];
  state.recordLine = state.line;
}

function readCharacter(state: CsvState, character: string, delimiter: string): void {
  if (character === '"') state.quoted = !state.quoted;
  else if (state.quoted) state.cell += character;
  else if (character === delimiter) finishCell(state);
  else if (character === '\n') finishRecord(state);
  else if (character !== '\r') state.cell += character;
}

export function csvRecords(input: string): CsvRecord[] {
  const text = input.replace(/^\uFEFF/, '');
  const header = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', '\t', ';'].reduce((best, next) =>
    header.split(next).length > header.split(best).length ? next : best,
  );
  const state: CsvState = {
    records: [],
    cells: [],
    cell: '',
    quoted: false,
    line: 1,
    recordLine: 1,
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '\n') state.line += 1;
    if (state.quoted && character === '"' && text[index + 1] === '"') {
      state.cell += '"';
      index += 1;
    } else readCharacter(state, character, delimiter);
  }
  if (state.quoted) throw new Error(`Line ${state.recordLine}: close the quoted field.`);
  if (state.cell || state.cells.length) finishRecord(state);
  return state.records;
}
