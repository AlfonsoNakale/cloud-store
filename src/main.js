import { fileManager } from './modules/fileManager.js'

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Initialize file display
  const fileContainer = document.querySelector(
    '#file-container, .file-container'
  )
  if (fileContainer) {
    fileManager.updateUI(fileContainer)
  }
})

// Handle Webflow initialization
if (window.Webflow) {
  window.Webflow.push(() => {
    const fileContainer = document.querySelector(
      '#file-container, .file-container'
    )
    if (fileContainer) {
      fileManager.updateUI(fileContainer)
    }
  })
}
