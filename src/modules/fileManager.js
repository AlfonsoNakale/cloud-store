import { MAX_FILES, MAX_SIZE_BYTES, MAX_SIZE_MB } from './constants.js'
import { supabase, BUCKET_NAME } from './supabaseClient.js'
import { uiManager } from './uiManager.js'
import { calculateTotalSize } from './utils.js'

window.fileManager = null

class FileManager {
  constructor() {
    this.uploadedFiles = []
    this.isUploading = false
    this.initializeEventListeners()

    // Add global handlers
    window.removeFile = this.removeFile.bind(this)
    window.handleDeleteFile = this.handleDeleteFile.bind(this)
    window.handleDeleteFolder = this.handleDeleteFolder.bind(this)
    window.handleFileDownload = this.handleFileDownload.bind(this)
    window.handleFileRename = this.handleFileRename.bind(this)
    window.handleCopyUrl = this.handleCopyUrl.bind(this)
    window.toggleFolder = this.toggleFolder.bind(this)
    window.handleFolderDownload = this.handleFolderDownload.bind(this)
    window.handleFolderRename = this.handleFolderRename.bind(this)
    this.urlCache = new Map()
    this.updateUIDebounced = this.debounce(this.updateUI.bind(this), 300)
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
    window.handleDeleteFolder = this.handleDeleteFolder.bind(this)

    // Create folder button handler
    const createFolderButton = document.querySelector('#v-create_folder')
    if (createFolderButton) {
      createFolderButton.addEventListener('click', async () => {
        // Create a modal/dialog for folder name input
        const folderName = prompt('Enter folder name:')
        if (folderName) {
          try {
            // Validate folder name
            if (!folderName.trim()) {
              throw new Error('Folder name cannot be empty')
            }

            // Check for special characters
            if (!/^[a-zA-Z0-9-_\s]+$/.test(folderName)) {
              throw new Error(
                'Folder name can only contain letters, numbers, spaces, hyphens, and underscores'
              )
            }

            await this.createFolder(folderName.trim())
          } catch (error) {
            uiManager.showError(error.message)
          }
        }
      })
    }
  }

  validateFile(file) {
    const errors = []

    if (file.size > MAX_SIZE_BYTES) {
      errors.push(`File ${file.name} exceeds maximum size of ${MAX_SIZE_MB}MB`)
    }

    // Add more validations as needed

    return errors
  }

