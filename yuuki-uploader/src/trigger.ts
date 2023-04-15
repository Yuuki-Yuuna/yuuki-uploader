import Uploader from './uploader'

export type Trigger = Readonly<{
  clickTrigger: (event: MouseEvent) => void
  dragEnterTrigger: (event: DragEvent) => void
  dragOverTrigger: (event: DragEvent) => void
  dragLeaveTrigger: (event: DragEvent) => void
  dropTrigger: (event: DragEvent) => void
}>

export const createTrigger = (uploader: Uploader): Trigger => {
  const { multiple, directoryMode, accept } = uploader.options
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.multiple = multiple
  input.webkitdirectory = directoryMode

  input.addEventListener('change', () => {
    if (input.files) {
      uploader.addFileList(Array.from(input.files))
    }
    input.value = ''
  })

  const clickTrigger = (event: MouseEvent) => {
    event.preventDefault()
    input.click()
  }
  const dragEnterTrigger = (event: DragEvent) => {
    event.preventDefault()
    uploader.onDragEnter?.(event)
  }
  const dragOverTrigger = (event: DragEvent) => {
    event.preventDefault()
    uploader.onDragOver?.(event)
  }
  const dragLeaveTrigger = (event: DragEvent) => {
    event.preventDefault()
    uploader.onDragLeave?.(event)
  }
  const dropTrigger = (event: DragEvent) => {
    event.preventDefault()
    const files = event.dataTransfer?.files
    const fileList = files && Array.from(files).filter((file) => accept.includes(file.type))
    if (fileList) {
      uploader.addFileList(fileList)
    }
  }

  return {
    clickTrigger,
    dragEnterTrigger,
    dragOverTrigger,
    dragLeaveTrigger,
    dropTrigger
  }
}
