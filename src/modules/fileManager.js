import { MAX_FILES, MAX_SIZE_BYTES, MAX_SIZE_MB } from './constants.js'
import { uiManager } from './uiManager.js'
import { calculateTotalSize, simulateFileUpload } from './utils.js'

class FileManager {
  constructor() {
    this.uploadedFiles = []
    this.setupEventListeners()
  }

  setupEventListeners() {
    uiManager.elements.fileInput.addEventListener('change', (event) =>
      this.handleFileSelection(event)
    )
    uiManager.elements.uploadButton.addEventListener('click', () =>
      this.handleFileUpload()
    )
    // Make removeFile available globally
    window.removeFile = (index) => this.removeFile(index)
  }

  handleFileSelection(event) {
    const newFiles = Array.from(event.target.files)

    if (this.uploadedFiles.length + newFiles.length > MAX_FILES) {
      uiManager.showError(
        `You can only upload up to ${MAX_FILES} files. You currently have ${this.uploadedFiles.length} files.`
      )
      event.target.value = ''
      return
    }

    const totalSize = calculateTotalSize([...this.uploadedFiles, ...newFiles])
    if (totalSize > MAX_SIZE_BYTES) {
      uiManager.showError(
        `Total file size cannot exceed ${MAX_SIZE_MB}MB. Please remove add a file less then ${MAX_SIZE_MB}MB.`
      )
      event.target.value = ''
      return
    }

    this.uploadedFiles = [...this.uploadedFiles, ...newFiles]
    this.updateUI()
    event.target.value = ''
  }

  async handleFileUpload() {
    if (this.uploadedFiles.length === 0) {
      uiManager.showError('Please select files first')
      return
    }

    try {
      uiManager.setLoading(true)
      await Promise.all(this.uploadedFiles.map(simulateFileUpload))
      alert('Files uploaded successfully!')
      this.uploadedFiles = []
      this.updateUI()
    } catch (error) {
      console.error('Upload failed:', error)
      uiManager.showError('Upload failed. Please try again.')
    } finally {
      uiManager.setLoading(false)
    }
  }

  removeFile(index) {
    this.uploadedFiles.splice(index, 1)
    this.updateUI()
  }

  updateUI() {
    uiManager.updateFileList(this.uploadedFiles)
    uiManager.updateStateIcons(this.uploadedFiles.length, MAX_FILES)
    uiManager.setFileInputEnabled(this.uploadedFiles.length < MAX_FILES)
  }
}

export const fileManager = new FileManager()
