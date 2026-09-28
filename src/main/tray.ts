import { Menu, nativeImage, Notification, Tray, type MenuItemConstructorOptions } from 'electron';

export class TrayController {
  private readonly tray: Tray;

  constructor(iconPath: string | null, private readonly build: () => MenuItemConstructorOptions[], onClick: () => void) {
    const icon = iconPath ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
    this.tray = new Tray(icon);
    this.tray.setToolTip('毛孩桌寵');
    this.tray.on('click', onClick);
    this.refresh();
  }

  refresh(): void { this.tray.setContextMenu(Menu.buildFromTemplate(this.build())); }

  /** A notice from the tray icon (Windows shows it as a toast; elsewhere it is an ordinary notification). */
  balloon(title: string, content: string): void {
    if (process.platform === 'win32') this.tray.displayBalloon({ title, content, iconType: 'none' });
    else if (Notification.isSupported()) new Notification({ title, body: content }).show();
  }
  destroy(): void { this.tray.destroy(); }
}
