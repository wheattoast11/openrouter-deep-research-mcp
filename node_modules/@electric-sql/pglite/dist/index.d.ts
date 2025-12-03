import { B as BackendMessage$1, P as Parser$1, Q as QueryOptions, R as Results, M as Mode, a as BufferParameter, E as EmscriptenBuiltinFilesystem, b as PGlite, c as PostgresMod, d as PGliteInterface, T as Transaction } from './pglite-Csk75SCB.js';
export { D as DebugLevel, u as DescribeQueryResult, o as DumpDataDirResult, g as ExecProtocolOptions, n as ExecProtocolResult, j as Extension, k as ExtensionNamespace, i as ExtensionSetup, h as ExtensionSetupResult, l as Extensions, F as FilesystemType, I as InitializedExtensions, r as PGliteInterfaceExtensions, q as PGliteOptions, f as ParserOptions, s as Row, e as RowMode, S as SerializerOptions, m as messages, p as postgresMod, t as types } from './pglite-Csk75SCB.js';

/**
 * This function is used to parse the results of either a simple or extended query.
 * https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-SIMPLE-QUERY
 */
declare function parseResults(messages: Array<BackendMessage$1>, defaultParsers: Record<number | string, Parser$1>, options?: QueryOptions, blob?: Blob): Array<Results>;
/** Get the dataTypeIDs from a list of messages, if it's available. */
declare function parseDescribeStatementResults(messages: Array<BackendMessage$1>): number[];

declare const parse_parseDescribeStatementResults: typeof parseDescribeStatementResults;
declare const parse_parseResults: typeof parseResults;
declare namespace parse {
  export { parse_parseDescribeStatementResults as parseDescribeStatementResults, parse_parseResults as parseResults };
}

type LegalValue = string | ArrayBuffer | ArrayBufferView | null;
type ParseOpts = {
    name?: string;
    types?: number[];
    text: string;
};
type ValueMapper = (param: unknown, index: number) => LegalValue;
type BindOpts = {
    portal?: string;
    binary?: boolean;
    statement?: string;
    values?: LegalValue[];
    valueMapper?: ValueMapper;
};
type ExecOpts = {
    portal?: string;
    rows?: number;
};
type PortalOpts = {
    type: 'S' | 'P';
    name?: string;
};
declare const serialize: {
    startup: (opts: Record<string, string>) => Uint8Array;
    password: (password: string) => Uint8Array;
    requestSsl: () => Uint8Array;
    sendSASLInitialResponseMessage: (mechanism: string, initialResponse: string) => Uint8Array;
    sendSCRAMClientFinalMessage: (additionalData: string) => Uint8Array;
    query: (text: string) => Uint8Array;
    parse: (query: ParseOpts) => Uint8Array;
    bind: (config?: BindOpts) => Uint8Array;
    execute: (config?: ExecOpts) => Uint8Array;
    describe: (msg: PortalOpts) => Uint8Array;
    close: (msg: PortalOpts) => Uint8Array;
    flush: () => Uint8Array;
    sync: () => Uint8Array;
    end: () => Uint8Array;
    copyData: (chunk: ArrayBuffer) => Uint8Array;
    copyDone: () => Uint8Array;
    copyFail: (message: string) => Uint8Array;
    cancel: (processID: number, secretKey: number) => Uint8Array;
};

