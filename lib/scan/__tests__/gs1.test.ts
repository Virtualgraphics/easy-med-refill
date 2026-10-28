import { expiryFromYYMMDD, gtinCheckDigitValid, looksLikeGs1, normaliseGtin, parseGs1 } from '../gs1';

const GS = '\u001d';
// GTIN-13 7680123456781 has a valid check digit (1); as GTIN-14 it is 07680123456781.
const GTIN14 = '07680123456781';

describe('GS1 DataMatrix', () => {
  it('parses GTIN, expiry, batch and serial in the usual order', () => {
    const pack = parseGs1(`01${GTIN14}17271231` + `10ABC123${GS}21SER001`);
    expect(pack.gtin).toBe('7680123456781');
    expect(pack.expiry).toBe('2027-12-31');
    expect(pack.batch).toBe('ABC123');
    expect(pack.serial).toBe('SER001');
  });

  it('handles the symbology identifier, batch before expiry, and a trailing variable AI', () => {
    const pack = parseGs1(`]d201${GTIN14}10LOT-7${GS}172806302199`);
    expect(pack.gtin).toBe('7680123456781');
    expect(pack.batch).toBe('LOT-7');
    expect(pack.expiry).toBe('2028-06-30');
    expect(pack.serial).toBe('99');
  });

  it('treats day 00 as the last day of the month', () => {
    expect(expiryFromYYMMDD('270200')).toBe('2027-02-28');
    expect(expiryFromYYMMDD('280200')).toBe('2028-02-29');
    expect(expiryFromYYMMDD('271300')).toBeNull();
    expect(expiryFromYYMMDD('27')).toBeNull();
  });

  it('rejects a GTIN with a bad check digit', () => {
    expect(gtinCheckDigitValid('7680123456781')).toBe(true);
    expect(gtinCheckDigitValid('7680123456780')).toBe(false);
    expect(normaliseGtin('07680123456780')).toBeNull();
    expect(parseGs1('0107680123456780' + '17271231').gtin).toBeNull();
  });

  it('keeps a 14-digit GTIN that does not start with zero', () => {
    expect(normaliseGtin('17680123456788')).toBe('17680123456788');
  });

  it('stops at an unknown AI instead of guessing', () => {
    const pack = parseGs1(`01${GTIN14}` + `8899whatever`);
    expect(pack.gtin).toBe('7680123456781');
    expect(pack.ais.unparsed).toBe('8899whatever');
  });

  it('recognises GS1 payloads and ignores other codes', () => {
    expect(looksLikeGs1(`01${GTIN14}17271231`)).toBe(true);
    expect(looksLikeGs1(`]d201${GTIN14}`)).toBe(true);
    expect(looksLikeGs1('CHMED16A1H4sI')).toBe(false);
    expect(looksLikeGs1('https://example.invalid')).toBe(false);
  });
});
