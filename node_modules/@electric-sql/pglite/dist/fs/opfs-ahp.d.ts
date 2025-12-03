import { v as BaseFilesystem, b as PGlite, c as PostgresMod, w as FsStats } from '../pglite-Csk75SCB.js';

interface OpfsAhpOptions {
    initialPoolSize?: number;
    maintainedPoolSize?: number;
    debug?: boolean;
}
interface FileSystemSyncAccessHandle {
    close(): void;
    flush(): void;
    getSize(): number;
    read(buffer: ArrayBuffer, options: {
        at: number;
    }): number;
    truncate(newSize: number): void;
    write(buffer: ArrayBuffer, options: {
        at: number;
    }): number;
}
interface State {
    root: DirectoryNode;
    pool: PoolFilenames;
}
type PoolFilenames = Array<string>;
interface WALEntry {
    opp: string;
    args: any[];
}
type NodeType = 'file' | 'directory';
interface BaseNode {
    type: NodeType;
    lastModified: number;
    mode: number;
}
interface FileNode extends BaseNode {
    type: 'file';
    backingFilename: string;
}
interface DirectoryNode extends BaseNode {
    type: 'directory';
    children: {
        [filename: string]: Node;
    };
}
type Node = FileNode | DirectoryNode;
/**
 * PGlite OPFS access handle pool filesystem.
 * Opens a pool of sync access handles and then allocates them as needed.
 */
declare class OpfsAhpFS extends BaseFilesystem {
    #private;
    readonly dataDir: string;
    readonly initialPoolSize: number;
    readonly maintainedPoolSize: number;
    state: State;
    lastCheckpoint: number;
    checkpointInterval: number;
    poolCounter: number;
    constructor(dataDir: string, { initialPoolSize, maintainedPoolSize, debug, }?: OpfsAhpOptions);
    init(pg: PGlite, opts: Partial<PostgresMod>): Promise<{
        emscriptenOpts: Partial<PostgresMod>;
    }>;
    syncToFs(relaxedDurability?: boolean): Promise<void>;
    closeFs(): Promise<void>;
    maintainPool(size?: number): Promise<void>;
    _createPoolFileState(filename: string): void;
    _deletePoolFileState(filename: string): void;
    maybeCheckpointState(): Promise<void>;
    checkpointState(): Promise<void>;
    flush(): void;
    chmod(path: string, mode: number): void;
    _chmodState(path: string, mode: number): void;
    close(fd: number): void;
    fstat(fd: number): FsStats;
    lstat(path: string): FsStats;
    mkdir(path: string, options?: {
        recursive?: boolean;
        mode?: number;
    }): void;
    _mkdirState(path: string, options?: {
        recursive?: boolean;
        mode?: number;
    }): void;
    open(path: string, _flags?: string, _mode?: number): number;
    readdir(path: string): string[];
    read(fd: number, buffer: Uint8Array, // Buffer to read into
    offset: number, // Offset in buffer to start writing to
    length: number, // Number of bytes to read
    position: number): number;
    rename(oldPath: string, newPath: string): void;
    _renameState(oldPath: string, newPath: string, doFileOps?: boolean): void;
    rmdir(path: string): void;
    _rmdirState(path: string): void;
    truncate(path: string, len?: number): void;
    unlink(path: string): void;
    _unlinkState(path: string, doFileOps?: boolean): void;
    utimes(path: string, atime: number, mtime: number): void;
    _utimesState(path: string, _atime: number, mtime: number): void;
    writeFile(path: string, data: string | Uint8Array, options?: {
        encoding?: string;
        mode?: number;
        flag?: string;
    }): void;
    _createFileNodeState(path: string, node: FileNode): FileNode;
    _setLastModifiedState(path: string, lastModified: number): void;
    write(fd: number, buffer: Uint8Array, // Buffer to read from
    offset: number, // Offset in buffer to start reading from
    length: number, // Number of bytes to write
    position: number): number;
}

export { type DirectoryNode, type FileNode, type FileSystemSyncAccessHandle, type Node, type NodeType, OpfsAhpFS, type OpfsAhpOptions, type PoolFilenames, type State, type WALEntry };
