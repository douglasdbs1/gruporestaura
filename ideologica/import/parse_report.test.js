const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractNumbers,
  extractStrings,
  bandeiraFromArquivo,
  lojaFromArquivo,
  parseReport,
} = require('./parse_report');

function numberRecord(row, col, value) {
  const record = Buffer.alloc(18);
  record.writeUInt16LE(0x0203, 0);
  record.writeUInt16LE(0x000e, 2);
  record.writeUInt16LE(row, 4);
  record.writeUInt16LE(col, 6);
  record.writeUInt16LE(0, 8); // XF
  record.writeDoubleLE(value, 10);
  return record;
}

function rkIntegerRecord(row, col, value, divideBy100 = false) {
  const record = Buffer.alloc(14);
  record.writeUInt16LE(0x027e, 0);
  record.writeUInt16LE(0x000a, 2);
  record.writeUInt16LE(row, 4);
  record.writeUInt16LE(col, 6);
  record.writeUInt16LE(0, 8); // XF
  record.writeInt32LE((value << 2) | 0x02 | (divideBy100 ? 0x01 : 0), 10);
  return record;
}

function wide(text) {
  return Buffer.from([...text].flatMap(char => [char.charCodeAt(0), 0]));
}

test('extractNumbers reads NUMBER and integer RK records in file order', () => {
  const input = Buffer.concat([
    Buffer.from([0xaa, 0xbb]),
    numberRecord(4, 9, 1234.56),
    rkIntegerRecord(5, 10, 42),
  ]);

  assert.deepEqual(extractNumbers(input), [
    [4, 9, 1234.56],
    [5, 10, 42],
  ]);
});

test('extractNumbers applies the RK divide-by-100 flag', () => {
  assert.deepEqual(extractNumbers(rkIntegerRecord(2, 3, 12345, true)), [
    [2, 3, 123.45],
  ]);
});

test('extractStrings recognizes wide and compact BIFF text and removes duplicates', () => {
  const input = Buffer.concat([
    wide('Loja: RJ Centro'),
    Buffer.from([0x01, 0x02, 0x03]),
    Buffer.from('Costura', 'latin1'),
    Buffer.from([0x01]),
    Buffer.from('Costura', 'latin1'),
  ]);

  const strings = extractStrings(input);
  assert.ok(strings.includes('Loja: RJ Centro'));
  assert.equal(strings.filter(value => value === 'Costura').length, 1);
});

test('bandeiraFromArquivo follows the controlled filename prefix', () => {
  assert.equal(bandeiraFromArquivo('G:\\Drive\\MEGA Centro 30.xls'), 'mega');
  assert.equal(bandeiraFromArquivo('/drive/RJ Campinas 15.xls'), 'rj');
  assert.equal(bandeiraFromArquivo('ML Taubate 30.xls'), 'ml');
  assert.equal(bandeiraFromArquivo('Loja sem prefixo.xls'), null);
});

test('lojaFromArquivo removes extension, separators, b64 marker and cut day', () => {
  assert.equal(lojaFromArquivo('G:\\Drive\\RJ_POA_CRISTAL_14.xls'), 'RJ POA CRISTAL');
  assert.equal(lojaFromArquivo('/tmp/ML Taubate 30 b64.xls'), 'ML Taubate');
  assert.equal(lojaFromArquivo('MEGA-Centro-de-Curitiba-15.xls'), 'Mega Centro de Curitiba');
});

// Reproduz o bug real de "Mega Campinas JD Aurélia 23.xls": o faturamento de
// uma categoria no MEIO do bloco de Serviço veio corrompido (float
// denormalizado quase-zero), o que fazia a soma nunca bater com a linha de
// total e o bloco inteiro (Serviço, com todas as categorias) ser descartado
// silenciosamente, gravando o relatório inteiro com R$0.
test('parseReport recupera uma categoria com faturamento corrompido usando a diferença com o total do bloco', () => {
  const sep = Buffer.from([0x00, 0x00]); // quebra o run de bytes 2-a-2 entre uma wide string e a proxima
  const strings = Buffer.concat([
    wide('Loja: TESTE'), sep,
    wide('Período de 01/06/2026 até 30/06/2026'), sep,
    wide('Méd. Tck.'), sep,
    wide('CAT_A'), sep,
    wide('CAT_B'), sep,
    wide('Total por Grupo de Serviço:'), sep,
  ]);
  const numbers = Buffer.concat([
    numberRecord(1, 1, 1000), numberRecord(1, 2, 50), numberRecord(1, 3, 10),
    numberRecord(1, 4, 50), numberRecord(1, 5, 100), numberRecord(1, 6, 5), numberRecord(1, 7, 200),
    // CAT_B: faturamento (col 1) corrompido — o valor real é 500
    numberRecord(2, 1, 1e-260), numberRecord(2, 2, 25), numberRecord(2, 3, 5),
    numberRecord(2, 4, 25), numberRecord(2, 5, 100), numberRecord(2, 6, 2), numberRecord(2, 7, 250),
    // total do bloco: 1000 (CAT_A) + 500 (CAT_B real) = 1500
    numberRecord(3, 1, 1500), numberRecord(3, 2, 15), numberRecord(3, 3, 7),
  ]);
  const { relatorio, itens, warnings } = parseReport(Buffer.concat([strings, numbers]), 'Consultor Teste', 'Loja Teste 30.xls');

  const catB = itens.find(item => item.categoria === 'CAT_B');
  assert.ok(catB, 'CAT_B deveria aparecer como item, não ser descartada junto com o bloco');
  assert.equal(catB.faturamento, 500);
  assert.equal(relatorio.total_faturado, 1500);
  assert.ok(warnings.some(w => /corrompido/i.test(w)));
});
