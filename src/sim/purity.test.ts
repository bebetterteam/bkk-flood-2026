import { describe, expect, it } from 'vitest';

const files = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('src/sim ต้องไม่พึ่ง three.js หรือ DOM', () => {
  it('พบไฟล์ให้ตรวจ', () => expect(Object.keys(files).length).toBeGreaterThan(3));
  for (const [f, code] of Object.entries(files)) {
    it(f, () => {
      expect(code).not.toMatch(/from ['"]three/);
      expect(code).not.toMatch(/from ['"]\.\.\/(scene|ui)\//);
      expect(code).not.toMatch(/\b(document|window)\./);
    });
  }
});
