import { gzipSync } from 'node:zlib';

import { decodeChTransmission, EmediplanParseError, isChTransmissionFormat, parseEmediplan, toImportCandidates } from '../emediplan';

/** Example from the ChTransmissionFormat spec (compression enabled). */
const SPEC_COMPRESSED =
  'CHMED16A1H4sIAAAAAAAEAMVU3W7TMBR+lcq3S4SPHdtx7raVAaKFqutAAnoREreJ2jpT4gKj6ptxx4txnCwVSKQSu0GVqvPX7+fIpwdyuXcFSYiSFCjloGKtNQnI2GGRUZAh1SGwBUASyYTqC8oSSnHgVe4HZM7z1UqF6WcqwkhxjCKdhcJkWc650GIlcXZq8sXDvSEJtHGZpTtjXUOSj4cORyuIpWpRu0EekFnVDYzxmwbtZ+l13dTV7g9t5Ij1eZVicfYWMRab9byxmF1urMH8zpbezO3iNTkGj4RRJIHH7Bwj/J2RhUAHGa+2e/fF1PnPH9bu7XqAnHEhZHzGrqeGJ5EXVVbk9T7bfHr20tTfBwRAxCQHen7f/y7guqi2pnGmLm1j7MbUA/Qx1VLz8/aftvvf7L9Pm2ZQAQgBTEX/QwL+dJa6Et8/SQ7kqr0z0DGEFPxbDsh16R48lqktZjdv8FYwnabfyl2KhRfG5giasIBMTj3nWp4JPrmEjJ93J+fxx5PGTY3X1tbSzuHpGDthCPUu3eKM4O2Kujbr29C3QcSd9ex0udibYyKUWvbLZX3Au54EdupFfSD6QD4CCBEIBcsjjpJZUVnv6yJCxlEsYMRk+59z62pj/MLuLBreoe2vZj2KsfOhvMcyp0yhAzLfbbzj4y8tzloh3gQAAA==';

const PLAN = {
  Auth: '7601003178999',
  Dt: '2026-10-28T09:00:00+01:00',
  Id: 'demo',
  MedType: 1,
  Patient: { FName: 'Demo', LName: 'Patient', BDt: '1968-05-05', Gender: 1 },
  Medicaments: [
    { Id: '7680000000011', IdType: 2, Unit: 'STK', TkgRsn: 'Immunsuppression', Pos: [{ D: [3, 0, 3, 0], DtFrom: '2026-01-01' }] },
    { Id: '1234567', IdType: 3, Unit: 'STK', Pos: [{ D: [1, 0, 0.5, 0], DtFrom: '2026-02-01' }], AppInstr: 'nach dem Essen' },
    { Id: 'Magnesium Sachet', IdType: 1, Unit: 'BTL', Pos: [{ TT: [{ Off: 28800, DoFrom: 1 }, { Off: 64800, DoFrom: 1 }], CyDu: 86400, DtFrom: '2026-03-01' }] },
    { Id: '7680000000097', IdType: 2, Unit: 'STK', Pos: [{ TT: [{ Off: 0, DoFrom: 1 }, { Off: 172800, DoFrom: 1 }, { Off: 345600, DoFrom: 1 }], CyDu: 604800, DtFrom: '2026-01-01' }] },
    { Id: '7680000000103', IdType: 2, Unit: 'STK', Pos: [{ D: [0, 0, 0, 0], InRes: 1, DtFrom: '2026-01-01' }] },
    { Id: '7680000000110', IdType: 2, Unit: 'STK' },
  ],
};

const encode = (json: unknown) => `CHMED16A1${gzipSync(Buffer.from(JSON.stringify(json), 'utf8')).toString('base64')}`;

