class UIManager {
  constructor() {
    this.elements = {
      fileInput: document.querySelector('#v-file_input'),
      uploadButton: document.querySelector('#v-upload_button'),
      fileList: document.querySelector('#v-file_list'),
      stateIcons: document.querySelector('#v-state_icons'),
      progressBar: document.querySelector('#v-progress_bar'),
      notification: document.querySelector('#v-notification'),
    }
  }

  showSuccess(message) {
    this.showNotification(message, 'success')
  }

  showError(message) {
    this.showNotification(message, 'error')
  }

  showNotification(message, type = 'info') {
    const notification = this.elements.notification
    if (!notification) return

    // Set notification text and style
    notification.textContent = message
    notification.className = `notification ${type}`

    // Show notification
    notification.style.display = 'block'
    notification.style.opacity = '1'

    // Hide after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0'
      setTimeout(() => {
        notification.style.display = 'none'
      }, 300)
    }, 3000)
  }

  setLoading(isLoading) {
    const uploadButton = this.elements.uploadButton
    if (uploadButton) {
      uploadButton.disabled = isLoading
      uploadButton.textContent = isLoading ? 'Uploading...' : 'Upload'
    }
  }

  setFileInputEnabled(enabled) {
    const fileInput = this.elements.fileInput
    if (fileInput) {
      fileInput.disabled = !enabled
    }
  }

  updateFileList(files) {
    const fileList = this.elements.fileList
    if (!fileList) return

    fileList.innerHTML = files
      .map(
        (file, index) => `
        <div class="file-item">
          <span>${file.name}</span>
          <button onclick="removeFile(${index})">Remove</button>
        </div>
      `
      )
      .join('')
  }

  updateStateIcons(currentFiles, maxFiles) {
    const stateIcons = this.elements.stateIcons
    if (!stateIcons) return

    stateIcons.textContent = `${currentFiles}/${maxFiles} files selected`
  }

  updateProgressBar(progress) {
    const progressBar = this.elements.progressBar
    if (!progressBar) return

    progressBar.style.width = `${progress}%`
  }
}

const uiManager = new UIManager()
export { uiManager }
