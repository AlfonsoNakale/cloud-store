import { DOM_IDS } from './constants.js'

class UIManager {
  constructor() {
    this.elements = {}
    Object.entries(DOM_IDS).forEach(([key, id]) => {
      this.elements[key] = document.getElementById(id)
    })

    this.initializeUI()
  }

  initializeUI() {
    // Set initial states only for elements that exist
    if (this.elements.uploadLoader) {
      this.elements.uploadLoader.style.display = 'none'
    }

    if (this.elements.defaultFileItem) {
      this.elements.defaultFileItem.style.display = 'none'
    }

    if (this.elements.emptyPlaceholder) {
      this.elements.emptyPlaceholder.style.display = 'flex'
    }

    if (this.elements.emptyStateIcon) {
      this.elements.emptyStateIcon.style.display = 'block'
    }

    if (this.elements.fullStateIcon) {
      this.elements.fullStateIcon.style.display = 'none'
    }

    if (this.elements.maxErrorElement) {
      this.elements.maxErrorElement.style.display = 'none'
    }

    // Enable multiple file selection if input exists
    if (this.elements.fileInput) {
      this.elements.fileInput.setAttribute('multiple', 'true')
    }
  }

  updateFileList(uploadedFiles) {
    // Get elements using the stored references
    const fileList = this.elements.fileList
    const emptyPlaceholder = this.elements.emptyPlaceholder
    const defaultFileItem = this.elements.defaultFileItem

    if (!fileList || !emptyPlaceholder || !defaultFileItem) {
      console.warn('Required elements not found')
      return
    }

    // Clear existing file items
    const existingItems = fileList.querySelectorAll('[id^="a-fileItem-"]')
    existingItems.forEach((item) => item.remove())

    // Handle empty state
    if (!uploadedFiles || uploadedFiles.length === 0) {
      emptyPlaceholder.style.display = 'flex'
      defaultFileItem.style.display = 'none'
      return
    }

    // Hide empty state and template
    emptyPlaceholder.style.display = 'none'
    defaultFileItem.style.display = 'none'

    // Create and append file items
    uploadedFiles.forEach((file, index) => {
      const fileItem = this.createFileItemElement(file, index)
      fileList.appendChild(fileItem)
    })
  }

  createFileItemElement(file, index) {
    // Clone the template
    const template = this.elements.defaultFileItem
    const fileItem = template.cloneNode(true)

    // Set basic properties
    fileItem.id = `a-fileItem-${index}`
    fileItem.style.display = 'flex'

    // Update file name
    const fileNameElement = fileItem.querySelector('#a-fileName')
    if (fileNameElement) {
      fileNameElement.textContent = file.name
      fileNameElement.id = `a-fileName-${index}`
    }

    // Set up remove button and loader
    const removeLoader = fileItem.querySelector('#s-removeFileLoader')
    const removeButton = fileItem.querySelector('#s-removeFile')

    if (removeLoader && removeButton) {
      // Update IDs
      removeLoader.id = `s-removeFileLoader-${index}`
      removeButton.id = `s-removeFile-${index}`

      // Initial state
      removeLoader.style.display = 'none'
      removeButton.style.display = 'block'

      // Set up click handler
      removeButton.onclick = async () => {
        try {
          // Show loader, hide button
          removeLoader.style.display = 'block'
          removeButton.style.display = 'none'

          // Remove file
          await window.removeFile(index)
        } catch (error) {
          console.error('Error removing file:', error)
          // Restore button on error
          removeLoader.style.display = 'none'
          removeButton.style.display = 'block'
        }
      }
    }

    return fileItem
  }

  showError(message) {
    if (!this.elements.maxErrorElement) return

    this.elements.maxErrorElement.textContent = message
    this.elements.maxErrorElement.style.display = 'block'
    setTimeout(() => {
      this.elements.maxErrorElement.style.display = 'none'
    }, 6000)
  }

  setLoading(isLoading) {
    if (this.elements.uploadLoader) {
      this.elements.uploadLoader.style.display = isLoading ? 'flex' : 'none'
    }
  }

  setFileInputEnabled(enabled) {
    if (this.elements.fileInput) {
      this.elements.fileInput.disabled = !enabled
    }
  }

  updateStateIcons(fileCount, maxFiles) {
    if (!this.elements.emptyStateIcon || !this.elements.fullStateIcon) return

    if (fileCount >= maxFiles) {
      this.elements.emptyStateIcon.style.display = 'none'
      this.elements.fullStateIcon.style.display = 'block'
    } else {
      this.elements.emptyStateIcon.style.display = 'block'
      this.elements.fullStateIcon.style.display = 'none'
    }
  }
}

export const uiManager = new UIManager()
