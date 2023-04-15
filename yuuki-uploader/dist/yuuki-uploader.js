import SparkMD5 from 'spark-md5';

class UploadFile {
  //merge追加参数
  constructor(uploader, file, hash, _chunks) {
    this.uploader = uploader;
    this.file = file;
    this.hash = hash;
    this._chunks = _chunks;
    this._status = "waiting";
    this._chunksStatus = new Array(_chunks.length).fill("waiting");
    this._xhrTestList = [];
    this._xhrList = [];
    this._retrys = new Array(_chunks.length).fill(0);
    this._chunksLoaded = new Array(_chunks.length).fill(0);
    this._progress = 0;
    this._currentSpeed = 0;
    this._averageSpeed = 0;
    this._lastTimestamp = Date.now();
    this.query = {};
    this.mergeAppend = {};
  }
  async upload() {
    if (this._status != "waiting") {
      return;
    }
    this._status = "uploading";
    const { precheck } = this.uploader.options;
    const result = await (precheck == null ? void 0 : precheck(this));
    if (result) {
      this._chunksLoaded = this._chunks.map((chunk) => chunk.file.size);
      this._status = "success";
      const { options, onFileSuccess } = this.uploader;
      if (Date.now() - this._lastTimestamp < options.progressCallbacksInterval) {
        this._updateProgress();
      }
      onFileSuccess == null ? void 0 : onFileSuccess(this);
      return;
    }
    this._checkProgess() && this._updateProgress();
    for (let current = 0; current < this._chunks.length; current++) {
      this.uploader.requestList.addRequest(this._uploadCurrentChunk(current));
    }
  }
  _uploadCurrentChunk(current) {
    return {
      file: this,
      start: async () => {
        try {
          const needUpload = await this._uploadChunkTest(current);
          needUpload && await this._uploadChunk(current);
        } catch (err) {
          throw new Error(err);
        }
      }
    };
  }
  //get测试方法(返回值决定是否需要上传)
  _uploadChunkTest(current) {
    return new Promise((resolve, reject) => {
      if (["paused", "failed"].includes(this._status)) {
        resolve(false);
      }
      this._chunksStatus[current] = "uploading";
      const { target, headers, successCodes, skipCodes, errorCodes } = this.uploader.options;
      const testChunk = { ...this._chunks[current] };
      Reflect.deleteProperty(testChunk, "file");
      const params = new URLSearchParams();
      for (const key in testChunk) {
        const value = testChunk[key].toString();
        params.append(key, value);
      }
      Object.keys(this.query).forEach((key) => params.append(key, this.query[key].toString()));
      const xhr = new XMLHttpRequest();
      this._xhrTestList[current] = xhr;
      xhr.addEventListener("load", () => {
        var _a, _b;
        if (successCodes.includes(xhr.status)) {
          resolve(true);
        } else if (skipCodes.includes(xhr.status)) {
          this._chunksLoaded[current] = this._chunks[current].currentSize;
          this._checkProgess() && this._updateProgress();
          this._chunksStatus[current] = "completed";
          resolve(false);
          if (this._chunksStatus.every((chunkStatus) => chunkStatus == "completed")) {
            this._status = "completed";
            (_b = (_a = this.uploader).onFileCompleted) == null ? void 0 : _b.call(_a, this);
            this._mergeFile();
          }
        } else if (errorCodes.includes(xhr.status)) {
          this._chunksStatus[current] = "failed";
          this._status = "failed";
          reject("there is a chunk failed to upload during the test");
        } else {
          retryUpload();
        }
      });
      xhr.addEventListener("abort", () => {
        this._chunksStatus[current] = "paused";
        this._status = "paused";
        resolve(false);
      });
      xhr.addEventListener("error", () => retryUpload());
      xhr.open("get", `${target}?${params.toString()}`);
      Object.keys(headers).forEach((name) => xhr.setRequestHeader(name, headers[name]));
      xhr.send();
      const retryUpload = () => {
        if (this._retrys[current] > 3) {
          this._chunksStatus[current] = "failed";
          this._status = "failed";
          reject("there is a chunk failed to upload during the test");
        } else {
          this._retrys[current]++;
          xhr.open("get", `${target}?${params.toString()}`);
          Object.keys(headers).forEach((name) => xhr.setRequestHeader(name, headers[name]));
          xhr.send();
        }
      };
    });
  }
  //实际上传方法
  _uploadChunk(current) {
    return new Promise((resolve, reject) => {
      if (["paused", "failed"].includes(this._status)) {
        resolve(false);
      }
      this._chunksStatus[current] = "uploading";
      const { target, headers, successCodes, errorCodes } = this.uploader.options;
      const chunk = this._chunks[current];
      const formData = new FormData();
      for (const key in chunk) {
        let value = chunk[key];
        value = typeof value == "number" ? value.toString() : value;
        formData.append(key, value);
      }
      Object.keys(this.query).forEach((key) => formData.append(key, this.query[key].toString()));
      const xhr = new XMLHttpRequest();
      this._xhrList[current] = xhr;
      xhr.addEventListener("load", () => {
        var _a, _b;
        if (successCodes.includes(xhr.status)) {
          this._chunksStatus[current] = "completed";
          resolve(true);
          if (this._chunksStatus.every((chunkStatus) => chunkStatus == "completed")) {
            this._status = "completed";
            (_b = (_a = this.uploader).onFileCompleted) == null ? void 0 : _b.call(_a, this);
            this._mergeFile();
          }
        } else if (errorCodes.includes(xhr.status)) {
          this._chunksStatus[current] = "failed";
          this._status = "failed";
          reject("there is a chunk failed to upload during the test");
        } else {
          retryUpload();
        }
      });
      xhr.addEventListener("abort", () => {
        this._chunksStatus[current] = "paused";
        this._status = "paused";
        resolve(false);
      });
      xhr.addEventListener("error", () => retryUpload());
      xhr.upload.addEventListener("progress", (event) => {
        this._chunksLoaded[current] = event.loaded / event.total * this._chunks[current].currentSize;
        this._checkProgess() && this._updateProgress();
      });
      xhr.open("post", target);
      Object.keys(headers).forEach((name) => xhr.setRequestHeader(name, headers[name]));
      xhr.send(formData);
      const retryUpload = () => {
        if (this._retrys[current] > 3) {
          this._chunksStatus[current] = "failed";
          this._status = "failed";
          reject("there is a chunk failed to upload during the test");
        } else {
          this._retrys[current]++;
          xhr.open("post", target);
          Object.keys(headers).forEach((name) => xhr.setRequestHeader(name, headers[name]));
          xhr.send(formData);
        }
      };
    });
  }
  _mergeFile() {
    if (this._status != "completed") {
      return;
    }
    const { mergeTarget, headers, chunkSize, progressCallbacksInterval, successCodes, errorCodes } = this.uploader.options;
    if (Date.now() - this._lastTimestamp < progressCallbacksInterval) {
      this._updateProgress();
    }
    const xhr = new XMLHttpRequest();
    const { name, size, webkitRelativePath } = this.file;
    const data = {
      ...this.mergeAppend,
      totalChunks: this._chunks.length,
      chunkSize,
      filename: name,
      //文件名
      totalSize: size,
      hash: this.hash,
      webkitRelativePath
      //上传文件夹时文件路径,
    };
    this.uploader.requestList.addRequest({
      file: this,
      start: () => {
        return new Promise((resolve, reject) => {
          let retry = 0;
          xhr.addEventListener("load", () => {
            var _a, _b;
            if (successCodes.includes(xhr.status)) {
              this._status = "success";
              resolve();
              (_b = (_a = this.uploader).onFileSuccess) == null ? void 0 : _b.call(_a, this);
            } else if (errorCodes.includes(xhr.status)) {
              this._status = "failed";
              reject("there is a file failed to merge during the test");
            } else {
              retryUpload();
            }
          });
          xhr.addEventListener("error", () => retryUpload());
          xhr.open("post", mergeTarget);
          Object.keys(headers).forEach((name2) => xhr.setRequestHeader(name2, headers[name2]));
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.send(JSON.stringify(data));
          const retryUpload = () => {
            if (retry > 3) {
              this._status = "failed";
              reject("there is a file failed to merge during the test");
            } else {
              retry++;
              xhr.open("post", mergeTarget);
              Object.keys(headers).forEach((name2) => xhr.setRequestHeader(name2, headers[name2]));
              xhr.setRequestHeader("Content-Type", "application/json");
              xhr.send(JSON.stringify(data));
            }
          };
        });
      }
    });
  }
  //进度回调节流(过小会测不准，不确定性原理(doge))
  _checkProgess() {
    return Date.now() - this._lastTimestamp >= this.uploader.options.progressCallbacksInterval;
  }
  //更新进度，需节流(通过check实现)
  _updateProgress() {
    var _a, _b;
    const timestamp = Date.now();
    const delta = timestamp - this._lastTimestamp;
    if (!delta) {
      return;
    }
    const smoothingFactor = 0.1;
    const loaded = this._chunksLoaded.reduce((pre, chunkLoaded) => pre + chunkLoaded);
    const newProgress = loaded / this.file.size;
    const increase = Math.max((newProgress - this._progress) * this.file.size, 0);
    const currentSpeed = increase / delta * 1e3;
    this._currentSpeed = currentSpeed;
    this._averageSpeed = smoothingFactor * currentSpeed + (1 - smoothingFactor) * this._averageSpeed;
    this._lastTimestamp = timestamp;
    this._progress = newProgress;
    (_b = (_a = this.uploader).onFileProgress) == null ? void 0 : _b.call(_a, this);
  }
  pause() {
    var _a, _b;
    this._status = "paused";
    this._xhrTestList.forEach((item) => item == null ? void 0 : item.abort());
    this._xhrList.forEach((item) => item == null ? void 0 : item.abort());
    this._currentSpeed = 0;
    this._averageSpeed = 0;
    (_b = (_a = this.uploader).onFilePaused) == null ? void 0 : _b.call(_a, this);
  }
  cancel() {
    this.pause();
    const index = this.uploader.uploadList.findIndex((item) => item.file.name == this.file.name);
    if (index !== -1) {
      this.uploader.uploadList.splice(index, 1);
    }
  }
  resume() {
    if (this._status != "paused") {
      return;
    }
    this._status = "uploading";
    for (let current = 0; current < this._chunks.length; current++) {
      if (["waiting", "paused"].includes(this._chunksStatus[current])) {
        this.uploader.requestList.addRequest(this._uploadCurrentChunk(current));
      }
    }
  }
  get status() {
    return this._status;
  }
  get progress() {
    return this._progress;
  }
  get currentSpeed() {
    return this._currentSpeed;
  }
  get averageSpeed() {
    return this._averageSpeed;
  }
}