type MessageName = 'parseComplete' | 'bindComplete' | 'closeComplete' | 'noData' | 'portalSuspended' | 'replicationStart' | 'emptyQuery' | 'copyDone' | 'copyData' | 'rowDescription' | 'parameterDescription' | 'parameterStatus' | 'backendKeyData' | 'notification' | 'readyForQuery' | 'commandComplete' | 'dataRow' | 'copyInResponse' | 'copyOutResponse' | 'authenticationOk' | 'authenticationMD5Password' | 'authenticationCleartextPassword' | 'authenticationSASL' | 'authenticationSASLContinue' | 'authenticationSASLFinal' | 'error' | 'notice';
type BackendMessage = {
    name: MessageName;
    length: number;
};
declare const parseComplete: BackendMessage;
declare const bindComplete: BackendMessage;
declare const closeComplete: BackendMessage;
declare const noData: BackendMessage;
declare const portalSuspended: BackendMessage;
declare const replicationStart: BackendMessage;
declare const emptyQuery: BackendMessage;
declare const copyDone: BackendMessage;
declare class AuthenticationOk implements BackendMessage {
    readonly length: number;
    readonly name = "authenticationOk";
    constructor(length: number);
}
declare class AuthenticationCleartextPassword implements BackendMessage {
    readonly length: number;
    readonly name = "authenticationCleartextPassword";
    constructor(length: number);
}
declare class AuthenticationMD5Password implements BackendMessage {
    readonly length: number;
    readonly salt: Uint8Array;
    readonly name = "authenticationMD5Password";
    constructor(length: number, salt: Uint8Array);
}
declare class AuthenticationSASL implements BackendMessage {
    readonly length: number;
    readonly mechanisms: string[];
    readonly name = "authenticationSASL";
    constructor(length: number, mechanisms: string[]);
}
declare class AuthenticationSASLContinue implements BackendMessage {
    readonly length: number;
    readonly data: string;
    readonly name = "authenticationSASLContinue";
    constructor(length: number, data: string);
}
declare class AuthenticationSASLFinal implements BackendMessage {
    readonly length: number;
    readonly data: string;
    readonly name = "authenticationSASLFinal";
    constructor(length: number, data: string);
}
type AuthenticationMessage = AuthenticationOk | AuthenticationCleartextPassword | AuthenticationMD5Password | AuthenticationSASL | AuthenticationSASLContinue | AuthenticationSASLFinal;
interface NoticeOrError {
    message: string | undefined;
    severity: string | undefined;
    code: string | undefined;
    detail: string | undefined;
    hint: string | undefined;
    position: string | undefined;
    internalPosition: string | undefined;
    internalQuery: string | undefined;
    where: string | undefined;
    schema: string | undefined;
    table: string | undefined;
    column: string | undefined;
    dataType: string | undefined;
    constraint: string | undefined;
    file: string | undefined;
    line: string | undefined;
    routine: string | undefined;
}
declare class DatabaseError extends Error implements NoticeOrError {
    readonly length: number;
    readonly name: MessageName;
    severity: string | undefined;
    code: string | undefined;
    detail: string | undefined;
    hint: string | undefined;
    position: string | undefined;
    internalPosition: string | undefined;
    internalQuery: string | undefined;
    where: string | undefined;
    schema: string | undefined;
    table: string | undefined;
    column: string | undefined;
    dataType: string | undefined;
    constraint: string | undefined;
    file: string | undefined;
    line: string | undefined;
    routine: string | undefined;
    constructor(message: string, length: number, name: MessageName);
}
declare class CopyDataMessage implements BackendMessage {
    readonly length: number;
    readonly chunk: Uint8Array;
    readonly name = "copyData";
    constructor(length: number, chunk: Uint8Array);
}
declare class CopyResponse implements BackendMessage {
    readonly length: number;
    readonly name: MessageName;
    readonly binary: boolean;
    readonly columnTypes: number[];
    constructor(length: number, name: MessageName, binary: boolean, columnCount: number);
}
declare class Field {
    readonly name: string;
    readonly tableID: number;
    readonly columnID: number;
    readonly dataTypeID: number;
    readonly dataTypeSize: number;
    readonly dataTypeModifier: number;
    readonly format: Mode;
    constructor(name: string, tableID: number, columnID: number, dataTypeID: number, dataTypeSize: number, dataTypeModifier: number, format: Mode);
}
declare class RowDescriptionMessage implements BackendMessage {
    readonly length: number;
    readonly fieldCount: number;
    readonly name: MessageName;
    readonly fields: Field[];
    constructor(length: number, fieldCount: number);
}
declare class ParameterDescriptionMessage implements BackendMessage {
    readonly length: number;
    readonly parameterCount: number;
    readonly name: MessageName;
    readonly dataTypeIDs: number[];
    constructor(length: number, parameterCount: number);
}
declare class ParameterStatusMessage implements BackendMessage {
    readonly length: number;
    readonly parameterName: string;
    readonly parameterValue: string;
    readonly name: MessageName;
    constructor(length: number, parameterName: string, parameterValue: string);
}
declare class BackendKeyDataMessage implements BackendMessage {
    readonly length: number;
    readonly processID: number;
    readonly secretKey: number;
    readonly name: MessageName;
    constructor(length: number, processID: number, secretKey: number);
}
declare class NotificationResponseMessage implements BackendMessage {
    readonly length: number;
    readonly processId: number;
    readonly channel: string;
    readonly payload: string;
    readonly name: MessageName;
    constructor(length: number, processId: number, channel: string, payload: string);
}
declare class ReadyForQueryMessage implements BackendMessage {
    readonly length: number;
    readonly status: string;
    readonly name: MessageName;
    constructor(length: number, status: string);
}
declare class CommandCompleteMessage implements BackendMessage {
    readonly length: number;
    readonly text: string;
    readonly name: MessageName;
    constructor(length: number, text: string);
}
declare class DataRowMessage implements BackendMessage {
    length: number;
    fields: (string | null)[];
    readonly fieldCount: number;
    readonly name: MessageName;
    constructor(length: number, fields: (string | null)[]);
}
declare class NoticeMessage implements BackendMessage, NoticeOrError {
    readonly length: number;
    readonly message: string | undefined;
    constructor(length: number, message: string | undefined);
    readonly name = "notice";
    severity: string | undefined;
    code: string | undefined;
    detail: string | undefined;
    hint: string | undefined;
    position: string | undefined;
    internalPosition: string | undefined;
    internalQuery: string | undefined;
    where: string | undefined;
    schema: string | undefined;
    table: string | undefined;
    column: string | undefined;
    dataType: string | undefined;
    constraint: string | undefined;
    file: string | undefined;
    line: string | undefined;
    routine: string | undefined;
}

