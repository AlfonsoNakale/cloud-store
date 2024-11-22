import { DOM_IDS } from './constants.js'

class UIManager {
  constructor() {
    // Get DOM elements
    this.elements = {}
    Object.entries(DOM_IDS).forEach(([key, id]) => {
      this.elements[key] = document.getElementById(id)
    })

    this.initializeUI()
  }

  initializeUI() {
    // Set initial states
    this.elements.uploadLoader.style.display = 'none'
    this.elements.defaultFileItem.style.display = 'none'
    this.elements.emptyPlaceholder.style.display = 'flex'
    this.elements.emptyStateIcon.style.display = 'block'
    this.elements.fullStateIcon.style.display = 'none'
    this.elements.maxErrorElement.style.display = 'none'

    // Enable multiple file selection
    this.elements.fileInput.setAttribute('multiple', 'true')
  }

  updateFileList(uploadedFiles) {
    const items = this.elements.fileList.querySelectorAll('[id^="a-fileItem-"]')
    items.forEach((item) => item.remove())

    if (uploadedFiles.length === 0) {
      this.elements.emptyPlaceholder.style.display = 'flex'
      this.elements.defaultFileItem.style.display = 'none'
    } else {
      this.elements.emptyPlaceholder.style.display = 'none'
      this.elements.defaultFileItem.style.display = 'none'
      uploadedFiles.forEach((file, index) => {
        const fileItem = this.createFileItem(file, index)
        this.elements.fileList.appendChild(fileItem)
      })
    }
  }

  updateStateIcons(fileCount, maxFiles) {
    if (fileCount >= maxFiles) {
      this.elements.emptyStateIcon.style.display = 'none'
      this.elements.fullStateIcon.style.display = 'block'
    } else {
      this.elements.emptyStateIcon.style.display = 'block'
      this.elements.fullStateIcon.style.display = 'none'
    }
  }

  showError(message) {
    this.elements.maxErrorElement.textContent = message
    this.elements.maxErrorElement.style.display = 'block'
    setTimeout(() => {
      this.elements.maxErrorElement.style.display = 'none'
    }, 6000)
  }

  createFileItem(file, index) {
    const fileItem = document.createElement('div')
    fileItem.id = `a-fileItem-${index}`
    fileItem.className = 'file-item'

    fileItem.innerHTML = `
      <p id="a-fileName" class="paragraph">${file.name}</p>
      <div class="div-block-2">
        <div class="icon-embed-xsmall" onclick="window.removeFile(${index})">
          <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 14.828L12.001 12m2.828-2.828L12.001 12m0 0L9.172 9.172M12.001 12l2.828 2.828M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12s4.477 10 10 10"></path>
          </svg>
        </div>
      </div>
    `

    return fileItem
  }

  setLoading(isLoading) {
    this.elements.uploadLoader.style.display = isLoading ? 'flex' : 'none'
  }

  setFileInputEnabled(enabled) {
    this.elements.fileInput.disabled = !enabled
  }
}

export const uiManager = new UIManager()
