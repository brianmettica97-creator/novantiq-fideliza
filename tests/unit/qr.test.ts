import { describe, expect, test } from 'vitest';
import { buildCardQrPayload, classifyScan, currentStep, formatCardCode, normalizeCardCode, secondsToNextStep } from '../../src/lib/qr';
import { safeNext } from '../../src/lib/nav';

describe('QR de tarjeta', () => {
  test('el payload tiene el formato esperado y cambia cada 30 s', async () => {
    const t0 = Date.UTC(2026, 9, 25, 12, 0, 0);
    const a = await buildCardQrPayload('s', 'f'.repeat(32), t0);
    const b = await buildCardQrPayload('s', 'f'.repeat(32), t0 + 29_000);
    const c = await buildCardQrPayload('s', 'f'.repeat(32), t0 + 31_000);
    expect(a).toMatch(/^NF1\.f{32}\.\d+\.[0-9a-f]{16}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(currentStep(t0)).toBe(Math.floor(t0 / 30000));
    expect(secondsToNextStep(t0)).toBe(30);
  });

  test('distingue QR de tarjeta, de inscripción y códigos', () => {
    expect(classifyScan(`NF1.${'a'.repeat(32)}.123.${'b'.repeat(16)}`).kind).toBe('card');
    expect(classifyScan(`https://fideliza.novantiq.com.ar/unirse/${'c'.repeat(32)}`)).toEqual({ kind: 'join', code: 'c'.repeat(32) });
    expect(classifyScan('ABCD-1234').kind).toBe('unknown');
  });

  test('normaliza y formatea códigos manuales', () => {
    expect(normalizeCardCode('abcd-o1il')).toBe('ABCD0111');
    expect(formatCardCode('ABCD1234')).toBe('ABCD-1234');
  });
});

describe('redirecciones seguras', () => {
  test('solo acepta rutas internas', () => {
    expect(safeNext('/panel')).toBe('/panel');
    expect(safeNext('//evil.com')).toBe('/inicio');
    expect(safeNext('https://evil.com')).toBe('/inicio');
    expect(safeNext(null)).toBe('/inicio');
  });
});
