import { fileManager } from './modules/fileManager.js'

function initializeFileManager() {
  const fileContainer = document.querySelector(
    '#file-container, .file-container'
  )
  if (fileContainer) {
    fileManager.updateUI(fileContainer).catch((error) => {
      console.error('Error initializing file manager:', error)
    })
  }
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', initializeFileManager)

// Handle Webflow initialization
if (window.Webflow) {
  window.Webflow.push(initializeFileManager)
}

// Export for global access
window.fileManager = fileManager
