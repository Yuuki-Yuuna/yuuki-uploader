import { UploadFile } from './file'
import { calculateFile } from './calculate'
import { createTrigger, Trigger } from './trigger'
import { RequestList } from './request'

export type Options = Readonly<{
  target: string //上传目标url
  mergeTarget: string //合并url
  accept: string //接受的文件类型
  multiple: boolean //文件多选(multiple实现)
  directoryMode: boolean //选择文件夹上传(multiple失效)
  replaceMode: boolean //每次选择都会替换待选文件列表
  chunkSize: number //分块大小(byte)
  concurrency: number //最大并发数量
  headers: Record<string, string> //附带请求头
  progressCallbacksInterval: number //进度条回调最小间隔
  successCodes: number[] //认为上传和合并文件成功的http状态码
  skipCodes: number[] //认为get测试请求需要跳过上传的http状态码
  errorCodes: number[] //认为上传和合并文件失败的http状态码
  precheck?: (file: UploadFile) => Promise<boolean> //自定义预检方法
}>

const defaultOptions: Options = {
  target: '/',
  mergeTarget: '/',
  accept: '',
  multiple: true,
  directoryMode: false,
  replaceMode: false,
  chunkSize: 2 * 1024 * 1024,
  concurrency: 3,
  headers: {},
  progressCallbacksInterval: 200,
  successCodes: [200, 201, 202],
  skipCodes: [204, 205, 206],
  errorCodes: [404, 415, 500, 501]
}

// 文件以文件名为准，并不以md5为准
class Uploader {
  readonly options: Options //配置
  readonly fileList: UploadFile[] //待上传的所有文件(是UploadFile[]不是FileList类型)
  readonly uploadList: UploadFile[] //正在上传的文件队列
  readonly requestList: RequestList //并发控制队列
  private readonly _trigger: Trigger //上传器的点击和拖拽上传逻辑

  onDragEnter?: (event: DragEvent) => void //拖拽文件进入时调用
  onDragOver?: (event: DragEvent) => void //拖拽文件在指定区域时周期性调用
  onDragLeave?: (event: DragEvent) => void //拖拽文件离开指定区域时调用
  onFileAdded?: (file: File) => boolean | Promise<boolean> | void //每一个文件加入待传队列前调用
  onFileReady?: (file: UploadFile) => void //每一个文件添加完毕后调用
  onFileRemoved?: (file: UploadFile) => void //一个文件被移除时调用
  onFilePaused?: (file: UploadFile) => void //一个文件暂停时调用
  onFileFailed?: (file: UploadFile, error: Error) => void //一个文件错误时调用
  onFileCompleted?: (file: UploadFile) => void //一个文件的所有分块全部上传成功时调用
  onFileSuccess?: (file: UploadFile) => void //一个文件上传成功时调用(已完成合并请求)
  onFileProgress?: (file: UploadFile) => void //一个文件正在上传时反复调用

  constructor(options?: Options) {
    this.options = { ...defaultOptions, ...options }
    this.fileList = []
    this.uploadList = []
    this.requestList = new RequestList(this)
    this._trigger = createTrigger(this)
  }

  register(element: HTMLElement) {
    const { clickTrigger } = this._trigger
    element.addEventListener('click', clickTrigger)
  }

  unRegister(element: HTMLElement) {
    const { clickTrigger } = this._trigger
    element.removeEventListener('click', clickTrigger)
  }

  registerDrop(element: HTMLElement) {
    const { dragEnterTrigger, dragOverTrigger, dragLeaveTrigger, dropTrigger } = this._trigger
    element.addEventListener('dragenter', dragEnterTrigger)
    element.addEventListener('dragover', dragOverTrigger)
    element.addEventListener('dragleave', dragLeaveTrigger)
    element.addEventListener('drop', dropTrigger)
  }

  unRegisterDrop(element: HTMLElement) {
    const { dragEnterTrigger, dragOverTrigger, dragLeaveTrigger, dropTrigger } = this._trigger
    element.removeEventListener('dragenter', dragEnterTrigger)
    element.removeEventListener('dragover', dragOverTrigger)
    element.removeEventListener('dragleave', dragLeaveTrigger)
    element.removeEventListener('drop', dropTrigger)
  }

  async addFile(file: File) {
    const result = (await this.onFileAdded?.(file)) ?? true
    if (!result) {
      return
    }
    if (this.options.replaceMode) {
      this.fileList.splice(0, this.fileList.length)
    }
    try {
      const uploadFile = await calculateFile(file, this)
      const index = this.fileList.findIndex((item) => item.file.name == uploadFile.file.name)
      if (index === -1) {
        this.fileList.push(uploadFile)
      } else {
        this.fileList[index] = uploadFile
      }
      this.onFileReady?.(uploadFile)
    } catch (err) {
      throw new Error('there are some mistakes when file added.')
    }
  }

  async addFileList(fileList: File[]) {
    if (this.options.replaceMode) {
      this.fileList.splice(0, this.fileList.length)
    }
    for (const file of fileList) {
      await this.addFile(file)
    }
  }

  removeFile(uploadFile: UploadFile) {
    const index = this.fileList.findIndex((item) => item.file.name == uploadFile.file.name)
    if (index !== -1) {
      this.fileList.splice(index, 1)
      this.onFileRemoved?.(uploadFile)
    }
  }

  //开始上传待传队列的所有文件
  upload() {
    while (this.fileList.length) {
      const uploadFile = this.fileList.shift()!
      uploadFile.upload()
      this.uploadList.push(uploadFile)
    }
  }

  //暂停全部
  pause() {
    this.uploadList.forEach((item) => item.pause())
  }

  //取消全部
  cancel() {
    this.uploadList.forEach((item) => item.cancel())
  }
}

export default Uploader
