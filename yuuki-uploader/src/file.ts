import Uploader from './uploader'
import { UploadRequest } from './request'

interface FileInformation {
  totalChunks: number //总块数
  chunkSize: number //预设分块标准大小
  filename: string //文件名
  totalSize: number //总文件大小
  hash: string //文件md5
  webkitRelativePath: string //上传文件夹时文件路径
}

export interface TestChunk extends FileInformation {
  chunkIndex: number //当前块号
  currentSize: number //当前块大小
}

export interface Chunk extends TestChunk {
  file: Blob //文件流
}

type UploadData = FileInformation & Record<string, any> //合并请求上传参数

type ChunkStatus = 'waiting' | 'uploading' | 'paused' | 'completed' | 'failed'
export type FileStatus = ChunkStatus | 'success'

export class UploadFile {
  readonly uploader: Uploader //对应的uploader实例
  readonly file: File //原生文件
  readonly hash: string //md5值
  private _chunks: Chunk[] //文件块
  private _status: FileStatus //文件状态
  private _chunksStatus: ChunkStatus[] //所有文件块状态
  private _xhrTestList: XMLHttpRequest[] //所有测试上传任务的xhr
  private _xhrList: XMLHttpRequest[] //所有实际上传任务的xhr
  private _retrys: number[] //各分块重试次数(测试与实际上传共享次数)
  private _chunksLoaded: number[] //各分块已上传byte
  private _progress: number //上传进度(0到1)
  private _currentSpeed: number //上传瞬时速度
  private _averageSpeed: number //上传平均速度
  private _lastTimestamp: number //上一次调用progress的时间戳
  query: Record<string, string | number> //用户自定义chunk上传参数(仅限字符串，因为是FormData)
  mergeAppend: Record<string, any> //merge追加参数

  constructor(uploader: Uploader, file: File, hash: string, _chunks: Chunk[]) {
    this.uploader = uploader
    this.file = file
    this.hash = hash
    this._chunks = _chunks
    this._status = 'waiting'
    this._chunksStatus = new Array<ChunkStatus>(_chunks.length).fill('waiting')
    this._xhrTestList = []
    this._xhrList = []
    this._retrys = new Array<number>(_chunks.length).fill(0)
    this._chunksLoaded = new Array<number>(_chunks.length).fill(0)
    this._progress = 0
    this._currentSpeed = 0
    this._averageSpeed = 0
    this._lastTimestamp = Date.now()
    this.query = {}
    this.mergeAppend = {}
  }

  async upload() {
    if (this._status != 'waiting') {
      return
    }

    this._status = 'uploading' //重要，防止重复发预检请求
    const { precheck } = this.uploader.options
    const result = await precheck?.(this)
    if (result) {
      this._chunksLoaded = this._chunks.map((chunk) => chunk.file.size)
      this._status = 'success'
      const { options, onFileSuccess } = this.uploader
      if (Date.now() - this._lastTimestamp < options.progressCallbacksInterval) {
        this._updateProgress() //过快需要更新进度条
      }
      onFileSuccess?.(this)
      return
    }

    this._checkProgess() && this._updateProgress()
    for (let current = 0; current < this._chunks.length; current++) {
      this.uploader.requestList.addRequest(this._uploadCurrentChunk(current))
    }
  }

  private _uploadCurrentChunk(current: number) {
    return {
      file: this,
      start: async () => {
        try {
          const needUpload = await this._uploadChunkTest(current)
          needUpload && (await this._uploadChunk(current))
        } catch (err) {
          throw new Error(err as string)
        }
      }
    } as UploadRequest
  }

