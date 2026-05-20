import { Html5QrcodeScanner } from 'html5-qrcode';
import { useEffect, useRef, useState } from 'react';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (errorMessage: string) => void;
}

const qrcodeRegionId = "html5qr-code-full-region";

export function QrScanner({ onScanSuccess, onScanError }: QrScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const successRef = useRef(onScanSuccess);
  const errorRef = useRef(onScanError);

  useEffect(() => {
    successRef.current = onScanSuccess;
    errorRef.current = onScanError;
  }, [onScanSuccess, onScanError]);

  useEffect(() => {
    // Prevent multiple initializations in React 18 strict mode
    if (!scannerRef.current) {
        scannerRef.current = new Html5QrcodeScanner(
            qrcodeRegionId,
            {
               fps: 10,
               qrbox: { width: 250, height: 250 },
               aspectRatio: 1.0,
            },
            false // verbose = false
        );

        scannerRef.current.render(
          (decodedText) => {
            if (successRef.current) successRef.current(decodedText);
          }, 
          (error) => {
            const errString = typeof error === 'string' ? error : (error?.message || error?.toString() || '');
            
            // Ignore normal "no qr code found" exceptions that fire every frame
            if (errString.includes('NotFoundException')) {
                return;
            }
            
            // It's a real camera or permission error
            setCameraError("Não foi possível acessar a câmera. Verifique as permissões de acesso.");
            
            if (errorRef.current) {
                errorRef.current(errString);
            }
        });
    }

    return () => {
        if (scannerRef.current) {
            scannerRef.current.clear().catch(error => {
                console.error("Failed to clear html5QrcodeScanner. ", error);
            });
            scannerRef.current = null;
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-md mx-auto relative flex flex-col items-center">
      {cameraError && (
        <div className="bg-red-50 text-red-600 p-3 mb-3 rounded-lg text-sm border border-red-200 text-center w-full font-medium shadow-sm">
          {cameraError}
        </div>
      )}
      <div id={qrcodeRegionId} className="w-full overflow-hidden h-full rounded-2xl bg-transparent" />
    </div>
  );
}

