/**
 * Calculates total size of files
 * @param {File[]} files - Array of File objects
 * @returns {number} Total size in bytes
 */
export const calculateTotalSize = (files) => {
  return files.reduce((total, file) => total + file.size, 0)
}

/**
 * Simulates file upload
 * @param {File} file - File to upload
 * @returns {Promise}
 */
export const simulateFileUpload = async (file) => {
  console.log(
    `Uploading file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`
  )
  await new Promise((resolve) => setTimeout(resolve, 2000))
  console.log(`Finished uploading: ${file.name}`)
}
