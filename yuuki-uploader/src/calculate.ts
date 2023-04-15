import SparkMD5 from 'spark-md5'
import Uploader from './uploader'
import { UploadFile, Chunk } from './file'

export const calculateFile = (file: File, uploader: Uploader) => {
  return new Promise<UploadFile>((resolve, reject) => {
    const { chunkSize } = uploader.options
    const spark = new SparkMD5.ArrayBuffer()
    const chunkNum = Math.ceil(file.size / chunkSize)
    const chunks: Omit<Chunk, 'hash'>[] = [] //最后添加hash
    let current = 0

    // 默认采用浏览器空闲调用模式
    const loadNext = async (idle: IdleDeadline) => {
      if (current < chunkNum && idle.timeRemaining()) {
        const start = current * chunkSize
        const end = start + chunkSize > file.size ? file.size : start + chunkSize
        const fileSlice = file.slice(start, end)
        try {
          spark.append(await fileSlice.arrayBuffer())
        } catch (error) {
          reject(error)
          return
        }
        chunks.push({
          chunkIndex: current,
          totalChunks: chunkNum,
          chunkSize,
          currentSize: fileSlice.size,
          totalSize: file.size,
          filename: file.name,
          webkitRelativePath: file.webkitRelativePath,
          file: fileSlice
        })
        current++

        if (current == chunkNum) {
          const hash = spark.end()
          const readyChunks = chunks.map((chunk) => ({ ...chunk, hash })) as Chunk[]
          const uploadFile = new UploadFile(uploader, file, hash, readyChunks)
          resolve(uploadFile)
          return
        }
      }

      window.requestIdleCallback(loadNext)
    }

    window.requestIdleCallback(loadNext)
  })
}
