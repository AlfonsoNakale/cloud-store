import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fsymfimuqnfpnkljsczl.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzeW1maW11cW5mcG5rbGpzY3psIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzIwNDM3MDEsImV4cCI6MjA0NzYxOTcwMX0.tg5hK3roDwsE0Z691Xv4xBBmKoaULdIjsXweDr9dhXI'
const BUCKET_NAME = 'store'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
export { BUCKET_NAME }
