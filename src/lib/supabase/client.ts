'use client';
import { createBrowserClient } from '@supabase/ssr';
import { authConfigured, supabaseAnonKey, supabaseUrl } from './config';

export function createSupabaseBrowser() {
  if (!authConfigured) return null;
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
