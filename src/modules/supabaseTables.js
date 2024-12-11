import { supabase } from './supabaseClient.js'

class SupabaseTables {
  /**
   * Creates a new folder in the database
   * @param {string} name - Folder name
   * @param {string|null} parentId - Parent folder UUID (optional)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async createFolder(name, parentId = null) {
    try {
      console.log('Creating folder:', { name, parentId })

      // Validate folder name
      if (!name?.trim()) {
        throw new Error('Folder name is required')
      }

      // Check if folder already exists
      const { data: existingFolder, error: checkError } = await supabase
        .from('folders')
        .select('*')
        .eq('name', name.trim())
        .maybeSingle()

      if (checkError) {
        console.error('Error checking existing folder:', checkError)
        throw checkError
      }

      if (existingFolder) {
        console.log('Folder already exists:', existingFolder)
        return { data: existingFolder, error: null }
      }

      // Create new folder with explicit column names
      const { data, error } = await supabase
        .from('folders')
        .insert({
          name: name.trim(),
          parent_id: parentId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        console.error('Supabase insert error:', error)
        throw error
      }

      console.log('Folder created successfully:', data)
      return { data, error: null }
    } catch (error) {
      console.error('Error creating folder:', error)
      return { data: null, error }
    }
  }

  /**
   * Inserts file information into the database
   * @param {Object} fileInfo - File information object
   * @param {string} fileInfo.name - File name
   * @param {string} fileInfo.url - File URL
   * @param {number} fileInfo.size - File size in bytes
   * @param {string} fileInfo.type - File MIME type
   * @param {string|null} fileInfo.folderId - Folder UUID (optional)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async insertFile(fileInfo) {
    try {
      console.log('Inserting file into database:', fileInfo)

      // Validate required fields
      if (!fileInfo?.name || !fileInfo?.url) {
        throw new Error('File name and URL are required')
      }

      // Insert the file record with explicit column names
      const { data, error } = await supabase
        .from('files')
        .insert({
          name: fileInfo.name.trim(),
          url: fileInfo.url,
          size: fileInfo.size || 0,
          type: fileInfo.type || 'application/octet-stream',
          folder_id: fileInfo.folder_id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        console.error('Supabase insert error:', error)
        throw error
      }

      console.log('File inserted successfully:', data)
      return { data, error: null }
    } catch (error) {
      console.error('Error inserting file:', error)
      return { data: null, error }
    }
  }

  /**
   * Creates a new bucket entry
   * @param {string} name - Bucket name
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async createBucket(name) {
    try {
      if (!name?.trim()) {
        throw new Error('Bucket name is required')
      }

      const { data, error } = await supabase
        .from('buckets')
        .insert([{ name: name.trim() }])
        .select()
        .single()

      if (error) {
        console.error('Supabase insert error:', error)
        throw error
      }

      return { data, error: null }
    } catch (error) {
      console.error('Error creating bucket:', error)
      return { data: null, error }
    }
  }

  /**
   * Gets all files in a folder
   * @param {string} folderId - Folder UUID
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   */
  async getFilesInFolder(folderId) {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('folder_id', folderId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('Error getting files:', error)
      return { data: null, error }
    }
  }

  /**
   * Gets all subfolders of a folder
   * @param {string|null} parentId - Parent folder UUID
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   */
  async getSubfolders(parentId = null) {
    try {
      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .eq('parent_id', parentId)
        .order('name')

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('Error getting subfolders:', error)
      return { data: null, error }
    }
  }

  /**
   * Updates file information
   * @param {string} fileId - File UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async updateFile(fileId, updates) {
    try {
      const { data, error } = await supabase
        .from('files')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileId)
        .select()
        .single()

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('Error updating file:', error)
      return { data: null, error }
    }
  }

  /**
   * Deletes a file from the database
   * @param {string} fileId - File UUID
   * @returns {Promise<{error: Error|null}>}
   */
  async deleteFile(fileId) {
    try {
      const { error } = await supabase.from('files').delete().eq('id', fileId)

      if (error) throw error
      return { error: null }
    } catch (error) {
      console.error('Error deleting file:', error)
      return { error }
    }
  }

  /**
   * Deletes a folder and all its contents
   * @param {string} folderId - Folder UUID
   * @returns {Promise<{error: Error|null}>}
   */
  async deleteFolder(folderId) {
    try {
      // Delete all files in the folder
      const { error: filesError } = await supabase
        .from('files')
        .delete()
        .eq('folder_id', folderId)

      if (filesError) throw filesError

      // Delete the folder itself
      const { error: folderError } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId)

      if (folderError) throw folderError

      return { error: null }
    } catch (error) {
      console.error('Error deleting folder:', error)
      return { error }
    }
  }

  /**
   * Moves a file to a different folder
   * @param {string} fileId - File UUID
   * @param {string|null} newFolderId - New folder UUID
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async moveFile(fileId, newFolderId) {
    return this.updateFile(fileId, { folder_id: newFolderId })
  }

  /**
   * Renames a folder
   * @param {string} folderId - Folder UUID
   * @param {string} newName - New folder name
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async renameFolder(folderId, newName) {
    try {
      const { data, error } = await supabase
        .from('folders')
        .update({ name: newName })
        .eq('id', folderId)
        .select()
        .single()

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('Error renaming folder:', error)
      return { data: null, error }
    }
  }
}

// Create and export a singleton instance
const supabaseTables = new SupabaseTables()
export { supabaseTables }