const calculateFile = (file, uploader) => {
  return new Promise((resolve, reject) => {
    const { chunkSize } = uploader.options;
    const spark = new SparkMD5.ArrayBuffer();
    const chunkNum = Math.ceil(file.size / chunkSize);
    const chunks = [];
    let current = 0;
    const loadNext = async (idle) => {
      if (current < chunkNum && idle.timeRemaining()) {
        const start = current * chunkSize;
        const end = start + chunkSize > file.size ? file.size : start + chunkSize;
        const fileSlice = file.slice(start, end);
        try {
          spark.append(await fileSlice.arrayBuffer());
        } catch (error) {
          reject(error);
          return;
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
        });
        current++;
        if (current == chunkNum) {
          const hash = spark.end();
          const readyChunks = chunks.map((chunk) => ({ ...chunk, hash }));
          const uploadFile = new UploadFile(uploader, file, hash, readyChunks);
          resolve(uploadFile);
          return;
        }
      }
      window.requestIdleCallback(loadNext);
    };
    window.requestIdleCallback(loadNext);
  });
};

const createTrigger = (uploader) => {
  const { multiple, directoryMode, accept } = uploader.options;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.multiple = multiple;
  input.webkitdirectory = directoryMode;
  input.addEventListener("change", () => {
    if (input.files) {
      uploader.addFileList(Array.from(input.files));
    }
    input.value = "";
  });
  const clickTrigger = (event) => {
    event.preventDefault();
    input.click();
  };
  const dragEnterTrigger = (event) => {
    var _a;
    event.preventDefault();
    (_a = uploader.onDragEnter) == null ? void 0 : _a.call(uploader, event);
  };
  const dragOverTrigger = (event) => {
    var _a;
    event.preventDefault();
    (_a = uploader.onDragOver) == null ? void 0 : _a.call(uploader, event);
  };
  const dragLeaveTrigger = (event) => {
    var _a;
    event.preventDefault();
    (_a = uploader.onDragLeave) == null ? void 0 : _a.call(uploader, event);
  };
  const dropTrigger = (event) => {
    var _a;
    event.preventDefault();
    const files = (_a = event.dataTransfer) == null ? void 0 : _a.files;
    const fileList = files && Array.from(files).filter((file) => accept.includes(file.type));
    if (fileList) {
      uploader.addFileList(fileList);
    }
  };
  return {
    clickTrigger,
    dragEnterTrigger,
    dragOverTrigger,
    dragLeaveTrigger,
    dropTrigger
  };
};

