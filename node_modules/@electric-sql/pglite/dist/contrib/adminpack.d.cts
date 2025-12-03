import { d as PGliteInterface } from '../pglite-Csk75SCB.cjs';

declare const adminpack: {
    name: string;
    setup: (_pg: PGliteInterface, _emscriptenOpts: any) => Promise<{
        bundlePath: URL;
    }>;
};

export { adminpack };
