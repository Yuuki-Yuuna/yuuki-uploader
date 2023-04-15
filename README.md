# Yuuki-Uploader

基于 HTML5 的文件上传器，内置[Spark-MD5](https://github.com/satazor/js-spark-md5)，实现了文件分片上传、分片检测、断点续传等功能。

## 安装

```bash

npm install yuuki-uploader

```

## 基本用法

默认导出 Uploader 类，创建 Uploader 实例即可使用

```js
import Uploader from 'yuuki-uploader'

const uploader = new Uploader({
  target: 'http://example.com/upload',
  mergeTarget: 'http://example.com/merge'
})
```

将 Uploader 挂载至 DOM 元素上

```js
const addButton = document.querySelector('#fileAdd')
const UploadButton = document.querySelector('#fileUpload')

uploader.register(addButton)
// uploader.unRegister(button)

UploadButton.addEventListener('click', () => uploader.upload())
```

## 服务端接收分片

前端在上传文件前可以在 precheck 配置项中确定是否上传该文件，每个分片上传前都会发起 get 请求，根据后端返回的状态码决定是否发起 post 请求上传该分片，在所有分片成功发送后，前端会发起 post 请求通知后端合并文件，同样根据状态码判断是否合并成功。

每个上传分片**至少**包含以下信息：

- `chunkIndex`: 当前块号
- `totalChunks`: 总块数
- `chunkSize`: 预设分块标准大小
- `currentSize`: 当前块大小
- `totalSize`: 总文件大小
- `filename`: 文件名
- `webkitRelativePath`: 上传文件夹时文件路径

得到状态码后的操作：

- 认为请求成功需要上传的状态码: 200, 201, 202

- 认为请求成功不需要上传的状态码: 204，205，206

- 认为请求失败不再进行上传的状态码: 404, 415, 500, 501

- 其它状态码会自动重传直到重传次数上限

## API 文档

### Uploader

#### 构造函数

实例化的时候可以传入配置项

```js
const uploader = new Uploader(options)
```

options 配置项的数据类型

```ts
export type Options = Readonly<{
  target: string //上传目标url，默认为'/'
  mergeTarget: string //合并url，默认为'/'
  multiple: boolean //文件多选(multiple实现)，默认为true
  accept: string //接受的文件类型，默认为''
  directoryMode: boolean //选择文件夹上传(multiple失效)，默认为false
  replaceMode: boolean //每次选择都会替换待选文件列表，默认为false
  chunkSize: number //分块大小(byte)，默认为 2 * 1024 * 1024
  concurrency: number //最大并发数量，默认为3
  headers: Record<string, string> //附带请求头，默认为{}
  progressCallbacksInterval: number //进度条回调最小间隔，默认为200
  precheck?: (file: UploadFile) => Promise<boolean> //自定义预检方法，默认为undefined
}>
```

## 实例属性与方法

```ts
export class Uploader {
  //属性
  readonly options: Options //配置
  fileList: UploadFile[] //待上传的文件(是File[]不是FileList类型)
  uploadList: UploadFile[] //正在上传的文件队列

  //监听事件
  onDragEnter?: (event: DragEvent) => void //拖拽文件进入时调用
  onDragOver?: (event: DragEvent) => void //拖拽文件在指定区域时周期性调用
  onDragLeave?: (event: DragEvent) => void //拖拽文件离开指定区域时调用
  onFileAdded?: (file: File) => boolean | Promise<boolean> | void //每一个文件加入待传队列前调用
  onFileReady?: (file: UploadFile) => void //每一个文件添加完毕后调用
  onFileRemoved?: (file: UploadFile) => void //一个文件被移除时调用
  onFileFailed?: (file: UploadFile, error: Error) => void //一个文件错误时调用
  onFilePaused?: (file: UploadFile) => void //一个文件暂停时调用
  onFileCompleted?: (file: UploadFile) => void //一个文件的所有分块全部上传成功时调用
  onFileSuccess?: (file: UploadFile) => void //一个文件上传成功时调用(已完成合并请求)
  onFileProgress?: (file: UploadFile) => void //一个文件正在上传时反复调用

  //方法
  register(element: HTMLElement): void //将传入元素注册为uploader
  unRegister(element: HTMLElement): void //解除传入元素的uploader
  registerDrop(element: HTMLElement): void //将传入元素注册为拖拽上传的uploader
  unRegisterDrop(element: HTMLElement): void //解除传入元素为拖拽上传的uploader
  async addFile(file: File): Promise<void> //添加单个文件
  async addFileList(fileList: FileList): Promise<void> //添加文件列表
  removeFile(file: UploadFile): void //移除传入文件
  upload: (): void //开始上传待传队列的所有文件
  pause(): void  //暂停全部上传
  cancel(): void //取消全部上传
}
```

### UploadFile

#### 实例属性与方法

```ts
export class UploadFile {
  //属性
  readonly uploader: Uploader //对应的uploader实例
  readonly file: File //原生文件对象
  readonly hash: string //md5值
  readonly chunks: Chunk[] //所有的文件块
  query: Record<string, string | number> //用户自定义chunk上传参数(仅限字符串，因为是FormData)
  mergeAppend: Record<string | number | symbol, any> //merge合并请求中追加参数

  //方法
  async upload(): Promise<void> //上传该文件
  pause(): void //暂停上传该文件
  cancel(): void //取消上传该文件
  resume(): void //恢复上传该文件

  getProgress(): number //获得文件上传进度(0-1)

  getCurrentSpeed(): number //获得上传瞬时速度(byte)

  getAverageSpeed(): number //获得上传平均速度(byte)

  getStatus(): FileStatus // 获得该文件状态
}

type FileStatus = 'waiting' | 'uploading' | 'paused' | 'completed' | 'success' | 'failed'
```

#### 文件状态类型 FileStatus

一个 Uploader 中的文件存在以下状态：

- `waiting`: 等待上传
- `uploading`: 正在上传
- `paused`: 暂停中
- `completed`: 所有分块上传完毕，但未合并
- `success`: 所有分块上传完毕，并且合并成功
- `failed`: 上传失败(无论什么原因)

## 作者附

可能用起来非常垃圾，实例代码也写的很垃圾，可以考虑直接 clone 源码修改一下，所有逻辑都很简单 ——来自垃圾作者