  async handleFileSelection(event) {
    if (!event.target.files) return

    const newFiles = Array.from(event.target.files)
    const errors = newFiles.flatMap((file) => this.validateFile(file))

    if (errors.length > 0) {
      uiManager.showError(errors.join('\n'))
      return
    }

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

  async uploadFile(file, folderPath = '') {
    const filePath = folderPath
      ? `${folderPath}/${Date.now()}-${file.name}`
      : `${Date.now()}-${file.name}`
    return await supabase.storage.from(BUCKET_NAME).upload(filePath, file)
  }

  async retryOperation(operation, maxRetries = 3) {
    let lastError
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, i))
        )
      }
    }
    throw lastError
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
        this.retryOperation(() => this.uploadFile(file))
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
    try {
      // Group files by folder more efficiently
      const { filesByFolder, rootFiles } = files.reduce(
        (acc, file) => {
          const parts = file.name.split('/')
          if (parts.length > 1) {
            const folderName = parts[0]
            if (!acc.filesByFolder[folderName]) {
              acc.filesByFolder[folderName] = []
            }
            acc.filesByFolder[folderName].push({
              ...file,
              name: parts.slice(1).join('/'),
            })
          } else if (file.name !== '.folder') {
            acc.rootFiles.push(file)
          }
          return acc
        },
        { filesByFolder: {}, rootFiles: [] }
      )

      // Process folders and files in parallel
      const [folderElements, fileElements] = await Promise.all([
        Promise.all(
          Object.entries(filesByFolder).map(([name, files]) =>
            this.createFolderElement(name, files)
          )
        ),
        Promise.all(rootFiles.map((file) => this.createFileElement(file))),
      ])

      return [...folderElements, ...fileElements].join('')
    } catch (error) {
      console.error('Error creating file elements:', error)
      return '<p>Error loading files</p>'
    }
  }

  async createFolderElement(folderName, files) {
    try {
      const fileCount = files.filter((file) => file.name !== '.folder').length
      const folderId = Math.random().toString(36).substring(7)

      // Pre-fetch file elements to avoid [object Promise] issue
      const fileElements = await Promise.all(
        files
          .filter((file) => file.name !== '.folder')
          .map(async (file) => {
            const { data } = await supabase.storage
              .from(BUCKET_NAME)
              .getPublicUrl(`${folderName}/${file.name}`)

            return `
              <div id="file-item" class="folder-item">
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
                    <div id="v-url" class="intarective-icon view w-embed" 
                         onclick="window.open('${data.publicUrl}', '_blank')">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21.544 11.045C21.848 11.4713 22 11.6845 22 12C22 12.3155 21.848 12.5287 21.544 12.955C20.1779 14.8706 16.6892 19 12 19C7.31078 19 3.8221 14.8706 2.45604 12.955C2.15201 12.5287 2 12.3155 2 12C2 11.6845 2.15201 11.4713 2.45604 11.045C3.8221 9.12944 7.31078 5 12 5C16.6892 5 20.1779 9.12944 21.544 11.045Z" stroke="#1B114A" stroke-width="1.5"/>
                        <path d="M15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12Z" fill="#E4E6F1" stroke="#1B114A" stroke-width="1.5"/>
                      </svg>
                    </div>
                    <div id="v-download" class="intarective-icon download w-embed"
                         onclick="handleFileDownload('${folderName}/${
              file.name
            }', '${file.name}')">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#E4E6F1" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M12.0025 7.03857V14.0889ZM12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863Z" fill="currentColor"/>
                        <path d="M12.0025 7.03857V14.0889M12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                    </div>
                    <div id="v-rename" class="intarective-icon rename w-embed"
                         onclick="handleFileRename('${folderName}/${
              file.name
            }', '${file.name}')">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506Z" fill="#E4E6F1"/>
                        <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                        <path d="M18.9999 13.5C18.9999 16.7875 18.9999 18.4312 18.092 19.5376C17.9258 19.7401 17.7401 19.9258 17.5375 20.092C16.4312 21 14.7874 21 11.4999 21H11C7.22876 21 5.34316 21 4.17159 19.8284C3.00003 18.6569 3 16.7712 3 13V12.5C3 9.21252 3 7.56879 3.90794 6.46244C4.07417 6.2599 4.2599 6.07417 4.46244 5.90794C5.56879 5 7.21252 5 10.5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </div>
                    <div id="v-copy_url" class="intarective-icon copy_url w-embed"
                         onclick="handleCopyUrl('${data.publicUrl}')">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M7.99805 16H11.998M7.99805 11H15.998" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M7.5 3.5C5.9442 3.54667 5.01661 3.71984 4.37477 4.36227C3.49609 5.24177 3.49609 6.6573 3.49609 9.48836V15.9944C3.49609 18.8255 3.49609 20.241 4.37477 21.1205C5.25345 22 6.66767 22 9.49609 22H14.4961C17.3245 22 18.7387 22 19.6174 21.1205C20.4961 20.241 20.4961 18.8255 20.4961 15.9944V9.48836C20.4961 6.6573 20.4961 5.24177 19.6174 4.36228C18.9756 3.71984 18.048 3.54667 16.4922 3.5" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M7.49609 3.75C7.49609 2.7835 8.2796 2 9.24609 2H14.7461C15.7126 2 16.4961 2.7835 16.4961 3.75C16.4961 4.7165 15.7126 5.5 14.7461 5.5H9.24609C8.2796 5.5 7.49609 4.7165 7.49609 3.75Z" fill="#E4E6F1" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                      </svg>
                    </div>
                    <div id="v-delete" class="intarective-icon delete w-embed"
                         onclick="handleDeleteFile('${folderName}/${
              file.name
            }')">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M3 5.5H21ZM16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" fill="#E4E6F1"/>
                        <path d="M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M9.5 16.5V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M14.5 16.5V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            `
          })
      )

      return `
        <div class="file-item folder" id="folder-${folderId}">
          <div class="folder-content" onclick="toggleFolder('${folderId}')">
            <p id="v-name" class="paragraph">${folderName}</p>
            <div class="file-details">
              <p id="v-metadata" class="paragraph">${fileCount} files</p>
              <p id="v-created_at" class="paragraph">${new Date().toLocaleDateString()}</p>
              <div class="icon-wrapper">
                <div id="v-download" class="intarective-icon download w-embed"
                     onclick="handleFolderDownload('${folderName}'); event.stopPropagation();">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#E4E6F1" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M12.0025 7.03857V14.0889ZM12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863Z" fill="currentColor"/>
                    <path d="M12.0025 7.03857V14.0889M12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
                <div id="v-rename" class="intarective-icon rename w-embed"
                     onclick="handleFolderRename('${folderName}'); event.stopPropagation();">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506Z" fill="#E4E6F1"/>
                    <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div id="v-delete" class="intarective-icon delete w-embed" 
                     onclick="handleDeleteFolder('${folderName}'); event.stopPropagation();">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M3 5.5H21ZM16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" fill="#E4E6F1"/>
                    <path d="M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div id="folder-content-${folderId}" class="folder-item-wrapper" style="display: none;">
            ${fileElements.join('')}
          </div>
        </div>
      `
    } catch (error) {
      console.error('Error creating folder element:', error)
      return `<div class="error">Error loading folder ${folderName}</div>`
    }
  }

  async createFolder(folderName) {
    try {
      // Check if folder already exists
      const { data: existingFiles } = await supabase.storage
        .from(BUCKET_NAME)
        .list(folderName)

      if (existingFiles?.length > 0) {
        throw new Error('A folder with this name already exists')
      }

      // Create folder marker
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(`${folderName}/.folder`, new Blob([]))

      if (error) throw error

      // Update UI
      await this.updateUI(
        document.querySelector('#file-container, .file-container')
      )

      uiManager.showSuccess('Folder created successfully')
    } catch (error) {
      console.error('Error creating folder:', error)
      throw new Error(error.message || 'Failed to create folder')
    }
  }

  async handleDeleteFolder(folderPath) {
    if (
      !confirm(
        'Are you sure you want to delete this folder and all its contents?'
      )
    ) {
      return
    }

    try {
      // List all files in the folder
      const { data: files, error: listError } = await supabase.storage
        .from(BUCKET_NAME)
        .list(folderPath)

      if (listError) throw listError

      // Include the folder marker and all files in deletion
      const filePaths = [
        `${folderPath}/.folder`,
        ...files.map((file) => `${folderPath}/${file.name}`),
      ]

      const { error: deleteError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(filePaths)

      if (deleteError) throw deleteError

      await this.updateUI(
        document.querySelector('#file-container, .file-container')
      )

      uiManager.showSuccess('Folder deleted successfully')
    } catch (error) {
      console.error('Error deleting folder:', error)
      uiManager.showError('Failed to delete folder')
    }
  }

  async createFileElement(file, folderPath = '') {
    const { data } = await supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(folderPath ? `${folderPath}/${file.name}` : file.name)

    const filePath = folderPath ? `${folderPath}/${file.name}` : file.name
    const fileId = Math.random().toString(36).substring(7)

    // Check if this is a folder (has files inside)
    const isFolder = !file.metadata?.size

    if (isFolder) {
      // Get folder contents
      const { data: folderContents } = await supabase.storage
        .from(BUCKET_NAME)
        .list(file.name)

      const folderFiles =
        folderContents?.filter((f) => f.name !== '.folder') || []

      return `
        <div id="file-item-${fileId}" class="file-item folder">
          <div class="folder-content" onclick="toggleFolder('${fileId}')">
            <p id="v-name" class="paragraph">${file.name}</p>
            <div class="file-details">
              <p id="v-metadata" class="paragraph">${
                folderFiles.length
              } files</p>
              <p id="v-created_at" class="paragraph">${new Date(
                file.created_at
              ).toLocaleDateString()}</p>
              <div class="icon-wrapper">
                <div id="v-download" class="intarective-icon download w-embed"
                     onclick="handleFolderDownload('${
                       file.name
                     }'); event.stopPropagation();">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#E4E6F1" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M12.0025 7.03857V14.0889ZM12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863Z" fill="currentColor"/>
                    <path d="M12.0025 7.03857V14.0889M12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
                <div id="v-rename" class="intarective-icon rename w-embed"
                     onclick="handleFolderRename('${
                       file.name
                     }'); event.stopPropagation();">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506Z" fill="#E4E6F1"/>
                    <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div id="v-delete" class="intarective-icon delete w-embed" 
                     onclick="handleDeleteFolder('${
                       file.name
                     }'); event.stopPropagation();">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M3 5.5H21ZM16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" fill="#E4E6F1"/>
                    <path d="M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div id="folder-content-${fileId}" class="folder-item-wrapper" style="display: none;">
            ${
              folderFiles.length > 0
                ? folderFiles
                    .map((f) => this.createFileElement(f, file.name))
                    .join('')
                : '<p class="paragraph">No files in folder</p>'
            }
          </div>
        </div>
      `
    }

    // Regular file element
    return `
      <div id="file-item-${fileId}" class="folder-item">
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
            <div id="v-url-${fileId}" class="intarective-icon view w-embed" 
                 onclick="window.open('${data.publicUrl}', '_blank')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21.544 11.045C21.848 11.4713 22 11.6845 22 12C22 12.3155 21.848 12.5287 21.544 12.955C20.1779 14.8706 16.6892 19 12 19C7.31078 19 3.8221 14.8706 2.45604 12.955C2.15201 12.5287 2 12.3155 2 12C2 11.6845 2.15201 11.4713 2.45604 11.045C3.8221 9.12944 7.31078 5 12 5C16.6892 5 20.1779 9.12944 21.544 11.045Z" stroke="#1B114A" stroke-width="1.5"/>
                <path d="M15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12Z" fill="#E4E6F1" stroke="#1B114A" stroke-width="1.5"/>
              </svg>
            </div>
            <div id="v-download-${fileId}" class="intarective-icon download w-embed"
                 onclick="handleFileDownload('${filePath}', '${file.name}')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#E4E6F1" stroke="currentColor" stroke-width="1.5"/>
                <path d="M12.0025 7.03857V14.0889ZM12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863Z" fill="currentColor"/>
                <path d="M12.0025 7.03857V14.0889M12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </div>
            <div id="v-rename-${fileId}" class="intarective-icon rename w-embed"
                 onclick="handleFileRename('${filePath}', '${file.name}')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506Z" fill="#E4E6F1"/>
                <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                <path d="M18.9999 13.5C18.9999 16.7875 18.9999 18.4312 18.092 19.5376C17.9258 19.7401 17.7401 19.9258 17.5375 20.092C16.4312 21 14.7874 21 11.4999 21H11C7.22876 21 5.34316 21 4.17159 19.8284C3.00003 18.6569 3 16.7712 3 13V12.5C3 9.21252 3 7.56879 3.90794 6.46244C4.07417 6.2599 4.2599 6.07417 4.46244 5.90794C5.56879 5 7.21252 5 10.5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div id="v-copy_url-${fileId}" class="intarective-icon copy_url w-embed"
                 onclick="handleCopyUrl('${data.publicUrl}')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7.99805 16H11.998M7.99805 11H15.998" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M7.5 3.5C5.9442 3.54667 5.01661 3.71984 4.37477 4.36227C3.49609 5.24177 3.49609 6.6573 3.49609 9.48836V15.9944C3.49609 18.8255 3.49609 20.241 4.37477 21.1205C5.25345 22 6.66767 22 9.49609 22H14.4961C17.3245 22 18.7387 22 19.6174 21.1205C20.4961 20.241 20.4961 18.8255 20.4961 15.9944V9.48836C20.4961 6.6573 20.4961 5.24177 19.6174 4.36228C18.9756 3.71984 18.048 3.54667 16.4922 3.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M7.49609 3.75C7.49609 2.7835 8.2796 2 9.24609 2H14.7461C15.7126 2 16.4961 2.7835 16.4961 3.75C16.4961 4.7165 15.7126 5.5 14.7461 5.5H9.24609C8.2796 5.5 7.49609 4.7165 7.49609 3.75Z" fill="#E4E6F1" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              </svg>
            </div>
            <div id="v-delete-${fileId}" class="intarective-icon delete w-embed" 
                 onclick="handleDeleteFile('${filePath}')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M3 5.5H21ZM16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" fill="#E4E6F1"/>
                <path d="M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" stroke="#1B114A" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M9.5 16.5V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M14.5 16.5V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    `
  }

  async handleFileDownload(filePath, fileName) {
    try {
      const { data } = await supabase.storage
        .from(BUCKET_NAME)
        .download(filePath)

      if (!data) throw new Error('Failed to download file')

      // Create download link
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      a.remove()
    } catch (error) {
      console.error('Download failed:', error)
      uiManager.showError('Failed to download file')
    }
  }

  async handleFileRename(filePath, currentName) {
    try {
      const newName = prompt('Enter new file name:', currentName)
      if (!newName || newName === currentName) return

      // Get file data
      const { data } = await supabase.storage
        .from(BUCKET_NAME)
        .download(filePath)

      if (!data) throw new Error('Failed to get file')

      // Upload with new name
      const newPath = filePath.replace(currentName, newName)
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(newPath, data)

      if (uploadError) throw uploadError

      // Delete old file
      const { error: deleteError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([filePath])

      if (deleteError) throw deleteError

      // Update UI
      await this.updateUI(
        document.querySelector('#file-container, .file-container')
      )
      uiManager.showSuccess('File renamed successfully')
    } catch (error) {
      console.error('Rename failed:', error)
      uiManager.showError('Failed to rename file')
    }
  }

  async handleCopyUrl(url) {
    try {
      await navigator.clipboard.writeText(url)
      uiManager.showSuccess('URL copied to clipboard')
    } catch (error) {
      console.error('Copy failed:', error)
      uiManager.showError('Failed to copy URL')
    }
  }

  async toggleFolder(folderId) {
    const folderContent = document.getElementById(`folder-content-${folderId}`)
    if (!folderContent) return

    const isVisible = folderContent.style.display === 'block'

    // Toggle visibility
    folderContent.style.display = isVisible ? 'none' : 'block'
  }

  async getPublicUrl(path) {
    if (this.urlCache.has(path)) {
      return this.urlCache.get(path)
    }

    const { data } = await supabase.storage.from(BUCKET_NAME).getPublicUrl(path)

    this.urlCache.set(path, data.publicUrl)
    return data.publicUrl
  }

  debounce(func, wait) {
    let timeout
    return (...args) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func.apply(this, args), wait)
    }
  }

  async handleFolderDownload(folderName) {
    try {
      uiManager.showSuccess('Starting download...')
      // List all files in the folder
      const { data: files, error: listError } = await supabase.storage
        .from(BUCKET_NAME)
        .list(folderName)

      if (listError) throw listError

      // Filter out .folder marker
      const actualFiles = files.filter((file) => file.name !== '.folder')

      if (actualFiles.length === 0) {
        uiManager.showError('Folder is empty')
        return
      }

      // Create a zip file
      const zip = new window.JSZip()

      let downloadedFiles = 0
      const totalFiles = actualFiles.length

      // Download all files and add them to the zip
      for (const file of actualFiles) {
        try {
          const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(`${folderName}/${file.name}`)

          if (error) throw error

          if (data) {
            zip.file(file.name, data)
            downloadedFiles++
            uiManager.showSuccess(
              `Downloaded ${downloadedFiles} of ${totalFiles} files...`
            )
          }
        } catch (error) {
          console.error(`Failed to download ${file.name}:`, error)
        }
      }

      if (downloadedFiles === 0) {
        throw new Error('No files were downloaded successfully')
      }

      // Generate and download zip file
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${folderName}.zip`
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      a.remove()

      uiManager.showSuccess('Folder downloaded successfully')
    } catch (error) {
      console.error('Download failed:', error)
      uiManager.showError(error.message || 'Failed to download folder')
    }
  }

  async handleFolderRename(oldFolderName) {
    try {
      uiManager.showSuccess('Starting rename operation...')
      const newFolderName = prompt('Enter new folder name:', oldFolderName)
      if (!newFolderName || newFolderName === oldFolderName) return

      // Validate new folder name
      if (!newFolderName.trim()) {
        throw new Error('Folder name cannot be empty')
      }

      if (!/^[a-zA-Z0-9-_\s]+$/.test(newFolderName)) {
        throw new Error(
          'Folder name can only contain letters, numbers, spaces, hyphens, and underscores'
        )
      }

      // Check if new folder name already exists
      const { data: existingFolder } = await supabase.storage
        .from(BUCKET_NAME)
        .list(newFolderName)

      if (existingFolder?.length > 0) {
        throw new Error('A folder with this name already exists')
      }

      // List all files in the folder
      const { data: files, error: listError } = await supabase.storage
        .from(BUCKET_NAME)
        .list(oldFolderName)

      if (listError) throw listError

      let movedFiles = 0
      const totalFiles = files.length

      // Move all files to new folder
      for (const file of files) {
        try {
          const oldPath = `${oldFolderName}/${file.name}`
          const newPath = `${newFolderName}/${file.name}`

          // Copy file to new location
          const { error: copyError } = await supabase.storage
            .from(BUCKET_NAME)
            .copy(oldPath, newPath)

          if (copyError) throw copyError

          // Delete old file
          const { error: deleteError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([oldPath])

          if (deleteError) throw deleteError

          movedFiles++
          uiManager.showSuccess(`Moved ${movedFiles} of ${totalFiles} files...`)
        } catch (error) {
          console.error(`Failed to move ${file.name}:`, error)
        }
      }

      if (movedFiles === 0) {
        throw new Error('No files were moved successfully')
      }

      // Update UI
      await this.updateUI(
        document.querySelector('#file-container, .file-container')
      )
      uiManager.showSuccess('Folder renamed successfully')
    } catch (error) {
      console.error('Rename failed:', error)
      uiManager.showError(error.message || 'Failed to rename folder')
    }
  }
}

const fileManager = new FileManager()
window.fileManager = fileManager
export { fileManager }
