import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Cache for initialized clients to avoid recreating them on every render
const clients: Record<string, SupabaseClient> = {};

export interface BranchConfig {
  id: string;
  name: string;
  urlEnvKey: string;
  anonKeyEnvKey: string;
}

export const branches: BranchConfig[] = [
  {
    id: '1',
    name: 'LogMax ERP',
    urlEnvKey: 'VITE_SUPABASE_URL_1',
    anonKeyEnvKey: 'VITE_SUPABASE_KEY_1',
  },
  {
    id: '2',
    name: 'LogMax Contabilidade',
    urlEnvKey: 'VITE_SUPABASE_URL_2',
    anonKeyEnvKey: 'VITE_SUPABASE_KEY_2',
  },
  {
    id: '3',
    name: 'LogMax Aprendiz',
    urlEnvKey: 'VITE_SUPABASE_URL_3',
    anonKeyEnvKey: 'VITE_SUPABASE_KEY_3',
  },
];

export const getSupabaseClient = (branchId: string): SupabaseClient | null => {
  if (clients[branchId]) {
    return clients[branchId];
  }

  const branch = branches.find((b) => b.id === branchId);
  if (!branch) {
    console.error(`Branch ${branchId} not found.`);
    return null;
  }

  const supabaseUrl = (import.meta as any).env[branch.urlEnvKey];
  const supabaseKey = (import.meta as any).env[branch.anonKeyEnvKey];

  if (!supabaseUrl || !supabaseKey) {
    console.warn(`Missing Supabase credentials for branch: ${branch.name}`);
    return null; // Return null so app can handle misconfiguration gracefully
  }

  const client = createClient(supabaseUrl, supabaseKey);
  clients[branchId] = client;
  return client;
};