describe('ChTransmissionFormat', () => {
  it('recognises the wrapper', () => {
    expect(isChTransmissionFormat(SPEC_COMPRESSED)).toBe(true);
    expect(isChTransmissionFormat('CHMED16A0{"x":1}')).toBe(true);
    expect(isChTransmissionFormat('chmed23a.H4sI')).toBe(true);
    expect(isChTransmissionFormat('01076800000000117261231')).toBe(false);
    expect(isChTransmissionFormat('https://example.invalid')).toBe(false);
  });

  it('decodes the compressed example from the specification', () => {
    const { version, json } = decodeChTransmission(SPEC_COMPRESSED);
    expect(version).toBe('16A');
    const doc = JSON.parse(json);
    expect(doc.Patient.FName).toBe('Maxima');
    expect(doc.Medicaments).toHaveLength(6);
    expect(doc.Medicaments[0]).toMatchObject({ Id: '971867', IdType: 3 });
  });

  it('decodes uncompressed and CHMED23 payloads', () => {
    expect(decodeChTransmission('CHMED16A0{"x":1}').json).toBe('{"x":1}');
    const b64 = gzipSync(Buffer.from('{"y":2}')).toString('base64');
    expect(decodeChTransmission(`CHMED23A.${b64}`)).toEqual({ version: '23A', json: '{"y":2}' });
  });

  it('rejects chunked, foreign and corrupt input with a clear error', () => {
    expect(() => decodeChTransmission('CHMED23A.1/2.abc')).toThrow(EmediplanParseError);
    expect(() => decodeChTransmission('hello')).toThrow('Not an eMediplan code.');
    expect(() => decodeChTransmission('CHMED16A1!!!notbase64')).toThrow(EmediplanParseError);
    expect(() => decodeChTransmission('CHMED16A1aGVsbG8=')).toThrow('decompressed');
    expect(() => parseEmediplan('CHMED16A0{not json')).toThrow('not valid JSON');
  });
});

describe('parseEmediplan', () => {
  it('maps the document and medicaments with typed ids', () => {
    const doc = parseEmediplan(encode(PLAN));
    expect(doc.version).toBe('16A');
    expect(doc.medType).toBe(1);
    expect(doc.author).toBe('7601003178999');
    expect(doc.patient).toEqual({ firstName: 'Demo', lastName: 'Patient', birthDate: '1968-05-05' });
    expect(doc.medicaments).toHaveLength(6);
    expect(doc.medicaments[0]).toMatchObject({ id: '7680000000011', idType: 'gtin', unit: 'STK', takingReason: 'Immunsuppression' });
    expect(doc.medicaments[1].idType).toBe('pharmacode');
    expect(doc.medicaments[2].idType).toBe('none');
    expect(doc.medicaments[0].posology[0]).toMatchObject({ daily: [3, 0, 3, 0], from: '2026-01-01', cycleSeconds: 86400, inReserve: false });
    expect(doc.medicaments[2].posology[0]).toMatchObject({ daily: null, perCycle: 2 });
  });

  it('tolerates missing optional fields', () => {
    const doc = parseEmediplan(encode({ Medicaments: [{ Id: 'x', IdType: 1 }] }));
    expect(doc.patient).toEqual({ firstName: null, lastName: null, birthDate: null });
    expect(doc.medicaments[0].posology).toEqual([]);
  });
});

describe('toImportCandidates', () => {
  const candidates = toImportCandidates(parseEmediplan(encode(PLAN)));

  it('turns equal morning/evening doses into units × intakes per day', () => {
    expect(candidates[0]).toMatchObject({
      gtin: '7680000000011',
      pharmacode: null,
      suggestedName: 'Immunsuppression',
      dose: { units_per_intake: 3, intakes_per_period: 2, period: 'day', is_prn: false, valid_from: '2026-01-01' },
      doseSummary: '3 STK × 2 per day',
    });
  });

  it('collapses unequal doses into the daily total so supply maths stays exact', () => {
    expect(candidates[1]).toMatchObject({
      pharmacode: '1234567',
      suggestedName: 'Pharmacode 1234567',
      notes: 'nach dem Essen',
      dose: { units_per_intake: 1.5, intakes_per_period: 1, period: 'day' },
    });
  });

  it('sums taking times per cycle and keeps free-text names', () => {
    expect(candidates[2]).toMatchObject({
      suggestedName: 'Magnesium Sachet',
      gtin: null,
      dose: { units_per_intake: 2, intakes_per_period: 1, period: 'day' },
    });
  });

  it('maps a weekly cycle to the week period', () => {
    expect(candidates[3].dose).toEqual({ units_per_intake: 3, intakes_per_period: 1, period: 'week', is_prn: false, valid_from: '2026-01-01' });
  });

  it('leaves the dose empty for reserve-only or dose-less entries', () => {
    expect(candidates[4].dose).toBeNull();
    expect(candidates[5].dose).toBeNull();
    expect(candidates[5].doseSummary).toBe('No dose in the plan');
    expect(candidates[5].suggestedName).toBe('GTIN 7680000000110');
  });

  it('never carries patient identity into the candidates', () => {
    const text = JSON.stringify(candidates);
    expect(text).not.toMatch(/Demo|Patient|1968/);
  });
});
