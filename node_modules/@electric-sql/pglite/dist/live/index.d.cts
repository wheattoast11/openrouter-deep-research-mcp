import { R as Results, d as PGliteInterface } from '../pglite-Csk75SCB.cjs';

interface LiveQueryOptions<T = {
    [key: string]: any;
}> {
    query: string;
    params?: any[] | null;
    offset?: number;
    limit?: number;
    callback?: (results: Results<T>) => void;
    signal?: AbortSignal;
}
interface LiveChangesOptions<T = {
    [key: string]: any;
}> {
    query: string;
    params?: any[] | null;
    key: string;
    callback?: (changes: Array<Change<T>>) => void;
    signal?: AbortSignal;
}
interface LiveIncrementalQueryOptions<T = {
    [key: string]: any;
}> {
    query: string;
    params?: any[] | null;
    key: string;
    callback?: (results: Results<T>) => void;
    signal?: AbortSignal;
}
interface LiveNamespace {
    /**
     * Create a live query
     * @param query - The query to run
     * @param params - The parameters to pass to the query
     * @param callback - A callback to run when the query is updated
     * @returns A promise that resolves to an object with the initial results,
     * an unsubscribe function, and a refresh function
     */
    query<T = {
        [key: string]: any;
    }>(query: string, params?: any[] | null, callback?: (results: Results<T>) => void): Promise<LiveQuery<T>>;
    /**
     * Create a live query
     * @param options - The options to pass to the query
     * @returns A promise that resolves to an object with the initial results,
     * an unsubscribe function, and a refresh function
     */
    query<T = {
        [key: string]: any;
    }>(options: LiveQueryOptions<T>): Promise<LiveQuery<T>>;
    /**
     * Create a live query that returns the changes to the query results
     * @param query - The query to run
     * @param params - The parameters to pass to the query
     * @param callback - A callback to run when the query is updated
     * @returns A promise that resolves to an object with the initial changes,
     * an unsubscribe function, and a refresh function
     */
    changes<T = {
        [key: string]: any;
    }>(query: string, params: any[] | undefined | null, key: string, callback?: (changes: Array<Change<T>>) => void): Promise<LiveChanges<T>>;
    /**
     * Create a live query that returns the changes to the query results
     * @param options - The options to pass to the query
     * @returns A promise that resolves to an object with the initial changes,
     * an unsubscribe function, and a refresh function
     */
    changes<T = {
        [key: string]: any;
    }>(options: LiveChangesOptions<T>): Promise<LiveChanges<T>>;
    /**
     * Create a live query with incremental updates
     * @param query - The query to run
     * @param params - The parameters to pass to the query
     * @param callback - A callback to run when the query is updated
     * @returns A promise that resolves to an object with the initial results,
     * an unsubscribe function, and a refresh function
     */
    incrementalQuery<T = {
        [key: string]: any;
    }>(query: string, params: any[] | undefined | null, key: string, callback?: (results: Results<T>) => void): Promise<LiveQuery<T>>;
    /**
     * Create a live query with incremental updates
     * @param options - The options to pass to the query
     * @returns A promise that resolves to an object with the initial results,
     * an unsubscribe function, and a refresh function
     */
    incrementalQuery<T = {
        [key: string]: any;
    }>(options: LiveIncrementalQueryOptions<T>): Promise<LiveQuery<T>>;
}
interface LiveQueryResults<T> extends Results<T> {
    totalCount?: number;
    offset?: number;
    limit?: number;
}
interface LiveQuery<T> {
    initialResults: LiveQueryResults<T>;
    subscribe: (callback: (results: LiveQueryResults<T>) => void) => void;
    unsubscribe: (callback?: (results: LiveQueryResults<T>) => void) => Promise<void>;
    refresh: (options?: {
        offset?: number;
        limit?: number;
    }) => Promise<void>;
}
interface LiveChanges<T = {
    [key: string]: any;
}> {
    fields: {
        name: string;
        dataTypeID: number;
    }[];
    initialChanges: Array<Change<T>>;
    subscribe: (callback: (changes: Array<Change<T>>) => void) => void;
    unsubscribe: (callback?: (changes: Array<Change<T>>) => void) => Promise<void>;
    refresh: () => Promise<void>;
}
type ChangeInsert<T> = {
    __changed_columns__: string[];
    __op__: 'INSERT';
    __after__: number;
} & T;
type ChangeDelete<T> = {
    __changed_columns__: string[];
    __op__: 'DELETE';
    __after__: undefined;
} & T;
type ChangeUpdate<T> = {
    __changed_columns__: string[];
    __op__: 'UPDATE';
    __after__: number;
} & T;
type ChangeReset<T> = {
    __op__: 'RESET';
} & T;
type Change<T> = ChangeInsert<T> | ChangeDelete<T> | ChangeUpdate<T> | ChangeReset<T>;

declare const live: {
    name: string;
    setup: (pg: PGliteInterface, _emscriptenOpts: any) => Promise<{
        namespaceObj: LiveNamespace;
    }>;
};
type PGliteWithLive = PGliteInterface & {
    live: LiveNamespace;
};

export { type Change, type LiveChanges, type LiveNamespace, type LiveQuery, type LiveQueryResults, type PGliteWithLive, live };
