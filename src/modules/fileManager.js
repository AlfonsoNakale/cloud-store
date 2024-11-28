import { MAX_FILES, MAX_SIZE_BYTES, MAX_SIZE_MB } from './constants.js'
import { supabase, BUCKET_NAME } from './supabaseClient.js'
import { uiManager } from './uiManager.js'
import { calculateTotalSize } from './utils.js'

class FileManager {
  constructor() {
    this.uploadedFiles = []
    this.isUploading = false
    this.initializeEventListeners()
  }

  initializeEventListeners() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () =>
        this.setupEventListeners()
      )
    } else {
      this.setupEventListeners()
    }
  }

  setupEventListeners() {
    const { fileInput, uploadButton } = uiManager.elements

    if (fileInput) {
      fileInput.addEventListener('change', this.handleFileSelection.bind(this))
    }

    if (uploadButton) {
      uploadButton.addEventListener('click', this.handleFileUpload.bind(this))
    }

    // Global handlers
    window.removeFile = this.removeFile.bind(this)
    window.handleDeleteFile = this.handleDeleteFile.bind(this)
  }

  async handleFileSelection(event) {
    if (!event.target.files) return

    const newFiles = Array.from(event.target.files)
    const totalFiles = this.uploadedFiles.length + newFiles.length

    // Validate file count
    if (totalFiles > MAX_FILES) {
      uiManager.showError(
        `Maximum ${MAX_FILES} files allowed. Currently selected: ${this.uploadedFiles.length}`
      )
      return
    }

    // Validate total size
    const totalSize = calculateTotalSize([...this.uploadedFiles, ...newFiles])
    if (totalSize > MAX_SIZE_BYTES) {
      uiManager.showError(`Total size cannot exceed ${MAX_SIZE_MB}MB`)
      return
    }

    // Add files and update UI
    this.uploadedFiles.push(...newFiles)
    uiManager.updateFileList(this.uploadedFiles)
    uiManager.updateStateIcons(this.uploadedFiles.length, MAX_FILES)

    // Reset input
    event.target.value = ''
  }

  async uploadFile(file) {
    const filePath = `${Date.now()}-${file.name}`
    return await supabase.storage.from(BUCKET_NAME).upload(filePath, file)
  }

  async handleFileUpload() {
    if (this.isUploading || this.uploadedFiles.length === 0) {
      uiManager.showError(
        this.isUploading ? 'Upload in progress...' : 'No files selected'
      )
      return
    }

    this.isUploading = true
    uiManager.setLoading(true)
    uiManager.setFileInputEnabled(false)

    try {
      const uploadPromises = this.uploadedFiles.map((file) =>
        this.uploadFile(file)
      )
      const results = await Promise.allSettled(uploadPromises)

      const failures = results.filter((result) => result.status === 'rejected')

      if (failures.length > 0) {
        throw new Error(`Failed to upload ${failures.length} files`)
      }

      this.uploadedFiles = []
      uiManager.updateFileList([])
      uiManager.updateStateIcons(0, MAX_FILES)

      window.location.href = '/files'
    } catch (error) {
      console.error('Upload failed:', error)
      uiManager.showError('Upload failed. Please try again.')
    } finally {
      this.isUploading = false
      uiManager.setLoading(false)
      uiManager.setFileInputEnabled(true)
    }
  }

  removeFile(index) {
    if (index >= 0 && index < this.uploadedFiles.length) {
      this.uploadedFiles.splice(index, 1)
      uiManager.updateFileList(this.uploadedFiles)
      uiManager.updateStateIcons(this.uploadedFiles.length, MAX_FILES)
    }
  }

  async handleDeleteFile(filePath) {
    if (!confirm('Are you sure you want to delete this file?')) return

    try {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([filePath])

      if (error) throw error

      const container = document.querySelector(
        '#file-container, .file-container'
      )
      if (container) {
        this.updateUI(container)
      }
    } catch (error) {
      console.error('Error deleting file:', error)
      uiManager.showError('Failed to delete file')
    }
  }

  async updateUI(container) {
    if (!container) return

    try {
      const { data: files, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list()

      if (error) throw error

      container.innerHTML =
        files.length === 0
          ? '<p>No files uploaded yet...</p>'
          : await this.createFileElements(files)
    } catch (error) {
      console.error('Error updating UI:', error)
      container.innerHTML = '<p>Error loading files</p>'
    }
  }

  async createFileElements(files) {
    const elements = await Promise.all(
      files.map(async (file) => {
        const { data } = await supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(file.name)

        return `
        <div class="file-item">
          <p id="v-name" class="paragraph">${file.name}</p>
          <div class="file-details">
            <p id="v-metadata" class="paragraph">${(
              file.metadata?.size /
              1024 /
              1024
            ).toFixed(2)}MB</p>
            <p id="v-created_at" class="paragraph">${new Date(
              file.created_at
            ).toLocaleDateString()}</p>
            <div class="icon-wrapper">
              <a href="${
                data.publicUrl
              }" target="_blank" class="intarective-icon view">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21.544 11.045C21.848 11.4713 22 11.6845 22 12C22 12.3155 21.848 12.5287 21.544 12.955C20.1779 14.8706 16.6892 19 12 19C7.31078 19 3.8221 14.8706 2.45604 12.955C2.15201 12.5287 2 12.3155 2 12C2 11.6845 2.15201 11.4713 2.45604 11.045C3.8221 9.12944 7.31078 5 12 5C16.6892 5 20.1779 9.12944 21.544 11.045Z" stroke="#1B114A" stroke-width="1.5"/>
                  <path d="M15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12Z" fill="#E4E6F1" stroke="#1B114A" stroke-width="1.5"/>
                </svg>
              </a>
              <a href="${
                data.publicUrl
              }" download class="intarective-icon download">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#E4E6F1" stroke="#1B114A" stroke-width="1.5"/>
                  <path d="M12.0025 7.03857V14.0889ZM12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863Z" fill="#D9D9D9"/>
                  <path d="M12.0025 7.03857V14.0889M12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </a>
              <div class="intarective-icon delete" onclick="handleDeleteFile('${
                file.name
              }')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                  <path d="M3 5.5H21ZM16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" fill="#E4E6F1"/>
                  <path d="M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                  <path d="M9.5 16.5V10.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                  <path d="M14.5 16.5V10.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      `
      })
    )

    return elements.join('')
  }
}

export const fileManager = new FileManager()
