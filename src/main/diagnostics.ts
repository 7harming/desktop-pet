/** A warning or an error in the log: when (ISO time), how bad, and what. */
export interface Problem { at: string; level: 'WARN' | 'ERROR'; text: string }

/**
 * What a problem report holds (the panel's 問題紀錄 makes one, to hand over for debugging). Never the reminders', the memo's or
 * the dinner wheel's contents: the logs it quotes have their dishes left out (redactLine).
 */
export interface ReportData {
  at: Date;
  app: { version: string; electron: string; chrome: string; uptimeS: number };
  system: { os: string; arch: string; locale: string };
  displays: { width: number; height: number; scale: number; primary: boolean }[];
  cats: { name: string; out: boolean; doing: string; scale: number; auto: boolean }[];
  /** The cards open now, each said with the cat it is over. */
  cards: string[];
  state: Record<string, string>;
  settings: Record<string, string>;
  processes: { type: string; pid: number; memoryMB: number; cpu: number }[];
  gpu: Record<string, string>;
  /** Newest first. */
  problems: Problem[];
  /** The last lines of each log kept, oldest log first. */
  logs: { file: string; lines: string[] }[];
}

const LINE = /^(\S+) \[(WARN|ERROR)\] (.*)$/;

/** The warnings and errors in a log's text. */
export function problemsIn(text: string): Problem[] {
  return text.split(/\r?\n/).flatMap(l => {
    const m = LINE.exec(l);
    return m ? [{ at: m[1], level: m[2] as Problem['level'], text: m[3] }] : [];
  });
}

const DISH = '（菜名略）';
/** A log line as a report quotes it: the dinner wheel's dishes left out (the menu is the owner's own). */
export function redactLine(line: string): string {
  return line.replace(/(轉盤：(?:轉到|今晚吃) )\S+/, `$1${DISH}`).replace(/(轉盤：沒轉完就收起來了（)\S+( 不算）)/, `$1${DISH}$2`);
}

const pad = (n: number) => String(n).padStart(2, '0');
const localTime = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const yes = (b: boolean) => (b ? '是' : '否');
const list = (r: Record<string, string>) => Object.entries(r).map(([k, v]) => `- ${k}：${v}`);

/** The report's file name, by the local date and time it was made. */
export const reportFileName = (d: Date): string =>
  `打工貓貓-問題報告-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.md`;

export function reportMarkdown(r: ReportData): string {
  const up = Math.floor(r.app.uptimeS / 60);
  return [
    '# 打工貓貓問題報告', '',
    `產生時間：${localTime(r.at)}（這台電腦的時間）`, '',
    '## 基本資料', '',
    '| 項目 | 內容 |', '|---|---|',
    `| 版本 | ${r.app.version} |`,
    `| 系統 | ${r.system.os}（${r.system.arch}） |`,
    `| Electron / Chrome | ${r.app.electron} / ${r.app.chrome} |`,
    `| 程式已開 | ${Math.floor(up / 60)} 小時 ${up % 60} 分 |`,
    `| 語言 | ${r.system.locale} |`,
    ...r.displays.map(d => `| 螢幕 | ${d.width}×${d.height}（縮放 ${d.scale}${d.primary ? '，主螢幕' : ''}） |`), '',
    '## 貓咪', '',
    '| 貓 | 在桌上 | 正在 | 大小 | 自動行動 |', '|---|---|---|---|---|',
    ...r.cats.map(c => `| ${cell(c.name)} | ${yes(c.out)} | ${cell(c.doing) || '—'} | ${c.scale} | ${yes(c.auto)} |`), '',
    '## 目前狀態', '',
    `- 開著的卡片：${r.cards.length ? r.cards.join('、') : '沒有'}`, ...list(r.state), '',
    '## 設定', '', ...list(r.settings), '',
    '## 程序與記憶體', '',
    '| 種類 | PID | 記憶體 | CPU |', '|---|---|---|---|',
    ...r.processes.map(p => `| ${cell(p.type)} | ${p.pid} | ${p.memoryMB.toFixed(1)} MB | ${p.cpu.toFixed(1)}% |`), '',
    '## GPU', '', ...list(r.gpu), '',
    '## 問題（新的在上）', '',
    ...(r.problems.length
      ? ['| 時間 | 等級 | 說明 |', '|---|---|---|',
        ...r.problems.map(p => `| ${localTime(new Date(p.at))} | ${p.level === 'ERROR' ? '錯誤' : '警告'} | ${cell(p.text)} |`)]
      : ['目前沒有記到問題。']), '',
    '## 最近的紀錄', '',
    ...r.logs.flatMap(l => [`### ${l.file}`, '', '```text', ...l.lines.map(redactLine), '```', '']),
  ].join('\n');
}
