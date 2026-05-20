/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Landmark, Camera, Check, FileText, Loader2, ScanLine, XCircle, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { QrScanner } from './components/QrScanner';
import { getSupabaseClient, branches } from './lib/supabase';

type AppState = 'home' | 'scanning' | 'confirming' | 'processing' | 'success' | 'error';
type PixPendente = {
  id: string;
  valor: number;
  status: 'aguardando' | 'pago' | 'cancelado';
  cliente_id: string | null;
  created_at: string;
  paid_at: string | null;
};

export default function App() {
  const [appState, setAppState] = useState<AppState>('home');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [currentPix, setCurrentPix] = useState<PixPendente | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);

  useEffect(() => {
    // __BUILD_TIME__ é substituído em build pelo Vite (vide vite.config.ts)
    const clientBuildTime = __BUILD_TIME__;
    if (!clientBuildTime) return;

    const checkUpdates = async () => {
      try {
        // Busca a versão atualizada diretamente do servidor (evitando cache)
        const res = await fetch(`/version.json?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.version && data.version !== clientBuildTime) {
            setUpdateAvailable(true);
          }
        }
      } catch (err) {
        console.warn('Erro ao verificar atualizações de versão:', err);
      }
    };

    // Primeira verificação após 5 segundos
    const initialCheck = setTimeout(checkUpdates, 5000);

    // Verificar periodicamente a cada 45 segundos
    const interval = setInterval(checkUpdates, 45000);

    // Verificar também quando o usuário volta para o app (foco/visibilidade do navegador)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkUpdates();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(initialCheck);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleUpdate = () => {
    window.location.reload();
  };

  const startScanning = () => {
    if (!selectedBranchId) return;
    setAppState('scanning');
  };

  const handleScanSuccess = async (decodedText: string) => {
    if (appState !== 'scanning') return;
    
    setAppState('processing');
    setErrorMessage('');
    
    try {
      const text = decodedText.trim();
      const uuidRegex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
      const match = text.match(uuidRegex);
      
      if (!match) {
        throw new Error('Formato de QR Code inválido. Nenhuma cobrança (UUID) encontrada.');
      }

      const uuid = match[1];
      const prefix = text.substring(0, text.indexOf(uuid)).replace(/[:|\-|\s]+$/, '').trim();

      const selectedBranch = branches.find(b => b.id === selectedBranchId);

      // O PDV LogMax gera QR no formato `LOGMAX-PIX-<uuid>` (mesmo prefixo
      // nas três filiais). Validamos só que veio do ecossistema LogMax; a
      // proteção contra filial errada é o lookup do UUID na instância
      // Supabase correta, que falha em "Cobrança não encontrada" se o UUID
      // não pertence à filial selecionada.
      if (prefix) {
         const sanitizedPrefix = prefix.toLowerCase().replace(/[^a-z0-9]/g, '');
         if (!sanitizedPrefix.includes('logmax')) {
            throw new Error(`QR Code não reconhecido. Esperado padrão "LOGMAX-PIX-<id>" (recebido: "${prefix}").`);
         }
      }

      const client = getSupabaseClient(selectedBranchId);
      if (!client) throw new Error('Cliente Supabase não configurado para esta filial.');

      const { data, error } = await client
        .from('pix_pendentes')
        .select('*')
        .eq('id', uuid)
        .eq('status', 'aguardando')
        .maybeSingle();

      if (error || !data) {
         throw new Error(`Cobrança não encontrada na filial ${selectedBranch?.name} ou já foi paga.`);
      }

      setCurrentPix(data as PixPendente);
      setAppState('confirming');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Erro ao consultar o PIX.');
      setAppState('error');
    }
  };

  const handleConfirm = async () => {
    if (!currentPix) return;
    setAppState('processing');
    setErrorMessage('');
    
    try {
      const client = getSupabaseClient(selectedBranchId);
      if (!client) throw new Error('Cliente Supabase não configurado.');

      const { error } = await client.rpc('confirmar_pix_pendente', {
        p_id: currentPix.id
      });
        
      if (error) throw error;
      
      setAppState('success');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Erro ao confirmar o pagamento no Supabase.');
      setAppState('error');
    }
  };

  const resetApp = () => {
    setCurrentPix(null);
    setErrorMessage('');
    setSelectedBranchId('');
    setAppState('home');
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Add BB-like styling to the PDF
    doc.setFillColor(0, 61, 165); // Azul BB
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('MaxBank', 105, 25, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.text('Comprovante de Recebimento', 105, 60, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(`ID da Venda: ${currentPix?.id || 'N/A'}`, 20, 80);
    doc.text(`Sistema Origem: ERP - Supabase`, 20, 90);
    doc.text(`Valor Baixado: R$ ${currentPix?.valor ? currentPix.valor.toFixed(2).replace('.', ',') : '0,00'}`, 20, 100);
    
    const date = new Date().toLocaleString('pt-BR');
    doc.text(`Data e Hora: ${date}`, 20, 110);
    
    const branchName = branches.find(b => b.id === selectedBranchId)?.name || 'N/A';
    doc.text(`Filial: ${branchName}`, 20, 120);

    doc.save('comprovante-maxbank.pdf');
  };

  return (
    <div className="min-h-screen bg-[#ecf0f3] text-gray-800 font-sans flex flex-col justify-center items-center md:p-6 overflow-hidden">
      <div className="w-full h-full min-h-screen md:min-h-[800px] md:h-[800px] md:max-h-[90vh] md:w-[375px] bg-[#ecf0f3] md:rounded-[48px] md:border-8 md:border-[#ecf0f3] md:shadow-[20px_20px_40px_#d1d9e6] overflow-y-auto overflow-x-hidden flex flex-col relative hide-scrollbar relative">
        
        {/* Banner de Atualização PWA Simulada */}
        {updateAvailable && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-11/12 z-50 animate-in slide-in-from-top-4 fade-in duration-500">
            <div className="bg-[#f8d117] text-[#003da5] p-3 rounded-2xl shadow-[6px_6px_12px_rgba(0,0,0,0.15)] flex items-center justify-between border-2 border-white/50 backdrop-blur-md">
              <div className="flex items-center gap-2 pl-1">
                <RefreshCw className="w-5 h-5 animate-[spin_4s_linear_infinite]" />
                <span className="font-bold text-sm tracking-wide">NOVA ATUALIZAÇÃO</span>
              </div>
              <button
                onClick={handleUpdate}
                className="bg-[#003da5] text-white text-[10px] font-black uppercase px-4 py-2 rounded-xl shadow-sm active:scale-95 transition-all shimmer-btn shimmer-btn-dark flex-shrink-0 cursor-pointer hover:bg-blue-800"
              >
                Atualizar
              </button>
            </div>
          </div>
        )}

        {/* Header (Azul BB) */}
        <header className="bg-[#003da5] text-white px-5 pt-10 pb-8 rounded-b-[2rem] shadow-[8px_8px_16px_#d1d9e6] relative z-10">
          <div className="flex flex-col items-center justify-center gap-1">
            <div className="w-24 h-24 bg-[#003da5] shadow-[inset_6px_6px_12px_#002b74,inset_-6px_-6px_12px_#004fc6] rounded-full mb-2 flex items-center justify-center p-1.5">
               <img src="/icon-maxbank.png" alt="MaxBank Icon" className="w-full h-full object-cover rounded-full" />
            </div>
            <p className="text-xs text-blue-200 font-medium tracking-wide">Recebimentos Corporativos</p>
          </div>
        </header>

        <main className="flex-1 flex flex-col px-5 -mt-4 relative z-20 pb-8">
          
          {appState === 'home' && (
            <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Card de Seleção de Filial */}
              <div className="bg-[#ecf0f3] p-6 rounded-[2rem] shadow-[8px_8px_16px_#d1d9e6] mt-2">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-2">
                  Filial de Recebimento
                </label>
                <div className="relative">
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="w-full bg-[#ecf0f3] shadow-[inset_5px_5px_10px_#d1d9e6] text-[#003da5] rounded-2xl px-5 py-4 font-bold text-sm focus:outline-none appearance-none border-none focus:ring-0"
                  >
                    <option value="" disabled>Selecione sua filial...</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              </div>

              {/* Área do Leitor (Home) */}
              <div className="bg-[#ecf0f3] p-8 rounded-[2rem] shadow-[8px_8px_16px_#d1d9e6] flex flex-col items-center gap-6 mt-2 transition-all">
                
                <div className="text-center mb-1">
                  <h2 className="text-2xl font-black text-[#003da5] tracking-tight uppercase">Bem-vindo</h2>
                  <p className="text-gray-500 text-sm mt-3 relative z-10 px-2">Selecione sua filial e escaneie o QR Code do cliente para processar.</p>
                </div>

                <div className="w-full aspect-[4/3] bg-[#ecf0f3] rounded-3xl shadow-[inset_6px_6px_12px_#d1d9e6] flex flex-col items-center justify-center text-gray-400 gap-4 p-5">
                  <div className="p-5 bg-[#ecf0f3] rounded-full shadow-[5px_5px_10px_#d1d9e6]">
                    <Camera className="w-8 h-8 text-[#003da5]" />
                  </div>
                  <span className="text-sm font-medium px-4 text-center relative z-10">Posicione o código no centro da câmera na próxima tela</span>
                </div>

                <button
                  onClick={startScanning}
                  disabled={!selectedBranchId}
                  className="w-full bg-[#f8d117] text-[#003da5] font-bold py-4 px-4 rounded-2xl shadow-[6px_6px_12px_#d1d9e6] flex items-center justify-center gap-2 active:shadow-[inset_4px_4px_8px_#d3b213,inset_-4px_-4px_8px_#ffff1b] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none uppercase tracking-wide mt-2 shimmer-btn"
                >
                  <Camera className="w-5 h-5" />
                  Iniciar Leitura
                </button>
              </div>

            </div>
          )}

          {appState === 'scanning' && (
            <div className="bg-[#ecf0f3] p-6 rounded-[2rem] shadow-[8px_8px_16px_#d1d9e6] flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-300">
               
               <div className="w-full aspect-[4/5] bg-gray-900 rounded-3xl shadow-[inset_8px_8px_15px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center text-white gap-3 relative overflow-hidden ring-4 ring-[#ecf0f3]">
                  
                  {/* Overlay Guides */}
                  <div className="absolute inset-0 z-10 pointer-events-none border-[4px] border-[#f8d117]/40 rounded-xl m-10"></div>
                  
                  {/* Scan Line effect */}
                  <div className="absolute w-full h-[2px] bg-[#f8d117] shadow-[0_0_12px_#f8d117] top-[10%] animate-[ping_3s_ease-in-out_infinite] z-10 pointer-events-none"></div>

                  <div className="absolute inset-0 [&_div]:!border-none [&_video]:!object-cover [&_video]:!w-full [&_video]:!h-full">
                    <QrScanner 
                      onScanSuccess={handleScanSuccess} 
                      onScanError={(err) => {
                          console.debug(err);
                      }} 
                    />
                  </div>
                  
                  <div className="absolute bottom-4 bg-black/50 px-3 py-1 text-xs rounded-full z-10 backdrop-blur-sm">
                    Aguardando código...
                  </div>
               </div>
               
               <p className="text-xs text-center text-gray-500 font-medium px-4">
                 Aponte para o QR Code gerado pelo ERP.
               </p>
               
               {/* Simulação Fallback */}
               <div className="w-full relative mt-3 pt-6 border-t border-[#d1d9e6]/50">
                  <input type="text" id="mocked-uuid" placeholder="Cole o UUID aqui para testar..." className="w-full bg-[#ecf0f3] shadow-[inset_4px_4px_8px_#d1d9e6] text-[#003da5] font-medium rounded-xl px-4 py-4 text-xs mb-5 border-none focus:outline-none focus:ring-0 placeholder-gray-400" />
                  <button 
                    onClick={() => {
                      const val = (document.getElementById('mocked-uuid') as HTMLInputElement).value;
                      if(val) handleScanSuccess(val);
                    }}
                    className="w-full bg-[#003da5] text-white font-bold py-4 rounded-xl shadow-[5px_5px_10px_#d1d9e6] active:shadow-[inset_4px_4px_8px_#002b74,inset_-4px_-4px_8px_#004fd6] transition-all uppercase tracking-wider text-xs flex items-center justify-center gap-2 shimmer-btn shimmer-btn-dark"
                  >
                    <ScanLine className="w-4 h-4" />
                    Simular Leitura (UUID)
                  </button>
               </div>

               <button 
                 onClick={resetApp} 
                 className="text-gray-500 bg-[#ecf0f3] shadow-[5px_5px_10px_#d1d9e6] active:shadow-[inset_3px_3px_6px_#d1d9e6] rounded-xl font-bold py-4 uppercase text-xs tracking-wider w-full transition-all"
               >
                 Cancelar
               </button>
            </div>
          )}

          {appState === 'confirming' && (
            <div className="bg-[#ecf0f3] p-8 rounded-[2rem] shadow-[8px_8px_16px_#d1d9e6] flex flex-col gap-6 relative animate-in slide-in-from-right-4 fade-in duration-300 mt-6">
                
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#f8d117] text-[#003da5] w-12 h-12 flex items-center justify-center rounded-full shadow-[6px_6px_12px_#d1d9e6] border-4 border-[#ecf0f3]">
                   <Check className="w-6 h-6 font-black" />
                </div>
                
                <div className="text-center border-b border-[#d1d9e6]/50 pb-5 pt-3 border-dashed">
                   <h2 className="text-lg font-black text-[#003da5] uppercase tracking-widest">Comprovante</h2>
                   <p className="text-xs text-gray-500 mt-1 font-medium">Dados do Pagamento Lidos</p>
                </div>

                <div className="space-y-5">
                   <div className="bg-[#ecf0f3] rounded-2xl shadow-[inset_5px_5px_10px_#d1d9e6] p-5 flex items-start gap-4 text-left">
                      <div className="bg-[#ecf0f3] shadow-[4px_4px_8px_#d1d9e6] text-[#003da5] rounded-full p-1.5"><CheckCircle2 className="w-5 h-5" /></div>
                      <div>
                        <p className="text-sm font-bold text-[#003da5] tracking-wide">Origem Verificada</p>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                          A cobrança foi validada e encontrada em <strong>{branches.find(b => b.id === selectedBranchId)?.name}</strong>.
                        </p>
                      </div>
                   </div>

                   <div className="flex justify-between items-center text-sm px-2">
                      <span className="text-gray-500 font-semibold">ID da Venda:</span>
                      <span className="font-mono text-xs font-bold text-[#003da5] break-all w-3/5 text-right bg-[#ecf0f3] shadow-[inset_2px_2px_4px_#d1d9e6] px-2 py-1.5 rounded-lg">{currentPix?.id}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm px-2">
                      <span className="text-gray-500 font-semibold">Filial Localizada:</span>
                      <span className="font-bold text-gray-800 text-right w-3/5">{branches.find(b => b.id === selectedBranchId)?.name || 'N/A'}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm px-2">
                      <span className="text-gray-500 font-semibold">Sistema Origem:</span>
                      <span className="font-bold text-gray-800">ERP Supabase (Módulo)</span>
                   </div>
                   <div className="flex justify-between items-center bg-[#ecf0f3] shadow-[inset_6px_6px_12px_#d1d9e6] p-5 rounded-2xl mt-4">
                      <span className="text-gray-500 text-sm font-black uppercase tracking-wider">Valor a Baixar:</span>
                      <span className="font-black text-[#003da5] text-2xl drop-shadow-sm">
                        R$ {currentPix?.valor ? currentPix.valor.toFixed(2).replace('.', ',') : '0,00'}
                      </span>
                   </div>
                </div>

                <div className="flex flex-col gap-4 mt-2">
                   <button 
                     onClick={handleConfirm}
                     className="w-full bg-[#f8d117] text-[#003da5] font-black uppercase tracking-widest py-4 rounded-xl shadow-[6px_6px_12px_#d1d9e6] active:shadow-[inset_4px_4px_8px_#d3b213,inset_-4px_-4px_8px_#ffff1b] transition-all shimmer-btn"
                   >
                     Confirmar Recebimento
                   </button>
                   <button 
                     onClick={resetApp}
                     className="w-full text-gray-500 bg-[#ecf0f3] rounded-xl shadow-[5px_5px_10px_#d1d9e6] active:shadow-[inset_3px_3px_6px_#d1d9e6] font-bold uppercase text-xs tracking-wider py-4 transition-all"
                   >
                     Cancelar
                   </button>
                </div>
            </div>
          )}

          {appState === 'processing' && (
             <div className="bg-[#ecf0f3] p-10 rounded-[2rem] shadow-[8px_8px_16px_#d1d9e6] flex flex-col items-center justify-center gap-6 mt-12 animate-in fade-in zoom-in duration-300">
                <Loader2 className="w-12 h-12 text-[#003da5] animate-spin" />
                <p className="text-[#003da5] font-bold tracking-wide uppercase text-sm text-center">Processando baixa<br/>no sistema...</p>
             </div>
          )}

          {appState === 'success' && (
             <div className="bg-[#ecf0f3] p-10 rounded-[2.5rem] shadow-[8px_8px_16px_#d1d9e6] flex flex-col items-center justify-center gap-6 mt-8 animate-in fade-in slide-in-from-bottom-8 duration-500 text-center">
                <div className="w-24 h-24 bg-[#ecf0f3] shadow-[inset_6px_6px_12px_#d1d9e6] text-[#003da5] rounded-full flex items-center justify-center">
                   <CheckCircle2 className="w-12 h-12" />
                </div>
                
                <div className="space-y-3">
                  <h2 className="text-3xl font-black text-[#003da5] tracking-tight uppercase drop-shadow-sm">Sucesso!</h2>
                  <p className="text-gray-500 font-medium text-sm px-4 leading-relaxed">O pagamento ID:<br/><span className="font-mono text-xs text-[#003da5] font-bold bg-[#ecf0f3] shadow-[inset_2px_2px_4px_#d1d9e6] px-2 py-1 rounded inline-block mt-2">{currentPix?.id}</span><br/><span className="inline-block mt-2">foi baixado com sucesso.</span></p>
                </div>

                <div className="w-full space-y-4 mt-6">
                  <button
                    onClick={generatePDF}
                    className="w-full bg-[#003da5] text-white font-bold uppercase tracking-widest py-4 rounded-2xl shadow-[6px_6px_12px_#d1d9e6] active:shadow-[inset_4px_4px_10px_#002b74,inset_-4px_-4px_10px_#004fd6] transition-all flex items-center justify-center gap-3 shimmer-btn shimmer-btn-dark"
                  >
                     <FileText className="w-5 h-5" />
                     Baixar Comprovante
                  </button>
                  <button
                    onClick={() => {
                      setCurrentPix(null);
                      setErrorMessage('');
                      setAppState('scanning');
                    }}
                    className="w-full bg-[#f8d117] text-[#003da5] font-black uppercase tracking-widest py-4 rounded-2xl shadow-[6px_6px_12px_#d1d9e6] active:shadow-[inset_4px_4px_8px_#d3b213,inset_-4px_-4px_8px_#ffff1b] transition-all flex items-center justify-center gap-3 shimmer-btn"
                  >
                    <ScanLine className="w-5 h-5" />
                    Escanear Outro
                  </button>
                  <button
                    onClick={resetApp}
                    className="w-full bg-[#ecf0f3] text-gray-600 rounded-2xl shadow-[5px_5px_10px_#d1d9e6] active:shadow-[inset_4px_4px_8px_#d1d9e6] font-bold uppercase text-xs tracking-wider py-4 transition-all"
                  >
                    Voltar ao Início
                  </button>
                </div>
             </div>
          )}

          {appState === 'error' && (
            <div className="bg-[#ecf0f3] p-8 rounded-[2rem] shadow-[8px_8px_16px_#d1d9e6] flex flex-col items-center justify-center gap-6 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-300 text-center">
                <div className="w-20 h-20 bg-[#ecf0f3] text-red-500 rounded-full flex items-center justify-center shadow-[inset_5px_5px_10px_#d1d9e6]">
                   <AlertCircle className="w-10 h-10" />
                </div>
                
                <div className="space-y-3 w-full">
                  <h2 className="text-xl font-black text-red-500 tracking-tight uppercase">Erro na Operação</h2>
                  <div className="bg-[#ecf0f3] shadow-[inset_4px_4px_8px_#d1d9e6] text-red-600 p-5 rounded-2xl text-sm text-center w-full font-medium mt-4">
                    {errorMessage}
                  </div>
                </div>

                <div className="w-full space-y-4 mt-6">
                  <button
                    onClick={resetApp}
                    className="w-full bg-[#ecf0f3] text-gray-700 shadow-[6px_6px_12px_#d1d9e6] active:shadow-[inset_4px_4px_8px_#d1d9e6] font-black uppercase tracking-widest py-4 rounded-xl transition-all"
                  >
                    Voltar ao Início
                  </button>
                </div>
             </div>
          )}

          <div className="mt-auto pt-8 pb-4 text-center relative z-10 w-full animate-in fade-in duration-500">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Desenvolvido por Igor Souza</p>
          </div>
        </main>
        
        {/* Home Indicator */}
        <div className="h-1.5 w-36 bg-gray-300/50 rounded-full mx-auto mb-3 opacity-0 md:opacity-100 absolute bottom-0 left-1/2 -translate-x-1/2 z-20"></div>
      </div>
    </div>
  );
}
