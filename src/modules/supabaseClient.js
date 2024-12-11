import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://thrcfsvkxcocdrftpuhz.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRocmNmc3ZreGNvY2RyZnRwdWh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM5NDUyMDgsImV4cCI6MjA0OTUyMTIwOH0.7lA49g5CRg6Ec6FHAAFS_u8f9y-VGtpVOGi1XDnrH7M'
export const BUCKET_NAME = 'client-files'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
