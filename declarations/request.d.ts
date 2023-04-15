import Uploader from './uploader';
import { UploadFile } from './file';
export interface UploadRequest {
    file: UploadFile;
    start: () => Promise<void>;
}
export declare class RequestList {
    private _uploader;
    private _currentRequest;
    readonly items: UploadRequest[];
    constructor(_uploader: Uploader);
    addRequest(uploadRequest: UploadRequest): void;
    private _requestNext;
    get currentRequest(): number;
}
