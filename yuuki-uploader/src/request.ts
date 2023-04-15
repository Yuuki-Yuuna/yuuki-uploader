import Uploader from './uploader'
import { UploadFile } from './file'

export interface UploadRequest {
  file: UploadFile
  start: () => Promise<void>
}

export class RequestList {
  private _uploader: Uploader
  private _currentRequest: number //正在请求数量
  readonly items: UploadRequest[] //上传器的请求队列，用于控制并发

  constructor(_uploader: Uploader) {
    this._uploader = _uploader
    this.items = []
    this._currentRequest = 0
  }

  addRequest(uploadRequest: UploadRequest) {
    if (this.items.length) {
      this.items.push(uploadRequest)
    } else {
      this.items.push(uploadRequest)
      this._requestNext()
    }
  }

  private _requestNext() {
    const { concurrency } = this._uploader.options
    while (this._currentRequest < concurrency && this.items.length) {
      this._currentRequest++ //占用资源
      const uploadRequest = this.items.shift()!
      uploadRequest
        .start()
        .then(() => {
          this._currentRequest--
          if (this.items.length) {
            this._requestNext()
          }
        })
        .catch((err) => {
          this._currentRequest-- //不再重试，释放资源
          this._uploader.onFileFailed?.(uploadRequest.file, err as Error)
        })
    }
  }

  get currentRequest() {
    return this._currentRequest
  }
}