  //get测试方法(返回值决定是否需要上传)
  private _uploadChunkTest(current: number) {
    return new Promise<boolean>((resolve, reject) => {
      if ((['paused', 'failed'] as FileStatus[]).includes(this._status)) {
        resolve(false)
      }
      this._chunksStatus[current] = 'uploading'
      const { target, headers, successCodes, skipCodes, errorCodes } = this.uploader.options
      const testChunk: TestChunk = { ...this._chunks[current] } //复制一份
      Reflect.deleteProperty(testChunk, 'file')
      const params = new URLSearchParams()
      for (const key in testChunk) {
        const value = testChunk[key as keyof TestChunk].toString()
        params.append(key, value)
      }
      Object.keys(this.query).forEach((key) => params.append(key, this.query[key].toString()))

      const xhr = new XMLHttpRequest()
      this._xhrTestList[current] = xhr

      xhr.addEventListener('load', () => {
        if (successCodes.includes(xhr.status)) {
          //认为需要上传文件
          resolve(true)
        } else if (skipCodes.includes(xhr.status)) {
          //认为文件已存在
          this._chunksLoaded[current] = this._chunks[current].currentSize
          this._checkProgess() && this._updateProgress()
          this._chunksStatus[current] = 'completed'
          resolve(false)
          if (this._chunksStatus.every((chunkStatus) => chunkStatus == 'completed')) {
            this._status = 'completed'
            this.uploader.onFileCompleted?.(this)
            this._mergeFile()
          }
        } else if (errorCodes.includes(xhr.status)) {
          this._chunksStatus[current] = 'failed'
          this._status = 'failed'
          reject('there is a chunk failed to upload during the test')
        } else {
          retryUpload()
        }
      })
      xhr.addEventListener('abort', () => {
        this._chunksStatus[current] = 'paused'
        this._status = 'paused'
        resolve(false)
      })
      xhr.addEventListener('error', () => retryUpload())

      xhr.open('get', `${target}?${params.toString()}`)
      Object.keys(headers).forEach((name) => xhr.setRequestHeader(name, headers[name]))
      xhr.send()

      const retryUpload = () => {
        if (this._retrys[current] > 3) {
          this._chunksStatus[current] = 'failed'
          this._status = 'failed'
          reject('there is a chunk failed to upload during the test')
        } else {
          this._retrys[current]++
          xhr.open('get', `${target}?${params.toString()}`)
          Object.keys(headers).forEach((name) => xhr.setRequestHeader(name, headers[name]))
          xhr.send()
        }
      }
    })
  }

  //实际上传方法
  private _uploadChunk(current: number) {
    return new Promise<boolean>((resolve, reject) => {
      if ((['paused', 'failed'] as FileStatus[]).includes(this._status)) {
        resolve(false)
      }
      this._chunksStatus[current] = 'uploading'
      const { target, headers, successCodes, errorCodes } = this.uploader.options
      const chunk = this._chunks[current]
      const formData = new FormData()
      for (const key in chunk) {
        let value = chunk[key as keyof Chunk]
        value = typeof value == 'number' ? value.toString() : value
        formData.append(key, value)
      }
      Object.keys(this.query).forEach((key) => formData.append(key, this.query[key].toString()))

      const xhr = new XMLHttpRequest()
      this._xhrList[current] = xhr

      xhr.addEventListener('load', () => {
        if (successCodes.includes(xhr.status)) {
          this._chunksStatus[current] = 'completed'
          resolve(true)
          if (this._chunksStatus.every((chunkStatus) => chunkStatus == 'completed')) {
            this._status = 'completed'
            this.uploader.onFileCompleted?.(this)
            this._mergeFile()
          }
        } else if (errorCodes.includes(xhr.status)) {
          this._chunksStatus[current] = 'failed'
          this._status = 'failed'
          reject('there is a chunk failed to upload during the test')
        } else {
          retryUpload()
        }
      })
      xhr.addEventListener('abort', () => {
        this._chunksStatus[current] = 'paused'
        this._status = 'paused'
        resolve(false)
      })
      xhr.addEventListener('error', () => retryUpload())
      xhr.upload.addEventListener('progress', (event) => {
        // 上传除了文件还有其它数据(这里将所有数据近似为文件数据)
        this._chunksLoaded[current] =
          (event.loaded / event.total) * this._chunks[current].currentSize
        this._checkProgess() && this._updateProgress()
      })

      xhr.open('post', target)
      Object.keys(headers).forEach((name) => xhr.setRequestHeader(name, headers[name]))
      xhr.send(formData)

      const retryUpload = () => {
        if (this._retrys[current] > 3) {
          this._chunksStatus[current] = 'failed'
          this._status = 'failed'
          reject('there is a chunk failed to upload during the test')
        } else {
          this._retrys[current]++
          xhr.open('post', target)
          Object.keys(headers).forEach((name) => xhr.setRequestHeader(name, headers[name]))
          xhr.send(formData)
        }
      }
    })
  }

