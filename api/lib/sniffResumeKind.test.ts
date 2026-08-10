import { describe, expect, test } from 'bun:test';
import { sniffResumeKind } from '../apply-career.js';

describe('sniffResumeKind', () => {
  test('detects PDF', () => {
    expect(sniffResumeKind(Buffer.from('%PDF-1.4\n%âãÏÓ'))).toBe('pdf');
  });

  test('detects OLE doc', () => {
    const buf = Buffer.alloc(16);
    buf[0] = 0xd0;
    buf[1] = 0xcf;
    buf[2] = 0x11;
    buf[3] = 0xe0;
    expect(sniffResumeKind(buf)).toBe('doc');
  });

  test('detects ZIP/docx', () => {
    expect(sniffResumeKind(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toBe('docx');
  });

  test('detects RTF', () => {
    expect(sniffResumeKind(Buffer.from('{\\rtf1\\ansi hello'))).toBe('rtf');
  });

  test('detects plain text', () => {
    expect(sniffResumeKind(Buffer.from('Jane Doe\nExperience: sake marketing'))).toBe('txt');
  });

  test('rejects HTML labeled as resume', () => {
    expect(sniffResumeKind(Buffer.from('<!DOCTYPE html><script>alert(1)</script>'))).toBeNull();
  });

  test('rejects binary with NULs', () => {
    expect(sniffResumeKind(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]))).toBeNull();
  });
});
