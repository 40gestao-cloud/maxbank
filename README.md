# MaxBank

Simulador centralizado de pagamento PIX (PWA) com leitura de QR Code. Conecta-se a três instâncias Supabase distintas, uma para cada projeto LogMax:

- **LogMax ERP**
- **LogMax Contabilidade**
- **LogMax Aprendiz**

## Stack

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 4
- Supabase JS (uma instância por filial)
- html5-qrcode (leitor de QR via câmera)
- jsPDF (comprovante)
- PWA (manifest + service worker próprios)

## Pré-requisitos

- Node.js 18+
- Acesso aos três projetos Supabase (URL e anon key de cada um)

## Setup

1. Instalar dependências:

   ```bash
   npm install
   ```

2. Copiar `.env.example` para `.env.local` e preencher com os valores de cada filial:

   ```bash
   VITE_SUPABASE_URL_1=...   # LogMax ERP
   VITE_SUPABASE_KEY_1=...
   VITE_SUPABASE_URL_2=...   # LogMax Contabilidade
   VITE_SUPABASE_KEY_2=...
   VITE_SUPABASE_URL_3=...   # LogMax Aprendiz
   VITE_SUPABASE_KEY_3=...
   ```

3. Rodar em desenvolvimento:

   ```bash
   npm run dev
   ```

4. Build de produção:

   ```bash
   npm run build
   npm run preview
   ```

## Backend (Supabase) esperado

Cada instância deve expor:

- Tabela `pix_pendentes` com colunas `id` (uuid), `valor` (numeric), `status` (text), `created_at` (timestamptz).
- Função RPC `confirmar_pix_pendente(p_id uuid)` que marca a cobrança como paga.

## PWA

- Manifest: `public/manifest.webmanifest`
- Service Worker: `public/sw.js` (precache do shell + network-first em `version.json`)
- Banner de atualização disparado automaticamente quando o `__BUILD_TIME__` do bundle não coincide com `/version.json` no servidor.

## Scripts

| Comando         | Descrição                              |
| --------------- | -------------------------------------- |
| `npm run dev`   | Servidor de desenvolvimento (porta 3000) |
| `npm run build` | Build de produção em `dist/`            |
| `npm run preview` | Servir build de produção localmente   |
| `npm run lint`  | Type-check via TypeScript               |
| `npm run clean` | Limpar `dist/` e `server.js`            |
