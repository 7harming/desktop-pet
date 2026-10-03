# Runs the end-to-end tests on a desktop of their own that is never shown, so the cats, cards and the full-screen break do not
# take over the screen of whoever is using the computer. Arguments go to `playwright test` (spec files, -g "name", ...).
#   npm run test:e2e:hidden -- tests/e2e/toy.spec.ts
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8   # the test names and messages are UTF-8
$root = Split-Path -Parent $PSScriptRoot

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class HiddenDesktop {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct StartupInfo {
    public int cb; public string reserved; public string desktop; public string title;
    public int x, y, xSize, ySize, xChars, yChars, fill, flags;
    public short showWindow, reserved2; public IntPtr reserved3, stdIn, stdOut, stdErr;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct ProcessInfo { public IntPtr process, thread; public int processId, threadId; }
  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr devmode, int flags, uint access, IntPtr attributes);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool CreateProcess(string app, string commandLine, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env,
    string dir, ref StartupInfo si, out ProcessInfo pi);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

  static IntPtr desktop, process;

  /** Start `commandLine` in `dir` on the desktop `name` (made if need be). */
  public static void Start(string name, string commandLine, string dir) {
    desktop = CreateDesktop(name, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000 /* GENERIC_ALL */, IntPtr.Zero);
    if (desktop == IntPtr.Zero) throw new Exception("CreateDesktop failed: " + Marshal.GetLastWin32Error());
    StartupInfo si = new StartupInfo();
    si.cb = Marshal.SizeOf(si);
    si.desktop = name;
    ProcessInfo pi;
    if (!CreateProcess(null, commandLine, IntPtr.Zero, IntPtr.Zero, false, 0x08000000 /* CREATE_NO_WINDOW */, IntPtr.Zero, dir, ref si, out pi))
      throw new Exception("CreateProcess failed: " + Marshal.GetLastWin32Error());
    CloseHandle(pi.thread);
    process = pi.process;
  }

  /** Whether it is still running after waiting up to `ms`. */
  public static bool Running(uint ms) { return WaitForSingleObject(process, ms) == 0x102; /* WAIT_TIMEOUT */ }

  public static int Finish() {
    uint code;
    GetExitCodeProcess(process, out code);
    CloseHandle(process);
    CloseDesktop(desktop);
    return (int)code;
  }
}
'@

# build and make the test packs here (no windows); only the tests themselves go to the hidden desktop
Push-Location $root
try {
  cmd /d /c 'node scripts/build.mjs >nul 2>&1'
  if ($LASTEXITCODE) { throw 'build failed (npm run build shows why)' }
  cmd /d /c 'node scripts/make-test-pack.mjs >nul 2>&1'
  if ($LASTEXITCODE) { throw 'making the test packs failed (node scripts/make-test-pack.mjs shows why)' }
} finally { Pop-Location }

$log = Join-Path ([IO.Path]::GetTempPath()) "dpet-e2e-hidden-$PID.log"
$quoted = ($args | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ' '
[HiddenDesktop]::Start('dpet-e2e', "cmd.exe /d /c npx.cmd playwright test $quoted > `"$log`" 2>&1", $root)

# show the test output as it comes
$shown = 0
$print = {
  if (-not (Test-Path $log)) { return }
  $f = [IO.FileStream]::new($log, 'Open', 'Read', 'ReadWrite')   # cmd still has it open for writing
  try { $text = [IO.StreamReader]::new($f, [Text.Encoding]::UTF8).ReadToEnd() } finally { $f.Dispose() }
  if ($text.Length -gt $shown) { [Console]::Write($text.Substring($shown)); $script:shown = $text.Length }
}
while ([HiddenDesktop]::Running(1000)) { & $print }
& $print
$code = [HiddenDesktop]::Finish()
Remove-Item $log -ErrorAction SilentlyContinue
exit $code
