import Uploader from './uploader';
interface FileInformation {
    totalChunks: number;
    chunkSize: number;
    filename: string;
    totalSize: number;
    hash: string;
    webkitRelativePath: string;
}
export interface TestChunk extends FileInformation {
    chunkIndex: number;
    currentSize: number;
}
export interface Chunk extends TestChunk {
    file: Blob;
}
type ChunkStatus = 'waiting' | 'uploading' | 'paused' | 'completed' | 'failed';
export type FileStatus = ChunkStatus | 'success';
export declare class UploadFile {
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
export {};
