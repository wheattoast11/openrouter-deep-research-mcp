import { l as Extensions, q as PGliteOptions, x as BasePGlite, d as PGliteInterface, r as PGliteInterfaceExtensions, D as DebugLevel, n as ExecProtocolResult, b as PGlite } from '../pglite-Csk75SCB.js';

type PGliteWorkerOptions<E extends Extensions = Extensions> = PGliteOptions<E> & {
    meta?: any;
    id?: string;
};
declare class PGliteWorker extends BasePGlite implements PGliteInterface, AsyncDisposable {
    #private;
    constructor(worker: Worker, options?: PGliteWorkerOptions);
    /**
     * Create a new PGlite instance with extensions on the Typescript interface
     * This also awaits the instance to be ready before resolving
     * (The main constructor does enable extensions, however due to the limitations
     * of Typescript, the extensions are not available on the instance interface)
     * @param worker The worker to use
     * @param options Optional options
     * @returns A promise that resolves to the PGlite instance when it's ready.
     */
    static create<O extends PGliteWorkerOptions>(worker: Worker, options?: O): Promise<PGliteWorker & PGliteInterfaceExtensions<O['extensions']>>;
    get waitReady(): Promise<void>;
    get debug(): DebugLevel;
    /**
     * The ready state of the database
     */
    get ready(): boolean;
    /**
     * The closed state of the database
     */
    get closed(): boolean;
    /**
     * The leader state of this tab
     */
    get isLeader(): boolean;
    /**
     * Close the database
     * @returns Promise that resolves when the connection to shared PGlite is closed
     */
    close(): Promise<void>;
    /**
     * Close the database when the object exits scope
     * Stage 3 ECMAScript Explicit Resource Management
     * https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management
     */
    [Symbol.asyncDispose](): Promise<void>;
    /**
     * Execute a postgres wire protocol message directly without wrapping the response.
     * Only use if `execProtocol()` doesn't suite your needs.
     *
     * **Warning:** This bypasses PGlite's protocol wrappers that manage error/notice messages,
     * transactions, and notification listeners. Only use if you need to bypass these wrappers and
     * don't intend to use the above features.
     *
     * @param message The postgres wire protocol message to execute
     * @returns The direct message data response produced by Postgres
     */
    execProtocolRaw(message: Uint8Array): Promise<Uint8Array>;
    /**
     * Execute a postgres wire protocol message
     * @param message The postgres wire protocol message to execute
     * @returns The result of the query
     */
    execProtocol(message: Uint8Array): Promise<ExecProtocolResult>;
    /**
     * Sync the database to the filesystem
     * @returns Promise that resolves when the database is synced to the filesystem
     */
    syncToFs(): Promise<void>;
    /**
     * Listen for a notification
     * @param channel The channel to listen on
     * @param callback The callback to call when a notification is received
     */
    listen(channel: string, callback: (payload: string) => void): Promise<() => Promise<void>>;
    /**
     * Stop listening for a notification
     * @param channel The channel to stop listening on
     * @param callback The callback to remove
     */
    unlisten(channel: string, callback?: (payload: string) => void): Promise<void>;
    /**
     * Listen to notifications
     * @param callback The callback to call when a notification is received
     */
    onNotification(callback: (channel: string, payload: string) => void): () => void;
    /**
     * Stop listening to notifications
     * @param callback The callback to remove
     */
    offNotification(callback: (channel: string, payload: string) => void): void;
    dumpDataDir(): Promise<File | Blob>;
    onLeaderChange(callback: () => void): () => void;
    offLeaderChange(callback: () => void): void;
    _handleBlob(blob?: File | Blob): Promise<void>;
    _getWrittenBlob(): Promise<File | Blob | undefined>;
    _cleanupBlob(): Promise<void>;
    _checkReady(): Promise<void>;
    _runExclusiveQuery<T>(fn: () => Promise<T>): Promise<T>;
    _runExclusiveTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
interface WorkerOptions {
    init: (options: Exclude<PGliteWorkerOptions, 'extensions'>) => Promise<PGlite>;
}
declare function worker({ init }: WorkerOptions): Promise<void>;
declare class LeaderChangedError extends Error {
    constructor();
}

export { LeaderChangedError, PGliteWorker, type PGliteWorkerOptions, type WorkerOptions, worker };