type messages_AuthenticationCleartextPassword = AuthenticationCleartextPassword;
declare const messages_AuthenticationCleartextPassword: typeof AuthenticationCleartextPassword;
type messages_AuthenticationMD5Password = AuthenticationMD5Password;
declare const messages_AuthenticationMD5Password: typeof AuthenticationMD5Password;
type messages_AuthenticationMessage = AuthenticationMessage;
type messages_AuthenticationOk = AuthenticationOk;
declare const messages_AuthenticationOk: typeof AuthenticationOk;
type messages_AuthenticationSASL = AuthenticationSASL;
declare const messages_AuthenticationSASL: typeof AuthenticationSASL;
type messages_AuthenticationSASLContinue = AuthenticationSASLContinue;
declare const messages_AuthenticationSASLContinue: typeof AuthenticationSASLContinue;
type messages_AuthenticationSASLFinal = AuthenticationSASLFinal;
declare const messages_AuthenticationSASLFinal: typeof AuthenticationSASLFinal;
type messages_BackendKeyDataMessage = BackendKeyDataMessage;
declare const messages_BackendKeyDataMessage: typeof BackendKeyDataMessage;
type messages_BackendMessage = BackendMessage;
type messages_CommandCompleteMessage = CommandCompleteMessage;
declare const messages_CommandCompleteMessage: typeof CommandCompleteMessage;
type messages_CopyDataMessage = CopyDataMessage;
declare const messages_CopyDataMessage: typeof CopyDataMessage;
type messages_CopyResponse = CopyResponse;
declare const messages_CopyResponse: typeof CopyResponse;
type messages_DataRowMessage = DataRowMessage;
declare const messages_DataRowMessage: typeof DataRowMessage;
type messages_DatabaseError = DatabaseError;
declare const messages_DatabaseError: typeof DatabaseError;
type messages_Field = Field;
declare const messages_Field: typeof Field;
type messages_MessageName = MessageName;
type messages_NoticeMessage = NoticeMessage;
declare const messages_NoticeMessage: typeof NoticeMessage;
type messages_NotificationResponseMessage = NotificationResponseMessage;
declare const messages_NotificationResponseMessage: typeof NotificationResponseMessage;
type messages_ParameterDescriptionMessage = ParameterDescriptionMessage;
declare const messages_ParameterDescriptionMessage: typeof ParameterDescriptionMessage;
type messages_ParameterStatusMessage = ParameterStatusMessage;
declare const messages_ParameterStatusMessage: typeof ParameterStatusMessage;
type messages_ReadyForQueryMessage = ReadyForQueryMessage;
declare const messages_ReadyForQueryMessage: typeof ReadyForQueryMessage;
type messages_RowDescriptionMessage = RowDescriptionMessage;
declare const messages_RowDescriptionMessage: typeof RowDescriptionMessage;
declare const messages_bindComplete: typeof bindComplete;
declare const messages_closeComplete: typeof closeComplete;
declare const messages_copyDone: typeof copyDone;
declare const messages_emptyQuery: typeof emptyQuery;
declare const messages_noData: typeof noData;
declare const messages_parseComplete: typeof parseComplete;
declare const messages_portalSuspended: typeof portalSuspended;
declare const messages_replicationStart: typeof replicationStart;
declare namespace messages {
  export { messages_AuthenticationCleartextPassword as AuthenticationCleartextPassword, messages_AuthenticationMD5Password as AuthenticationMD5Password, type messages_AuthenticationMessage as AuthenticationMessage, messages_AuthenticationOk as AuthenticationOk, messages_AuthenticationSASL as AuthenticationSASL, messages_AuthenticationSASLContinue as AuthenticationSASLContinue, messages_AuthenticationSASLFinal as AuthenticationSASLFinal, messages_BackendKeyDataMessage as BackendKeyDataMessage, type messages_BackendMessage as BackendMessage, messages_CommandCompleteMessage as CommandCompleteMessage, messages_CopyDataMessage as CopyDataMessage, messages_CopyResponse as CopyResponse, messages_DataRowMessage as DataRowMessage, messages_DatabaseError as DatabaseError, messages_Field as Field, type messages_MessageName as MessageName, messages_NoticeMessage as NoticeMessage, messages_NotificationResponseMessage as NotificationResponseMessage, messages_ParameterDescriptionMessage as ParameterDescriptionMessage, messages_ParameterStatusMessage as ParameterStatusMessage, messages_ReadyForQueryMessage as ReadyForQueryMessage, messages_RowDescriptionMessage as RowDescriptionMessage, messages_bindComplete as bindComplete, messages_closeComplete as closeComplete, messages_copyDone as copyDone, messages_emptyQuery as emptyQuery, messages_noData as noData, messages_parseComplete as parseComplete, messages_portalSuspended as portalSuspended, messages_replicationStart as replicationStart };
}

