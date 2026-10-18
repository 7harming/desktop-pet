import { describe, it, expect } from 'vitest';
import { problemsIn, redactLine, reportFileName, reportMarkdown, type ReportData } from '../../src/main/diagnostics';

describe('problemsIn', () => {
  it('finds the warnings and errors in a log', () => {
    const log = '2026-10-18T01:00:00.000Z [INFO] 啟動 0.8.0\n2026-10-18T01:00:01.000Z [WARN] [xiaozhao] 片段 x 播放失敗\n'
      + '2026-10-18T01:00:02.000Z [ERROR] 控制面板的頁面停了（crashed，結束代碼 1）\nnot a line\n';
    expect(problemsIn(log)).toEqual([
      { at: '2026-10-18T01:00:01.000Z', level: 'WARN', text: '[xiaozhao] 片段 x 播放失敗' },
      { at: '2026-10-18T01:00:02.000Z', level: 'ERROR', text: '控制面板的頁面停了（crashed，結束代碼 1）' },
    ]);
  });
});

describe('redactLine', () => {
  it('leaves out the dishes on the dinner wheel, and nothing else', () => {
    expect(redactLine('x [INFO] 轉盤：轉到 水餃')).toBe('x [INFO] 轉盤：轉到 （菜名略）');
    expect(redactLine('x [INFO] 轉盤：今晚吃 牛肉麵')).toBe('x [INFO] 轉盤：今晚吃 （菜名略）');
    expect(redactLine('x [INFO] 轉盤：沒轉完就收起來了（火鍋 不算）')).toBe('x [INFO] 轉盤：沒轉完就收起來了（（菜名略） 不算）');
    expect(redactLine('x [INFO] 卡片：dinner 打開（hand，xiaozhao）')).toBe('x [INFO] 卡片：dinner 打開（hand，xiaozhao）');
  });
});

describe('reportFileName', () => {
  it('names the report by the local date and time', () => {
    expect(reportFileName(new Date(2026, 9, 18, 9, 5))).toBe('打工貓貓-問題報告-2026-10-18-0905.md');
  });
});

describe('reportMarkdown', () => {
  const data: ReportData = {
    at: new Date(2026, 9, 18, 9, 5, 3),
    app: { version: '0.8.1', electron: '44.4.5', chrome: '142.0.0.0', uptimeS: 3 * 3600 + 12 * 60 },
    system: { os: 'macOS 14.5', arch: 'arm64', locale: 'zh-TW' },
    displays: [{ width: 1512, height: 982, scale: 2, primary: true }],
    cats: [{ name: '小昭', out: true, doing: '趴著', scale: 1, auto: true }, { name: '阿胖', out: false, doing: '', scale: 1, auto: true }],
    cards: ['晚餐轉盤（在 小昭 頭上）'],
    state: { 離開電腦: '否' },
    settings: { 開機自動啟動: '是' },
    processes: [{ type: 'GPU', pid: 42, memoryMB: 120.5, cpu: 0.3 }],
    gpu: { gpu_compositing: 'enabled' },
    problems: [
      { at: '2026-10-18T01:00:02.000Z', level: 'ERROR', text: '控制面板的頁面停了 | crashed' },
      { at: '2026-10-18T01:00:01.000Z', level: 'WARN', text: '片段 x 播放失敗' },
    ],
    logs: [{ file: 'app-1.log', lines: ['2026-10-18T01:00:00.000Z [INFO] 轉盤：轉到 水餃', '2026-10-18T01:00:02.000Z [ERROR] 控制面板的頁面停了'] }],
  };
  const md = reportMarkdown(data);
  it('has every part, in order', () => {
    const parts = ['# 打工貓貓問題報告', '## 基本資料', '## 貓咪', '## 目前狀態', '## 設定', '## 程序與記憶體', '## GPU', '## 問題', '## 最近的紀錄'];
    const at = parts.map(p => md.indexOf(p));
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it('says the basics', () => {
    for (const s of ['0.8.1', 'macOS 14.5（arm64）', '44.4.5 / 142.0.0.0', '3 小時 12 分', '1512×982（縮放 2，主螢幕）', '| 小昭 | 是 | 趴著 |', '晚餐轉盤（在 小昭 頭上）', '| GPU | 42 | 120.5 MB | 0.3% |'])
      expect(md).toContain(s);
  });
  it('lists the problems newest first, a | in them kept out of the table', () => {
    expect(md.indexOf('控制面板的頁面停了 \\| crashed')).toBeGreaterThan(0);
    expect(md.indexOf('控制面板的頁面停了 \\| crashed')).toBeLessThan(md.indexOf('片段 x 播放失敗'));
  });
  it('quotes the logs with the dishes left out', () => {
    expect(md).toContain('### app-1.log');
    expect(md).toContain('轉盤：轉到 （菜名略）');
    expect(md).not.toContain('水餃');
  });
  it('says so when nothing went wrong', () => {
    expect(reportMarkdown({ ...data, problems: [] })).toContain('目前沒有記到問題');
  });
});
