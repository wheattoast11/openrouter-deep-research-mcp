import { d as PGliteInterface } from '../pglite-Csk75SCB.cjs';

declare const tablefunc: {
    name: string;
    setup: (_pg: PGliteInterface, _emscriptenOpts: any) => Promise<{
        bundlePath: URL;
    }>;
};

export { tablefunc };
