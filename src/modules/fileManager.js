import { MAX_FILES, MAX_SIZE_BYTES, MAX_SIZE_MB } from './constants.js'
import { supabase, BUCKET_NAME } from './supabaseClient.js'
import { supabaseTables } from './supabaseTables.js'
import { uiManager } from './uiManager.js'
import { calculateTotalSize } from './utils.js'

window.fileManager = null

class FileManager {
  constructor() {
    this.uploadedFiles = []
    this.isUploading = false
    this.selectedFolder = ''
    this.initializeEventListeners()

    // Add global handlers
    window.handleFileRemove = this.removeFile.bind(this)
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

    // Load folders when instance is created
    this.loadFolders()
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
    // Find both file inputs
    const fileInputs = [
      document.querySelector('#file-input'),
      document.querySelector('#v-file-input'),
    ].filter(Boolean)

    fileInputs.forEach((fileInput) => {
      if (fileInput) {
        fileInput.setAttribute('multiple', 'true')
        fileInput.addEventListener(
          'change',
          this.handleFileSelection.bind(this)
        )
      }
    })

    const uploadButton = document.querySelector('#uploadFile')

    if (uploadButton) {
      uploadButton.addEventListener('click', this.handleFileUpload.bind(this))
    }

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
      event.target.value = ''
      return
    }

    const totalFiles = this.uploadedFiles.length + newFiles.length

    // Validate file count
    if (totalFiles > MAX_FILES) {
      uiManager.showError(
        `Only  a maximum ${MAX_FILES} files allowed. Currently selected: ${totalFiles}`
      )
      event.target.value = ''
      return
    }

    // Validate total size
    const totalSize = calculateTotalSize([...this.uploadedFiles, ...newFiles])
    if (totalSize > MAX_SIZE_BYTES) {
      uiManager.showError(`Total size cannot exceed ${MAX_SIZE_MB}MB`)
      event.target.value = ''
      return
    }

    // If this is the file-input element, upload files directly
    if (event.target.id === 'file-input') {
      try {
        uiManager.showSuccess('Files are being uploaded...')
        this.isUploading = true
        uiManager.setLoading(true)

        const uploadPromises = newFiles.map((file) => {
          const filePath = `${Date.now()}-${file.name}`
          return this.uploadFile(file, filePath)
        })

        const results = await Promise.allSettled(uploadPromises)
        const failures = results.filter(
          (result) => result.status === 'rejected'
        )

        if (failures.length > 0) {
          throw new Error(`Failed to upload ${failures.length} files`)
        }

        uiManager.showSuccess('Files uploaded successfully')

        // Refresh the file list
        const container = document.querySelector(
          '#file-container, .file-container'
        )
        if (container) {
          await this.updateUI(container)
        }
      } catch (error) {
        console.error('Upload failed:', error)
        uiManager.showError('Upload failed. Please try again.')
      } finally {
        this.isUploading = false
        uiManager.setLoading(false)
        event.target.value = ''
      }
    } else {
      // For other file inputs, add to upload queue as before
      this.uploadedFiles.push(...newFiles)
      this.updateFileListUI()
      event.target.value = ''
    }
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
      // If there's a selected folder, get its ID first
      let selectedFolderId = null
      if (this.selectedFolder) {
        const { data: folderData } = await supabaseTables.createFolder(
          this.selectedFolder
        )
        if (folderData) {
          selectedFolderId = folderData.id
        }
      }

      const uploadPromises = this.uploadedFiles.map(async (file) => {
        try {
          const filePath = this.selectedFolder
            ? `${this.selectedFolder}/${Date.now()}-${file.name}`
            : `${Date.now()}-${file.name}`

          // Upload to storage and insert into database
          const uploadResult = await this.retryOperation(() =>
            this.uploadFile(file, filePath, selectedFolderId)
          )

          return uploadResult
        } catch (error) {
          console.error('Error processing file:', file.name, error)
          throw error
        }
      })

