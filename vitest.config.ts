import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/**/*.d.ts',
                // CLI エントリポイント。引数解釈と console 出力の結線だけで、
                // ロジックは usecase 層に置く方針（そちらをテストで覆う）。
                'src/cli/index.ts',
            ],
            reporter: ['text', 'html'],
        },
    },
});
