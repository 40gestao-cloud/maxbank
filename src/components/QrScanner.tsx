import { Html5Qrcode } from 'html5-qrcode';
import { useEffect, useRef, useState } from 'react';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (errorMessage: string) => void;
}

const REGION_ID = 'maxbank-qr-region';

export function QrScanner({ onScanSuccess, onScanError }: QrScannerProps) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const successRef = useRef(onScanSuccess);
  const errorRef = useRef(onScanError);

  useEffect(() => {
    successRef.current = onScanSuccess;
    errorRef.current = onScanError;
  }, [onScanSuccess, onScanError]);

  useEffect(() => {
    const instance = new Html5Qrcode(REGION_ID, { verbose: false } as any);
    let cancelled = false;

    const onDecode = (decodedText: string) => {
      successRef.current?.(decodedText);
    };

    const onFrameError = (err: string) => {
      // "NotFoundException" dispara a cada frame sem QR — ignora ruído
      if (typeof err === 'string' && err.includes('NotFoundException')) return;
      errorRef.current?.(err);
    };

    const config = {
      fps: 10,
      qrbox: (vw: number, vh: number) => {
        const side = Math.floor(Math.min(vw, vh) * 0.7);
        return { width: side, height: side };
      },
      aspectRatio: 1,
    };

    (async () => {
      try {
        // Tenta câmera traseira de forma estrita; cai para "environment" não-exato
        // em desktops/celulares com apenas uma câmera.
        try {
          await instance.start({ facingMode: { exact: 'environment' } }, config, onDecode, onFrameError);
        } catch {
          await instance.start({ facingMode: 'environment' }, config, onDecode, onFrameError);
        }

        if (cancelled) {
          await instance.stop().catch(() => {});
          return;
        }
        setIsStarting(false);
      } catch (err: any) {
        if (cancelled) return;
        const msg = String(err?.message || err || '');
        setCameraError(
          /Permission|NotAllowed|denied/i.test(msg)
            ? 'Permissão de câmera negada. Habilite o acesso nas configurações do navegador e tente novamente.'
            : /NotFound|no camera/i.test(msg)
            ? 'Nenhuma câmera encontrada neste dispositivo.'
            : 'Não foi possível abrir a câmera. Verifique se outro aplicativo a está usando.',
        );
        setIsStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      if (instance.isScanning) {
        instance
          .stop()
          .catch(() => {})
          .finally(() => {
            try { instance.clear(); } catch { /* noop */ }
          });
      } else {
        try { instance.clear(); } catch { /* noop */ }
      }
    };
  }, []);

  return (
    <div className="w-full h-full relative">
      <div id={REGION_ID} className="w-full h-full" />

      {isStarting && !cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-20 bg-black/30 backdrop-blur-sm">
          <div className="w-10 h-10 rounded-full border-2 border-[#f8d117] border-t-transparent animate-spin"></div>
          <p className="mt-3 text-xs font-medium tracking-wide">Abrindo câmera…</p>
        </div>
      )}

      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center p-5 bg-black/75 z-20">
          <p className="bg-white text-red-600 p-4 rounded-2xl text-sm text-center font-medium shadow-lg leading-relaxed max-w-xs">
            {cameraError}
          </p>
        </div>
      )}
    </div>
  );
}
