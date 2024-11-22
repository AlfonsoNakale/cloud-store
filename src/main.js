console.log('Welcome to Vite + JS + Webflow!')

// Get DOM elements
const fileInput = document.getElementById('file-input')
const fileList = document.getElementById('a-fileList')
const emptyPlaceholder = document.getElementById('s-emptyPlaceholder')
const uploadLoader = document.getElementById('s-uploadLoader')
const uploadButton = document.getElementById('uploadFile')
const defaultFileItem = document.getElementById('a-fileItem')
const emptyStateIcon = document.getElementById('s-emptyState')
const fullStateIcon = document.getElementById('s-fullState')
const maxErrorElement = document.getElementById('s-maxError')

// Store files array
let uploadedFiles = []

// Add constants for restrictions
const MAX_FILES = 5
const MAX_SIZE_MB = 20
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024 // Convert MB to bytes

// Initially hide certain elements
uploadLoader.style.display = 'none'
defaultFileItem.style.display = 'none'
emptyPlaceholder.style.display = 'flex'
emptyStateIcon.style.display = 'block'
fullStateIcon.style.display = 'none'
maxErrorElement.style.display = 'none'

// Function to create a file item element
function createFileItem(file, index) {
  const fileItem = document.createElement('div')
  fileItem.id = `a-fileItem-${index}`
  fileItem.className = 'file-item'

  fileItem.innerHTML = `
        <p id="a-fileName" class="paragraph">${file.name}</p>
        <div class="div-block-2">
            <div id="s-removeFileLoader" class="html-loader is-button" style="display: none;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/><path fill="currentColor" d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"><animateTransform attributeName="transform" dur="0.75s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path></svg>
            </div>
            <div class="icon-embed-xsmall" onclick="removeFile(${index})">
                <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24">
                    <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 14.828L12.001 12m2.828-2.828L12.001 12m0 0L9.172 9.172M12.001 12l2.828 2.828M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12s4.477 10 10 10"></path>
                </svg>
            </div>
        </div>
    `

  return fileItem
}

// Function to update file list display
function updateFileList() {
  // Clear existing items (except the template and empty placeholder)
  const items = fileList.querySelectorAll('[id^="a-fileItem-"]')
  items.forEach((item) => item.remove())

  // Show/hide empty placeholder and manage visibility
  if (uploadedFiles.length === 0) {
    emptyPlaceholder.style.display = 'flex'
    defaultFileItem.style.display = 'none'
  } else {
    emptyPlaceholder.style.display = 'none'
    defaultFileItem.style.display = 'none'
    // Add file items
    uploadedFiles.forEach((file, index) => {
      const fileItem = createFileItem(file, index)
      fileList.appendChild(fileItem)
    })
  }
}

// Function to update state icons
function updateStateIcons() {
  if (uploadedFiles.length >= MAX_FILES) {
    emptyStateIcon.style.display = 'none'
    fullStateIcon.style.display = 'block'
  } else {
    emptyStateIcon.style.display = 'block'
    fullStateIcon.style.display = 'none'
  }
}

// Function to calculate total size of files
function calculateTotalSize(files) {
  return files.reduce((total, file) => total + file.size, 0)
}

// Function to show error message
function showError(message) {
  maxErrorElement.textContent = message
  maxErrorElement.style.display = 'block'
  // Hide error after 3 seconds
  setTimeout(() => {
    maxErrorElement.style.display = 'none'
  }, 6000)
}

// Handle file selection
fileInput.addEventListener('change', (event) => {
  const newFiles = Array.from(event.target.files)

  // Check if adding new files would exceed the limit
  if (uploadedFiles.length + newFiles.length > MAX_FILES) {
    showError(
      `You can only upload up to ${MAX_FILES} files. You currently have ${uploadedFiles.length} files.`
    )
    fileInput.value = ''
    return
  }

  // Check total file size
  const currentTotalSize = calculateTotalSize(uploadedFiles)
  const newTotalSize = calculateTotalSize(newFiles)
  const totalSize = currentTotalSize + newTotalSize

  if (totalSize > MAX_SIZE_BYTES) {
    showError(
      `Total file size cannot exceed ${MAX_SIZE_MB}MB. Please remove some files.`
    )
    fileInput.value = ''
    return
  }

  // If all checks pass, hide error message
  maxErrorElement.style.display = 'none'

  // Rest of the code remains the same...
  uploadedFiles = [...uploadedFiles, ...newFiles]
  updateFileList()
  updateStateIcons()
  fileInput.value = ''

  if (uploadedFiles.length >= MAX_FILES) {
    fileInput.disabled = true
  }
})

// Function to remove file
window.removeFile = (index) => {
  uploadedFiles.splice(index, 1)
  updateFileList()
  updateStateIcons()

  // Re-enable file input if below max files
  if (uploadedFiles.length < MAX_FILES) {
    fileInput.disabled = false
  }
}

// Handle file upload
uploadButton.addEventListener('click', async () => {
  if (uploadedFiles.length === 0) {
    showError('Please select files first')
    return
  }

  try {
    uploadLoader.style.display = 'flex'

    await Promise.all(
      uploadedFiles.map(async (file) => {
        console.log(
          `Uploading file: ${file.name} (${(file.size / 1024 / 1024).toFixed(
            2
          )}MB)`
        )
        await new Promise((resolve) => setTimeout(resolve, 2000))
        console.log(`Finished uploading: ${file.name}`)
      })
    )

    alert('Files uploaded successfully!')
    uploadedFiles = []
    updateFileList()
    updateStateIcons()
    fileInput.disabled = false
  } catch (error) {
    console.error('Upload failed:', error)
    showError('Upload failed. Please try again.')
  } finally {
    uploadLoader.style.display = 'none'
  }
})

// Allow multiple file selection
fileInput.setAttribute('multiple', 'true')