type MessageCallback = (msg: BackendMessage) => void;
declare class Parser {
    #private;
    parse(buffer: BufferParameter, callback: MessageCallback): void;
}

type index_Parser = Parser;
declare const index_Parser: typeof Parser;
declare const index_messages: typeof messages;
declare const index_serialize: typeof serialize;
declare namespace index {
  export { index_Parser as Parser, index_messages as messages, index_serialize as serialize };
}

declare class MemoryFS extends EmscriptenBuiltinFilesystem {
    closeFs(): Promise<void>;
}

declare class IdbFs extends EmscriptenBuiltinFilesystem {
    init(pg: PGlite, opts: Partial<PostgresMod>): Promise<{
        emscriptenOpts: Partial<PostgresMod>;
    }>;
    initialSyncFs(): Promise<void>;
    syncToFs(_relaxedDurability?: boolean): Promise<void>;
    closeFs(): Promise<void>;
}

interface MutexInterface {
    acquire(): Promise<MutexInterface.Releaser>;
    runExclusive<T>(callback: MutexInterface.Worker<T>): Promise<T>;
    waitForUnlock(): Promise<void>;
    isLocked(): boolean;
    release(): void;
    cancel(): void;
}
declare namespace MutexInterface {
    interface Releaser {
        (): void;
    }
    interface Worker<T> {
        (): Promise<T> | T;
    }
}

declare class Mutex implements MutexInterface {
    constructor(cancelError?: Error);
    acquire(): Promise<MutexInterface.Releaser>;
    runExclusive<T>(callback: MutexInterface.Worker<T>): Promise<T>;
    isLocked(): boolean;
    waitForUnlock(): Promise<void>;
    release(): void;
    cancel(): void;
    private _semaphore;
}

declare const uuid: () => string;
/**
 * Formats a query with parameters
 * Expects that any tables/relations referenced in the query exist in the database
 * due to requiring them to be present to describe the parameters types.
 * `tx` is optional, and to be used when formatQuery is called during a transaction.
 * @param pg - The PGlite instance
 * @param query - The query to format
 * @param params - The parameters to format the query with
 * @param tx - The transaction to use, defaults to the PGlite instance
 * @returns The formatted query
 */
declare function formatQuery(pg: PGliteInterface, query: string, params?: any[] | null, tx?: Transaction | PGliteInterface): Promise<string>;

export { IdbFs, MemoryFS, Mutex, PGlite, PGliteInterface, QueryOptions, Results, Transaction, formatQuery, parse, index as protocol, uuid };
