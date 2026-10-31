import { QRCodeSVG } from 'qrcode.react';
import { useT } from '../i18n/useT.js';
import styles from './RoomQr.module.css';

/** Dark on white with a quiet zone, whatever the page theme: a phone must read it off a projector. */
export function RoomQr({ url }: { url: string }) {
  const { t } = useT();
  return (
    <div className={styles.qr}>
      <QRCodeSVG value={url} title={t.lobby.qr(url)} level="M" marginSize={2} className={styles.code} />
    </div>
  );
}
