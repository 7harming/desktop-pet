// Another program playing a video full screen (magenta), for the full-screen test. `--topmost`: one that stays on top too.
const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const w = new BrowserWindow({ fullscreen: true, backgroundColor: '#ff00ff', show: false });
  if (process.argv.includes('--topmost')) w.setAlwaysOnTop(true, 'pop-up-menu');
  void w.loadURL('data:text/html,<body style="background:%23ff00ff"></body>');
  w.once('ready-to-show', () => { w.show(); w.focus(); });
});