  private _mergeFile() {
    if (this._status != 'completed') {
      return
    }

    const { mergeTarget, headers, chunkSize, progressCallbacksInterval, successCodes, errorCodes } =
      this.uploader.options
    if (Date.now() - this._lastTimestamp < progressCallbacksInterval) {
      this._updateProgress() //过快需要更新进度条
    }
    const xhr = new XMLHttpRequest()
    const { name, size, webkitRelativePath } = this.file
    const data: UploadData = {
      ...this.mergeAppend,
      totalChunks: this._chunks.length,
      chunkSize,
      filename: name, //文件名
      totalSize: size,
      hash: this.hash,
      webkitRelativePath //上传文件夹时文件路径,
    }

    this.uploader.requestList.addRequest({
      file: this,
      start: () => {
        return new Promise<void>((resolve, reject) => {
          let retry = 0

          xhr.addEventListener('load', () => {
            if (successCodes.includes(xhr.status)) {
              this._status = 'success'
              resolve()
              this.uploader.onFileSuccess?.(this)
            } else if (errorCodes.includes(xhr.status)) {
              this._status = 'failed'
              reject('there is a file failed to merge during the test')
            } else {
              retryUpload()
            }
          })
          xhr.addEventListener('error', () => retryUpload())

          xhr.open('post', mergeTarget)
          Object.keys(headers).forEach((name) => xhr.setRequestHeader(name, headers[name]))
          xhr.setRequestHeader('Content-Type', 'application/json')
          xhr.send(JSON.stringify(data))

          const retryUpload = () => {
            if (retry > 3) {
              this._status = 'failed'
              reject('there is a file failed to merge during the test')
            } else {
              retry++
              xhr.open('post', mergeTarget)
              Object.keys(headers).forEach((name) => xhr.setRequestHeader(name, headers[name]))
              xhr.setRequestHeader('Content-Type', 'application/json')
              xhr.send(JSON.stringify(data))
            }
          }
        })
      }
    })
  }

  //进度回调节流(过小会测不准，不确定性原理(doge))
  private _checkProgess() {
    return Date.now() - this._lastTimestamp >= this.uploader.options.progressCallbacksInterval
  }

  //更新进度，需节流(通过check实现)
  private _updateProgress() {
    const timestamp = Date.now()
    const delta = timestamp - this._lastTimestamp
    if (!delta) {
      return
    }
    const smoothingFactor = 0.1 //每次瞬时速度对平均速度贡献度
    const loaded = this._chunksLoaded.reduce((pre, chunkLoaded) => pre + chunkLoaded)
    const newProgress = loaded / this.file.size
    // abort可能会导致负增量
    const increase = Math.max((newProgress - this._progress) * this.file.size, 0)
    const currentSpeed = (increase / delta) * 1000
    this._currentSpeed = currentSpeed
    this._averageSpeed = smoothingFactor * currentSpeed + (1 - smoothingFactor) * this._averageSpeed
    this._lastTimestamp = timestamp
    this._progress = newProgress
    this.uploader.onFileProgress?.(this)
  }

  pause() {
    this._status = 'paused'
    this._xhrTestList.forEach((item) => item?.abort())
    this._xhrList.forEach((item) => item?.abort())
    this._currentSpeed = 0
    this._averageSpeed = 0
    this.uploader.onFilePaused?.(this)
  }

  cancel() {
    this.pause()
    const index = this.uploader.uploadList.findIndex((item) => item.file.name == this.file.name)
    if (index !== -1) {
      this.uploader.uploadList.splice(index, 1)
    }
  }

  resume() {
    if (this._status != 'paused') {
      return
    }

    this._status = 'uploading'
    for (let current = 0; current < this._chunks.length; current++) {
      if ((['waiting', 'paused'] as ChunkStatus[]).includes(this._chunksStatus[current])) {
        this.uploader.requestList.addRequest(this._uploadCurrentChunk(current))
      }
    }
  }

  get status() {
    return this._status
  }

  get progress() {
    return this._progress
  }

  get currentSpeed() {
    return this._currentSpeed
  }

  get averageSpeed() {
    return this._averageSpeed
  }
}
