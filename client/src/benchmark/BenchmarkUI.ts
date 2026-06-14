/**
 * Benchmark HUD — a game-styled overlay (Cinzel + dark glass + gold accents)
 * showing live FPS, a frame-rate sparkline, the active phase with a progress
 * bar, and a final report card. Pure DOM; no engine coupling.
 */

export interface FpsStats {
  frames: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  lowOnePct: number;
  medianFps: number;
}

export interface PhaseReport extends FpsStats {
  id: string;
  label: string;
}

export interface BenchmarkReportData {
  overall: FpsStats;
  phases: PhaseReport[];
  scene: { npcs: number; collidables: number; draws: number; triangles: number; sceneChildren: number };
  device: { renderer: string; pixelRatio: number };
}

export interface LiveState {
  phaseLabel: string;
  phaseIndex: number;
  phaseCount: number;
  phaseProgress: number; // 0..1
  fps: number;
  npcs: number;
  draws: number;
  triangles: number;
  collidables: number;
  sceneChildren: number;
  px: number;
  pz: number;
}

const SPARK_SAMPLES = 120;

function fpsColor(fps: number): string {
  if (fps >= 55) return '#7ce7a6';
  if (fps >= 30) return '#ffd479';
  return '#ff7a7a';
}

export class BenchmarkUI {
  private readonly root: HTMLDivElement;
  private readonly phaseLabel: HTMLDivElement;
  private readonly phaseStep: HTMLDivElement;
  private readonly progressFill: HTMLDivElement;
  private readonly fpsBig: HTMLDivElement;
  private readonly spark: HTMLCanvasElement;
  private readonly sparkCtx: CanvasRenderingContext2D;
  private readonly stats: HTMLDivElement;
  private readonly history: number[] = [];

