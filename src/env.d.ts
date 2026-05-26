/// <reference types="vite/client" />

declare const __BUILD_TIME__: number;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL_1?: string;
  readonly VITE_SUPABASE_KEY_1?: string;
  readonly VITE_SUPABASE_URL_2?: string;
  readonly VITE_SUPABASE_KEY_2?: string;
  readonly VITE_SUPABASE_URL_3?: string;
  readonly VITE_SUPABASE_KEY_3?: string;
  readonly VITE_SUPABASE_URL_4?: string;
  readonly VITE_SUPABASE_KEY_4?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
