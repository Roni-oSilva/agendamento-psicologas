import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:5432/agenda_test",
      SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
      APP_URL: "http://localhost:3000",
      WHATSAPP_MODE: "test",
    },
  },
});