      const results = await Promise.allSettled(uploadPromises)
      const failures = results.filter((result) => result.status === 'rejected')

      if (failures.length > 0) {
        console.error('Failed uploads:', failures)
        throw new Error(`Failed to upload ${failures.length} files`)
      }

      // Clear the upload queue and update UI
      this.uploadedFiles = []
      this.updateFileListUI()
      uiManager.updateStateIcons(0, MAX_FILES)
      uiManager.showSuccess('Files uploaded successfully')

      // Refresh the file list
      await this.updateUI(
        document.querySelector('#file-container, .file-container')
      )
    } catch (error) {
      console.error('Upload failed:', error)
      uiManager.showError('Upload failed. Please try again.')
    } finally {
      this.isUploading = false
      uiManager.setLoading(false)
      uiManager.setFileInputEnabled(true)
    }
  }

  async removeFile(index) {
    if (index >= 0 && index < this.uploadedFiles.length) {
      try {
        const fileElement = document.getElementById(`file-${index}`)
        if (fileElement) {
          const loader = fileElement.querySelector('.s-removeFileLoader')
          const removeButton = fileElement.querySelector('.s-removeFile')

          if (loader && removeButton) {
            loader.style.display = 'block'
            removeButton.style.display = 'none'
          }

          // Add animation
          fileElement.style.opacity = '0.5'

          // Simulate removal delay for better UX
          await new Promise((resolve) => setTimeout(resolve, 500))

          this.uploadedFiles.splice(index, 1)
          this.updateFileListUI()

          // If no files left, show empty placeholder
          if (this.uploadedFiles.length === 0) {
            const emptyPlaceholder =
              document.getElementById('s-emptyPlaceholder')
            if (emptyPlaceholder) {
              emptyPlaceholder.style.display = 'block'
            }
          }
        }
      } catch (error) {
        console.error('Error removing file:', error)
        uiManager.showError('Failed to remove file')
      }
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

      // Add upload button to folder header
      const folderHeader = `
        <div class="folder-content" onclick="toggleFolder('${folderId}')">
          <p id="v-name" class="paragraph">${folderName}</p>
          <div class="file-details">
            <p id="v-metadata" class="paragraph">${fileCount} files</p>
            <p id="v-created_at" class="paragraph">${new Date().toLocaleDateString()}</p>
            <div class="icon-wrapper">
              <!-- Upload button first -->
              <div id="v-upload-${folderId}" class="intarective-icon upload w-embed"
                   onclick="event.stopPropagation(); fileManager.handleFolderUpload('${folderName}')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#fff" stroke="#333" stroke-width="1.5"/>
                  <path d="M12.0025 16.9614V9.91113M12.0025 9.91113C11.6764 9.90673 11.3547 10.1309 11.1174 10.4044L9.52789 12.1871M12.0025 9.91113C12.3171 9.91533 12.6357 10.1382 12.8876 10.4045L14.4864 12.1871M16.0137 6.96143L8.01367 6.96143" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
              <!-- Download button -->
              <div id="v-download" class="intarective-icon download w-embed"
                   onclick="handleFolderDownload('${folderName}'); event.stopPropagation();">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#E4E6F1" stroke="#333" stroke-width="1.5"/>
                  <path d="M12.0025 7.03857V14.0889M12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
              <!-- Rename button -->
              <div id="v-rename" class="intarective-icon rename w-embed"
                   onclick="handleFolderRename('${folderName}'); event.stopPropagation();">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506Z" fill="#E4E6F1"/>
                  <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
                </svg>
              </div>
              <!-- Delete button -->
              <div id="v-delete" class="intarective-icon delete w-embed"
                   onclick="handleDeleteFolder('${folderName}'); event.stopPropagation();">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                  <path d="M3 5.5H21ZM16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" fill="#FFF"/>
                  <path d="M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                  <path d="M9.5 16.5V10.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                  <path d="M14.5 16.5V10.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      `

      // Pre-fetch file elements to avoid [object Promise] issue
      const fileElements = await Promise.all(
        files
          .filter((file) => file.name !== '.folder')
          .map(async (file) => {
            const { data } = await supabase.storage
              .from(BUCKET_NAME)
              .getPublicUrl(`${folderName}/${file.name}`)

            return `
              <div id="file-item-${folderId}" class="file-item folder">
                <div class="folder-content" onclick="toggleFolder('${folderId}')">
                  <p id="v-name" class="paragraph">${folderName}</p>
                  <div class="file-details">
                    <p id="v-metadata" class="paragraph">${fileCount} files</p>
                    <p id="v-created_at" class="paragraph">${new Date().toLocaleDateString()}</p>
                    <div class="icon-wrapper">
                      <!-- Add upload button -->
                      <div id="v-upload-${folderId}" class="intarective-icon upload w-embed"
                           onclick="event.stopPropagation(); document.getElementById('folder-upload-${folderId}').click()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#fff" stroke="#333" stroke-width="1.5"></path>
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
                        <path d="M21.544 11.045C21.848 11.4713 22 11.6845 22 12C22 12.3155 21.848 12.5287 21.544 12.955C20.1779 14.8706 16.6892 19 12 19C7.31078 19 3.8221 14.8706 2.45604 12.955C2.15201 12.5287 2 12.3155 2 12C2 11.6845 2.15201 11.4713 2.45604 11.045C3.8221 9.12944 7.31078 5 12 5C16.6892 5 20.1779 9.12944 21.544 11.045Z" stroke="#333" stroke-width="1.5"/>
                        <path d="M15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12Z" fill="#E4E6F1" stroke="#1B114A" stroke-width="1.5"/>
                      </svg>
                    </div>
                    <div id="v-download" class="intarective-icon download w-embed"
                         onclick="handleFileDownload('${folderName}/${
              file.name
            }', '${file.name}')">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#FFF" stroke="#333" stroke-width="1.5"/>
                        <path d="M12.0025 7.03857V14.0889ZM12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863Z" fill="#FFF"/>
                        <path d="M12.0025 7.03857V14.0889M12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                    </div>
                    <div id="v-rename" class="intarective-icon rename w-embed"
                         onclick="handleFileRename('${folderName}/${
              file.name
            }', '${file.name}')">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506Z" fill="#FFF"/>
                        <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
                        <path d="M18.9999 13.5C18.9999 16.7875 18.9999 18.4312 18.092 19.5376C17.9258 19.7401 17.7401 19.9258 17.5375 20.092C16.4312 21 14.7874 21 11.4999 21H11C7.22876 21 5.34316 21 4.17159 19.8284C3.00003 18.6569 3 16.7712 3 13V12.5C3 9.21252 3 7.56879 3.90794 6.46244C4.07417 6.2599 4.2599 6.07417 4.46244 5.90794C5.56879 5 7.21252 5 10.5 5" stroke="#333" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </div>
                    <div id="v-copy_url" class="intarective-icon copy_url w-embed"
                         onclick="handleCopyUrl('${data.publicUrl}')">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M7.99805 16H11.998M7.99805 11H15.998" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
<path d="M7.5 3.5C5.9442 3.54667 5.01661 3.71984 4.37477 4.36227C3.49609 5.24177 3.49609 6.6573 3.49609 9.48836V15.9944C3.49609 18.8255 3.49609 20.241 4.37477 21.1205C5.25345 22 6.66767 22 9.49609 22H14.4961C17.3245 22 18.7387 22 19.6174 21.1205C20.4961 20.241 20.4961 18.8255 20.4961 15.9944V9.48836C20.4961 6.6573 20.4961 5.24177 19.6174 4.36228C18.9756 3.71984 18.048 3.54667 16.4922 3.5" stroke="#333" stroke-width="1.5"/>
<path d="M7.49609 3.75C7.49609 2.7835 8.2796 2 9.24609 2H14.7461C15.7126 2 16.4961 2.7835 16.4961 3.75C16.4961 4.7165 15.7126 5.5 14.7461 5.5H9.24609C8.2796 5.5 7.49609 4.7165 7.49609 3.75Z" fill="#FFF" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
</svg>
                    </div>
                    <div id="v-delete" class="intarective-icon delete w-embed"
                         onclick="handleDeleteFile('${folderName}/${
              file.name
            }')">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
<path d="M3 5.5H21ZM16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" fill="#FFF"/>
<path d="M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
<path d="M9.5 16.5V10.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
<path d="M14.5 16.5V10.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
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
          ${folderHeader}
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
      // Validate folder name
      if (!folderName?.trim()) {
        throw new Error('Folder name cannot be empty')
      }

      // Check for special characters
      if (!/^[a-zA-Z0-9-_\s]+$/.test(folderName)) {
        throw new Error(
          'Folder name can only contain letters, numbers, spaces, hyphens, and underscores'
        )
      }

      // Create folder in storage
      const { error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(`${folderName}/.folder`, new Blob([]))

      if (storageError) throw storageError

      // Create or get folder in database
      const { data: folderData, error: dbError } =
        await supabaseTables.createFolder(folderName)

      if (dbError) throw dbError

      // Update UI
      await this.updateUI(
        document.querySelector('#file-container, .file-container')
      )
      uiManager.showSuccess('Folder created successfully')

      return folderData
    } catch (error) {
      console.error('Error creating folder:', error)
      uiManager.showError(error.message || 'Failed to create folder')
      throw error
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
                <!-- Add upload button first -->
                <div id="v-upload-${fileId}" class="intarective-icon upload w-embed"
                     onclick="event.stopPropagation(); fileManager.handleFolderUpload('${
                       file.name
                     }')">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#FFF" stroke="#333" stroke-width="1.5"/>
                    <path d="M12.0025 16.9614V9.91113M12.0025 9.91113C11.6764 9.90673 11.3547 10.1309 11.1174 10.4044L9.52789 12.1871M12.0025 9.91113C12.3171 9.91533 12.6357 10.1382 12.8876 10.4045L14.4864 12.1871M16.0137 6.96143L8.01367 6.96143" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
                <!-- Download button -->
                <div id="v-download" class="intarective-icon download w-embed"
                     onclick="handleFolderDownload('${
                       file.name
                     }'); event.stopPropagation();">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#FFF" stroke="#333" stroke-width="1.5"/>
<path d="M12.0025 7.03857V14.0889ZM12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863Z" fill="#333"/>
<path d="M12.0025 7.03857V14.0889M12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
</svg>
                </div>
                <!-- Rename button -->
                <div id="v-rename" class="intarective-icon rename w-embed"
                     onclick="handleFolderRename('${
                       file.name
                     }'); event.stopPropagation();">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506Z" fill="#FFF"/>
<path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M18.9999 13.5C18.9999 16.7875 18.9999 18.4312 18.092 19.5376C17.9258 19.7401 17.7401 19.9258 17.5375 20.092C16.4312 21 14.7874 21 11.4999 21H11C7.22876 21 5.34316 21 4.17159 19.8284C3.00003 18.6569 3 16.7712 3 13V12.5C3 9.21252 3 7.56879 3.90794 6.46244C4.07417 6.2599 4.2599 6.07417 4.46244 5.90794C5.56879 5 7.21252 5 10.5 5" stroke="#333" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
                </div>
                <!-- Delete button -->
                <div id="v-delete" class="intarective-icon delete w-embed" 
                     onclick="handleDeleteFolder('${
                       file.name
                     }'); event.stopPropagation();">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M3 5.5H21ZM16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" fill="#FFF"/>
                    <path d="M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M9.5 16.5V10.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M14.5 16.5V10.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div id="folder-content-${fileId}" class="folder-item-wrapper" style="display: none;">
            ${
              folderFiles.length > 0
                ? await Promise.all(
                    folderFiles.map(
                      async (f) => await this.createFileElement(f, file.name)
                    )
                  ).then((elements) => elements.join(''))
                : '<p class="paragraph folder">No files in folder</p>'
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
                <path d="M21.544 11.045C21.848 11.4713 22 11.6845 22 12C22 12.3155 21.848 12.5287 21.544 12.955C20.1779 14.8706 16.6892 19 12 19C7.31078 19 3.8221 14.8706 2.45604 12.955C2.15201 12.5287 2 12.3155 2 12C2 11.6845 2.15201 11.4713 2.45604 11.045C3.8221 9.12944 7.31078 5 12 5C16.6892 5 20.1779 9.12944 21.544 11.045Z" stroke="#333" stroke-width="1.5"/>
                <path d="M15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12Z" fill="#FFF" stroke="#333" stroke-width="1.5"/>
              </svg>
            </div>
            <div id="v-download-${fileId}" class="intarective-icon download w-embed"
                 onclick="handleFileDownload('${filePath}', '${file.name}')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" fill="#FFF" stroke="#333" stroke-width="1.5"/>
<path d="M12.0025 7.03857V14.0889ZM12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863Z" fill="#FFF"/>
<path d="M12.0025 7.03857V14.0889M12.0025 14.0889C12.3286 14.0933 12.6503 13.8691 12.8876 13.5956L14.4771 11.8129M12.0025 14.0889C11.6879 14.0847 11.3693 13.8618 11.1174 13.5955L9.51864 11.8129M7.98633 17.0386H15.9863" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
</svg>
            </div>
            <div id="v-rename-${fileId}" class="intarective-icon rename w-embed"
                 onclick="handleFileRename('${filePath}', '${file.name}')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506Z" fill="#FFF"/>
                <path d="M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
                <path d="M18.9999 13.5C18.9999 16.7875 18.9999 18.4312 18.092 19.5376C17.9258 19.7401 17.7401 19.9258 17.5375 20.092C16.4312 21 14.7874 21 11.4999 21H11C7.22876 21 5.34316 21 4.17159 19.8284C3.00003 18.6569 3 16.7712 3 13V12.5C3 9.21252 3 7.56879 3.90794 6.46244C4.07417 6.2599 4.2599 6.07417 4.46244 5.90794C5.56879 5 7.21252 5 10.5 5" stroke="#333" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div id="v-copy_url-${fileId}" class="intarective-icon copy_url w-embed"
                 onclick="handleCopyUrl('${data.publicUrl}')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M7.99805 16H11.998M7.99805 11H15.998" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
<path d="M7.5 3.5C5.9442 3.54667 5.01661 3.71984 4.37477 4.36227C3.49609 5.24177 3.49609 6.6573 3.49609 9.48836V15.9944C3.49609 18.8255 3.49609 20.241 4.37477 21.1205C5.25345 22 6.66767 22 9.49609 22H14.4961C17.3245 22 18.7387 22 19.6174 21.1205C20.4961 20.241 20.4961 18.8255 20.4961 15.9944V9.48836C20.4961 6.6573 20.4961 5.24177 19.6174 4.36228C18.9756 3.71984 18.048 3.54667 16.4922 3.5" stroke="#333" stroke-width="1.5"/>
<path d="M7.49609 3.75C7.49609 2.7835 8.2796 2 9.24609 2H14.7461C15.7126 2 16.4961 2.7835 16.4961 3.75C16.4961 4.7165 15.7126 5.5 14.7461 5.5H9.24609C8.2796 5.5 7.49609 4.7165 7.49609 3.75Z" fill="#FFF" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
</svg>
            </div>
            <div id="v-delete-${fileId}" class="intarective-icon delete w-embed" 
                 onclick="handleDeleteFile('${filePath}')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
<path d="M3 5.5H21ZM16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" fill="#FFF"/>
<path d="M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
<path d="M9.5 16.5V10.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
<path d="M14.5 16.5V10.5" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
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
      uiManager.showSuccess('Copied to clipboard')
    } catch (error) {
      console.error('Copy failed:', error)
      uiManager.showError('Failed to copy URL')
    }
  }

  async toggleFolder(folderId) {
    try {
      const folderContent = document.getElementById(
        `folder-content-${folderId}`
      )
      if (!folderContent) {
        throw new Error('Folder content not found')
      }

      const isVisible = folderContent.style.display === 'block'
      uiManager.toggleFolderVisibility(folderId, !isVisible)
    } catch (error) {
      console.error('Error toggling folder:', error)
      uiManager.showError('Failed to toggle folder')
    }
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

  async loadFolders() {
    try {
      const { data: files, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list()

      if (error) throw error

      // Get unique folder names
      const folders = files
        .filter((file) => file.name.includes('/'))
        .map((file) => file.name.split('/')[0])
        .filter((value, index, self) => self.indexOf(value) === index)

      // Update select field
      const folderSelect = document.getElementById('v-folder-select')
      if (folderSelect) {
        // Clear existing options first
        folderSelect.innerHTML = ''

        // Add default option
        const defaultOption = document.createElement('option')
        defaultOption.value = ''
        defaultOption.textContent = 'Select folder...'
        folderSelect.appendChild(defaultOption)

        // Add folder options
        folders.forEach((folder) => {
          const option = document.createElement('option')
          option.value = folder
          option.textContent = folder
          folderSelect.appendChild(option)
        })

        // Add change event listener
        folderSelect.addEventListener('change', (e) => {
          this.selectedFolder = e.target.value
        })
      }
    } catch (error) {
      console.error('Error loading folders:', error)
      uiManager.showError('Failed to load folders')
    }
  }

  updateFileListUI() {
    const fileList = document.getElementById('a-fileList')
    const emptyPlaceholder = document.getElementById('s-emptyPlaceholder')
    const templateFileItem = document.getElementById('a-fileItem')

    if (!fileList) return

    // Hide the template file item
    if (templateFileItem) {
      templateFileItem.style.display = 'none'
    }

    if (this.uploadedFiles.length === 0) {
      if (fileList) fileList.style.display = 'none'
      if (emptyPlaceholder) {
        emptyPlaceholder.textContent = 'There are no files uploaded yet...'
        emptyPlaceholder.style.display = 'block'
      }
      return
    }

    if (fileList) fileList.style.display = 'block'
    if (emptyPlaceholder) emptyPlaceholder.style.display = 'none'

    // Create the file list HTML
    const fileListHTML = this.uploadedFiles
      .map(
        (file, index) => `
      <div class="file-item" id="file-${index}">
        <p class="paragraph a-fileName">${file.name}</p>
        <div class="div-block-2">
          <div class="html-loader is-button w-embed s-removeFileLoader" style="display: none;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
              <path fill="#333" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
              <path fill="#333" d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z">
                <animateTransform attributeName="transform" dur="0.75s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/>
              </path>
            </svg>
          </div>
          <div class="icon-embed-xsmall w-embed s-removeFile" onclick="window.handleFileRemove(${index})">
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--iconoir" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" viewBox="0 0 24 24">
              <path fill="none" stroke="#333" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 14.828L12.001 12m2.828-2.828L12.001 12m0 0L9.172 9.172M12.001 12l2.828 2.828M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12s4.477 10 10 10"/>
            </svg>
          </div>
        </div>
      </div>
    `
      )
      .join('')

    // Update the file list
    fileList.innerHTML = fileListHTML
  }

  // Update the handleFolderUpload method
  async handleFolderUpload(folderName) {
    console.log('handleFolderUpload called for folder:', folderName)

    try {
      if (!folderName) {
        throw new Error('Folder name is required')
      }

      // First, ensure the folder exists in the database and get its ID
      const { data: folderData, error: folderError } =
        await supabaseTables.createFolder(folderName)
      if (folderError) throw folderError

      if (!folderData?.id) {
        throw new Error('Failed to get folder ID')
      }

      const folderId = folderData.id

      // Create hidden file input
      const fileInput = document.createElement('input')
      fileInput.type = 'file'
      fileInput.multiple = true
      fileInput.style.display = 'none'
      fileInput.className = 'w-file-upload-input'
      fileInput.setAttribute('data-folder', folderName)
      document.body.appendChild(fileInput)

      // Show loading state on the upload icon
      const uploadIcon = document.querySelector(
        `#v-upload-${folderName.replace(/\s+/g, '-')}`
      )
      if (uploadIcon) {
        uploadIcon.style.opacity = '0.5'
      }

      // Handle file selection
      fileInput.onchange = async (event) => {
        try {
          if (!event.target.files?.length) return

          const files = Array.from(event.target.files)
          const errors = files.flatMap((file) => this.validateFile(file))
          if (errors.length > 0) {
            uiManager.showError(errors.join('\n'))
            return
          }

          uiManager.setLoading(true)
          uiManager.showSuccess(
            `Uploading ${files.length} files to ${folderName}...`
          )

          const uploadPromises = files.map(async (file) => {
            const filePath = `${folderName}/${Date.now()}-${file.name}`
            return this.uploadFile(file, filePath, folderId)
          })

          const results = await Promise.allSettled(uploadPromises)
          const failures = results.filter(
            (result) => result.status === 'rejected'
          )

          if (failures.length > 0) {
            throw new Error(`Failed to upload ${failures.length} files`)
          }

          await this.updateUI(
            document.querySelector('#file-container, .file-container')
          )
          uiManager.showSuccess('Files uploaded successfully')
        } catch (error) {
          console.error('Upload failed:', error)
          uiManager.showError(`Failed to upload files: ${error.message}`)
        } finally {
          uiManager.setLoading(false)
          if (uploadIcon) {
            uploadIcon.style.opacity = '1'
          }
        }
      }

      // Trigger file selection
      fileInput.click()

      // Clean up the file input
      setTimeout(() => {
        if (fileInput && fileInput.parentNode) {
          fileInput.parentNode.removeChild(fileInput)
        }
      }, 1000)
    } catch (error) {
      console.error('Error initiating upload:', error)
      uiManager.showError('Failed to initiate upload')
      const uploadIcon = document.querySelector(
        `#v-upload-${folderName.replace(/\s+/g, '-')}`
      )
      if (uploadIcon) {
        uploadIcon.style.opacity = '1'
      }
    }
  }

  // Update the uploadFile method with better error handling
  async uploadFile(file, filePath, folderId = null) {
    console.log('Starting upload for:', filePath)
    try {
      // Upload to storage
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file)

      if (error) {
        console.error('Supabase upload error:', error)
        throw error
      }

      // Get the public URL
      const { data: urlData } = await supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath)

      // Insert into files table
      const fileInfo = {
        name: file.name,
        url: urlData.publicUrl,
        size: file.size,
        type: file.type,
        folder_id: folderId,
      }

      const { error: dbError } = await supabaseTables.insertFile(fileInfo)
      if (dbError) {
        console.error('Database insert error:', dbError)
        throw dbError
      }

      console.log('Upload and database insert successful:', filePath)
      return data
    } catch (error) {
      console.error('Upload or database insert failed:', filePath, error)
      throw error
    }
  }

  // Add a method to get folder ID by name
  async getFolderIdByName(folderName) {
    try {
      const { data, error } = await supabase
        .from('folders')
        .select('id')
        .eq('name', folderName)
        .single()

      if (error) throw error
      return data?.id || null
    } catch (error) {
      console.error('Error getting folder ID:', error)
      return null
    }
  }
}

const fileManager = new FileManager()
window.fileManager = fileManager
export { fileManager }
