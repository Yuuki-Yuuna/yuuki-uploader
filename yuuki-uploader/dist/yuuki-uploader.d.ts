interface FileInformation {
    totalChunks: number;
    chunkSize: number;
    filename: string;
    totalSize: number;
    hash: string;
    webkitRelativePath: string;
}
interface TestChunk extends FileInformation {
    chunkIndex: number;
    currentSize: number;
}
interface Chunk extends TestChunk {
    file: Blob;
}
type ChunkStatus = 'waiting' | 'uploading' | 'paused' | 'completed' | 'failed';
type FileStatus = ChunkStatus | 'success';
declare class UploadFile {
    readonly uploader: Uploader;
    readonly file: File;
    readonly hash: string;
    private _chunks;
    private _status;
    private _chunksStatus;
    private _xhrTestList;
    private _xhrList;
    private _retrys;
    private _chunksLoaded;
    private _progress;
    private _currentSpeed;
    private _averageSpeed;
    private _lastTimestamp;
    query: Record<string, string | number>;
    mergeAppend: Record<string, any>;
    constructor(uploader: Uploader, file: File, hash: string, _chunks: Chunk[]);
    upload(): Promise<void>;
    private _uploadCurrentChunk;
    private _uploadChunkTest;
    private _uploadChunk;
    private _mergeFile;
    private _checkProgess;
    private _updateProgress;
    pause(): void;
    cancel(): void;
    resume(): void;
    get status(): FileStatus;
    get progress(): number;
    get currentSpeed(): number;
    get averageSpeed(): number;
}

interface UploadRequest {
    file: UploadFile;
    start: () => Promise<void>;
}
declare class RequestList {
    private _uploader;
    private _currentRequest;
    readonly items: UploadRequest[];
    constructor(_uploader: Uploader);
    addRequest(uploadRequest: UploadRequest): void;
    private _requestNext;
    get currentRequest(): number;
}

type Options = Readonly<{
    target: string;
    mergeTarget: string;
    accept: string;
    multiple: boolean;
    directoryMode: boolean;
    replaceMode: boolean;
    chunkSize: number;
    concurrency: number;
    headers: Record<string, string>;
    progressCallbacksInterval: number;
    successCodes: number[];
    skipCodes: number[];
    errorCodes: number[];
    precheck?: (file: UploadFile) => Promise<boolean>;
}>;
declare class Uploader {
    readonly options: Options;
    readonly fileList: UploadFile[];
    readonly uploadList: UploadFile[];
    readonly requestList: RequestList;
    private readonly _trigger;
    onDragEnter?: (event: DragEvent) => void;
    onDragOver?: (event: DragEvent) => void;
    onDragLeave?: (event: DragEvent) => void;
    onFileAdded?: (file: File) => boolean | Promise<boolean> | void;
    onFileReady?: (file: UploadFile) => void;
    onFileRemoved?: (file: UploadFile) => void;
    onFilePaused?: (file: UploadFile) => void;
    onFileFailed?: (file: UploadFile, error: Error) => void;
    onFileCompleted?: (file: UploadFile) => void;
    onFileSuccess?: (file: UploadFile) => void;
    onFileProgress?: (file: UploadFile) => void;
    constructor(options?: Options);
    register(element: HTMLElement): void;
    unRegister(element: HTMLElement): void;
    registerDrop(element: HTMLElement): void;
    unRegisterDrop(element: HTMLElement): void;
    addFile(file: File): Promise<void>;
    addFileList(fileList: File[]): Promise<void>;
    removeFile(uploadFile: UploadFile): void;
    upload(): void;
    pause(): void;
    cancel(): void;
}

export { Chunk, FileStatus, Options, TestChunk, UploadFile, Uploader as default };
