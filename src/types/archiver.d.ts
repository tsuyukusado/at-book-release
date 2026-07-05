// archiver は型定義を同梱せず、@types/archiver も導入していないため、本プロジェクトで
// 使う最小 API だけをここで宣言する（EPUB 再梱包用途。mimetype を store で先頭に置く）。
declare module 'archiver' {
    import { Readable } from 'stream';

    interface AppendOptions {
        name: string;
        // true で無圧縮(store)。EPUB の mimetype は先頭・無圧縮でなければならない。
        store?: boolean;
    }

    interface Archiver extends Readable {
        append(source: Buffer | string, options: AppendOptions): this;
        finalize(): Promise<void>;
    }

    interface ArchiverOptions {
        zlib?: { level?: number };
    }

    function archiver(format: 'zip', options?: ArchiverOptions): Archiver;
    export default archiver;
}
