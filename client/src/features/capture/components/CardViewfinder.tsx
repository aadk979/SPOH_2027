import type { ReactNode, RefObject } from 'react';
import type { ScannerState } from '../useQrScanner';
const SCANNER_MESSAGE: Record<ScannerState, string> = {
  scanning: 'Point the camera at the QR code on the card.',
  starting: 'Starting the camera…',
  denied: 'The camera is not available. Type the six-character code instead.',
  unavailable: 'This device cannot scan. Type the six-character code instead.',
  idle: 'Camera off.',
};

export function CardViewfinder({
  videoRef,
  scannerState,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  scannerState: ScannerState;
}): ReactNode {
  const isCameraDisabled = scannerState === 'denied' || scannerState === 'unavailable';
  return (
    <>
      {' '}
      <div
        className={`mx-auto w-full max-w-form overflow-hidden rounded-lg bg-void [aspect-ratio:4/3] ${
          isCameraDisabled ? 'hidden' : ''
        }`}
      >
        {/* muted + playsInline are required for autoplay on iOS. */}
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          aria-label="Camera viewfinder for scanning a Mission Card"
        />
      </div>
      <p className="text-caption text-text-muted" aria-live="polite">
        {SCANNER_MESSAGE[scannerState]}
      </p>
    </>
  );
}
