/**
 * Playwright (MVP 7): เทสต์ layout ทุก viewport + ถ่ายภาพหน้าจอ
 * ใช้ Google Chrome ที่ติดตั้งในเครื่อง (channel: 'chrome') ไม่ต้องดาวน์โหลด browser แยก
 * WebGL ใน headless เป็น software GL — ช้า จึงรันทีละไม่กี่ worker
 */
import { defineConfig } from '@playwright/test';

const PORT = 5199;
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    channel: 'chrome',
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