  constructor(container: HTMLElement) {
    BenchmarkUI.injectFont();

    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute', top: '18px', left: '18px', zIndex: '10000',
      width: '330px', padding: '16px 18px',
      background: 'linear-gradient(160deg, rgba(14,18,30,0.86), rgba(8,11,20,0.92))',
      border: '1px solid rgba(197,165,90,0.45)', borderRadius: '12px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.55), inset 0 0 24px rgba(197,165,90,0.05)',
      backdropFilter: 'blur(6px)', color: '#e6e9f2',
      fontFamily: "'Cinzel', Georgia, serif", userSelect: 'none', pointerEvents: 'none',
    } as CSSStyleDeclaration);

    const title = document.createElement('div');
    title.textContent = 'ENGINE BENCHMARK';
    Object.assign(title.style, {
      fontSize: '13px', fontWeight: '700', letterSpacing: '0.18em',
      color: '#d9c187', textShadow: '0 0 12px rgba(197,165,90,0.35)', marginBottom: '2px',
    } as CSSStyleDeclaration);

    this.phaseStep = document.createElement('div');
    Object.assign(this.phaseStep.style, {
      fontSize: '10px', letterSpacing: '0.16em', color: '#8a93ad', marginBottom: '10px',
    } as CSSStyleDeclaration);

    this.phaseLabel = document.createElement('div');
    Object.assign(this.phaseLabel.style, {
      fontSize: '15px', color: '#cdd6ec', marginBottom: '8px',
    } as CSSStyleDeclaration);

    // Phase progress bar.
    const track = document.createElement('div');
    Object.assign(track.style, {
      height: '5px', borderRadius: '3px', background: 'rgba(197,165,90,0.14)',
      overflow: 'hidden', marginBottom: '16px',
    } as CSSStyleDeclaration);
    this.progressFill = document.createElement('div');
    Object.assign(this.progressFill.style, {
      width: '0%', height: '100%', borderRadius: '3px',
      background: 'linear-gradient(90deg, #b8924a, #e7cf86)', transition: 'width 0.1s linear',
    } as CSSStyleDeclaration);
    track.appendChild(this.progressFill);

    // Big live FPS readout.
    this.fpsBig = document.createElement('div');
    Object.assign(this.fpsBig.style, {
      fontFamily: "'SF Mono', Consolas, monospace", fontSize: '46px', fontWeight: '700',
      lineHeight: '1', color: '#7ce7a6', textShadow: '0 0 18px rgba(124,231,166,0.25)',
    } as CSSStyleDeclaration);
    const fpsRow = document.createElement('div');
    Object.assign(fpsRow.style, { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' } as CSSStyleDeclaration);
    const fpsUnit = document.createElement('span');
    fpsUnit.textContent = 'FPS';
    Object.assign(fpsUnit.style, { fontSize: '12px', letterSpacing: '0.2em', color: '#8a93ad' } as CSSStyleDeclaration);
    fpsRow.appendChild(this.fpsBig);
    fpsRow.appendChild(fpsUnit);

    // FPS sparkline.
    this.spark = document.createElement('canvas');
    this.spark.width = 294;
    this.spark.height = 46;
    Object.assign(this.spark.style, { width: '100%', height: '46px', display: 'block', marginBottom: '14px', opacity: '0.95' } as CSSStyleDeclaration);
    this.sparkCtx = this.spark.getContext('2d')!;

    // Stat grid.
    this.stats = document.createElement('div');
    Object.assign(this.stats.style, {
      fontFamily: "'SF Mono', Consolas, monospace", fontSize: '11px',
      color: '#aab2c8', lineHeight: '1.7', whiteSpace: 'pre',
    } as CSSStyleDeclaration);

    this.root.append(title, this.phaseStep, this.phaseLabel, track, fpsRow, this.spark, this.stats);
    container.appendChild(this.root);
  }

  pushFps(fps: number): void {
    this.history.push(fps);
    if (this.history.length > SPARK_SAMPLES) this.history.shift();
  }

  update(s: LiveState): void {
    this.phaseStep.textContent = `PHASE ${s.phaseIndex + 1} / ${s.phaseCount}`;
    this.phaseLabel.textContent = s.phaseLabel;
    this.progressFill.style.width = `${(s.phaseProgress * 100).toFixed(1)}%`;

    this.fpsBig.textContent = s.fps.toFixed(0);
    this.fpsBig.style.color = fpsColor(s.fps);
    this.fpsBig.style.textShadow = `0 0 18px ${fpsColor(s.fps)}40`;

    this.drawSpark();

    this.stats.textContent =
      `npcs    ${s.npcs}\n` +
      `draws   ${s.draws}\n` +
      `tris    ${s.triangles.toLocaleString()}\n` +
      `collid  ${s.collidables}\n` +
      `scene   ${s.sceneChildren} objects\n` +
      `pos     ${s.px.toFixed(0)}, ${s.pz.toFixed(0)}`;
  }

  private drawSpark(): void {
    const { sparkCtx: ctx, spark } = this;
    const w = spark.width;
    const h = spark.height;
    ctx.clearRect(0, 0, w, h);

    // 60 / 30 fps guide lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (const guide of [60, 30]) {
      const y = h - (Math.min(guide, 120) / 120) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (this.history.length < 2) return;
    const n = this.history.length;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (SPARK_SAMPLES - 1)) * w;
      const y = h - (Math.min(this.history[i], 120) / 120) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const last = this.history[n - 1];
    ctx.strokeStyle = fpsColor(last);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Fill under the curve.
    ctx.lineTo(((n - 1) / (SPARK_SAMPLES - 1)) * w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = `${fpsColor(last)}1c`;
    ctx.fill();
  }

  showReport(d: BenchmarkReportData): void {
    this.root.style.width = '430px';
    this.root.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = 'BENCHMARK COMPLETE';
    Object.assign(title.style, {
      fontSize: '14px', fontWeight: '700', letterSpacing: '0.16em', color: '#d9c187',
      textShadow: '0 0 14px rgba(197,165,90,0.4)', marginBottom: '14px',
    } as CSSStyleDeclaration);
    this.root.appendChild(title);

    // Headline: overall average.
    const head = document.createElement('div');
    Object.assign(head.style, { display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '4px' } as CSSStyleDeclaration);
    const big = document.createElement('div');
    big.textContent = d.overall.avgFps.toFixed(0);
    Object.assign(big.style, {
      fontFamily: "'SF Mono', Consolas, monospace", fontSize: '40px', fontWeight: '700',
      color: fpsColor(d.overall.avgFps), lineHeight: '1',
    } as CSSStyleDeclaration);
    const sub = document.createElement('div');
    sub.textContent = `avg fps  ·  ${d.overall.lowOnePct.toFixed(0)} low 1%  ·  ${d.overall.minFps.toFixed(0)}–${d.overall.maxFps.toFixed(0)} range`;
    Object.assign(sub.style, { fontSize: '11px', color: '#8a93ad', fontFamily: "'SF Mono', monospace" } as CSSStyleDeclaration);
    head.append(big, sub);
    this.root.appendChild(head);

    // Per-phase table.
    const table = document.createElement('div');
    Object.assign(table.style, {
      fontFamily: "'SF Mono', Consolas, monospace", fontSize: '11px',
      lineHeight: '1.9', marginTop: '14px', color: '#aab2c8',
    } as CSSStyleDeclaration);
    const header = document.createElement('div');
    header.textContent = `${'phase'.padEnd(22)}avg  1%lo  low  high`;
    Object.assign(header.style, { color: '#d9c187', borderBottom: '1px solid rgba(197,165,90,0.25)', paddingBottom: '3px', whiteSpace: 'pre' } as CSSStyleDeclaration);
    table.appendChild(header);
    for (const p of d.phases) {
      const line = document.createElement('div');
      Object.assign(line.style, { whiteSpace: 'pre' } as CSSStyleDeclaration);
      const cells = `${p.label.slice(0, 21).padEnd(22)}` +
        `${p.avgFps.toFixed(0).padStart(3)}  ${p.lowOnePct.toFixed(0).padStart(4)}  ` +
        `${p.minFps.toFixed(0).padStart(3)}  ${p.maxFps.toFixed(0).padStart(4)}`;
      line.textContent = cells;
      line.style.color = fpsColor(p.avgFps);
      table.appendChild(line);
    }
    this.root.appendChild(table);

    // Peak load + device footer.
    const foot = document.createElement('div');
    Object.assign(foot.style, {
      marginTop: '14px', paddingTop: '10px', borderTop: '1px solid rgba(197,165,90,0.2)',
      fontFamily: "'SF Mono', monospace", fontSize: '10px', color: '#8a93ad', lineHeight: '1.7', whiteSpace: 'pre-wrap',
    } as CSSStyleDeclaration);
    foot.textContent =
      `peak  ${d.scene.npcs} npcs · ${d.scene.collidables} collid · ${d.scene.draws} draws · ${d.scene.triangles.toLocaleString()} tris\n` +
      `gpu   ${d.device.renderer} @ ${d.device.pixelRatio}×\n` +
      `full report → console & window.__benchmarkReport · reload to re-run`;
    this.root.appendChild(foot);

    this.root.style.pointerEvents = 'auto';
  }

  private static injectFont(): void {
    if (document.querySelector('link[href*="Cinzel"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap';
    document.head.appendChild(link);
  }
}