class RequestList {
  //上传器的请求队列，用于控制并发
  constructor(_uploader) {
    this._uploader = _uploader;
    this.items = [];
    this._currentRequest = 0;
  }
  addRequest(uploadRequest) {
    if (this.items.length) {
      this.items.push(uploadRequest);
    } else {
      this.items.push(uploadRequest);
      this._requestNext();
    }
  }
  _requestNext() {
    const { concurrency } = this._uploader.options;
    while (this._currentRequest < concurrency && this.items.length) {
      this._currentRequest++;
      const uploadRequest = this.items.shift();
      uploadRequest.start().then(() => {
        this._currentRequest--;
        if (this.items.length) {
          this._requestNext();
        }
      }).catch((err) => {
        var _a, _b;
        this._currentRequest--;
        (_b = (_a = this._uploader).onFileFailed) == null ? void 0 : _b.call(_a, uploadRequest.file, err);
      });
    }
  }
  get currentRequest() {
    return this._currentRequest;
  }
}

const defaultOptions = {
  target: "/",
  mergeTarget: "/",
  accept: "",
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
};
class Uploader {
  //一个文件正在上传时反复调用
  constructor(options) {
    this.options = { ...defaultOptions, ...options };
    this.fileList = [];
    this.uploadList = [];
    this.requestList = new RequestList(this);
    this._trigger = createTrigger(this);
  }
  register(element) {
    const { clickTrigger } = this._trigger;
    element.addEventListener("click", clickTrigger);
  }
  unRegister(element) {
    const { clickTrigger } = this._trigger;
    element.removeEventListener("click", clickTrigger);
  }
  registerDrop(element) {
    const { dragEnterTrigger, dragOverTrigger, dragLeaveTrigger, dropTrigger } = this._trigger;
    element.addEventListener("dragenter", dragEnterTrigger);
    element.addEventListener("dragover", dragOverTrigger);
    element.addEventListener("dragleave", dragLeaveTrigger);
    element.addEventListener("drop", dropTrigger);
  }
  unRegisterDrop(element) {
    const { dragEnterTrigger, dragOverTrigger, dragLeaveTrigger, dropTrigger } = this._trigger;
    element.removeEventListener("dragenter", dragEnterTrigger);
    element.removeEventListener("dragover", dragOverTrigger);
    element.removeEventListener("dragleave", dragLeaveTrigger);
    element.removeEventListener("drop", dropTrigger);
  }
  async addFile(file) {
    var _a, _b, _c;
    const result = (_b = await ((_a = this.onFileAdded) == null ? void 0 : _a.call(this, file))) != null ? _b : true;
    if (!result) {
      return;
    }
    if (this.options.replaceMode) {
      this.fileList.splice(0, this.fileList.length);
    }
    try {
      const uploadFile = await calculateFile(file, this);
      const index = this.fileList.findIndex((item) => item.file.name == uploadFile.file.name);
      if (index === -1) {
        this.fileList.push(uploadFile);
      } else {
        this.fileList[index] = uploadFile;
      }
      (_c = this.onFileReady) == null ? void 0 : _c.call(this, uploadFile);
    } catch (err) {
      throw new Error("there are some mistakes when file added.");
    }
  }
  async addFileList(fileList) {
    if (this.options.replaceMode) {
      this.fileList.splice(0, this.fileList.length);
    }
    for (const file of fileList) {
      await this.addFile(file);
    }
  }
  removeFile(uploadFile) {
    var _a;
    const index = this.fileList.findIndex((item) => item.file.name == uploadFile.file.name);
    if (index !== -1) {
      this.fileList.splice(index, 1);
      (_a = this.onFileRemoved) == null ? void 0 : _a.call(this, uploadFile);
    }
  }
  //开始上传待传队列的所有文件
  upload() {
    while (this.fileList.length) {
      const uploadFile = this.fileList.shift();
      uploadFile.upload();
      this.uploadList.push(uploadFile);
    }
  }
  //暂停全部
  pause() {
    this.uploadList.forEach((item) => item.pause());
  }
  //取消全部
  cancel() {
    this.uploadList.forEach((item) => item.cancel());
  }
}

export { Uploader as default };
