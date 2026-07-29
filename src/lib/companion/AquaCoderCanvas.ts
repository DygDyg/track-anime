export type AnimationDefinition = {
  image: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  columns: number;
  /** Natural animation cadence, before a playback-rate multiplier is applied. */
  baseFps: number;
  /** Default speed multiplier for this animation. 0.5 = twice as slow; 2 = twice as fast. */
  playbackRate: number;
  loop: boolean;
  /** Explicit semantic mode. Keep `loop` too for compatibility with older manifests. */
  mode: "loop" | "once";
  preload?: boolean;
  returnTo?: string;
};

export type CompanionManifest = {
  version: number;
  id: string;
  default: string;
  fallback: string;
  animations: Record<string, AnimationDefinition>;
};

export type AquaCoderCanvasOptions = {
  manifestUrl?: string;
  pixelRatio?: number;
  scale?: number;
  onError?: (error: Error) => void;
  /** Fires exactly once when a `mode: "once"` animation reaches its final frame. */
  onAnimationComplete?: (event: AnimationCompleteEvent) => void;
};

export type AnimationCompleteEvent = {
  animation: string;
  returnTo: string;
  /** Set `true` in the handler to skip automatic `returnTo` playback. */
  cancelAutoReturn?: boolean;
};

export type PlayOptions = {
  /** Temporary speed multiplier for this playback. Overrides manifest playbackRate. */
  playbackRate?: number;
};

type PendingPlay = {
  name: string;
  playbackRate: number;
};

/** Framework-independent sprite player. It fetches the manifest once and each atlas only on first use. */
export class AquaCoderCanvas {
  private readonly context: CanvasRenderingContext2D;
  private readonly manifestUrl: string;
  private pixelRatio: number;
  private scale: number;
  private readonly onError?: (error: Error) => void;
  private readonly onAnimationComplete?: (event: AnimationCompleteEvent) => void;
  private manifest!: CompanionManifest;
  private readonly images = new Map<string, HTMLImageElement>();
  private current = "";
  private frame = 0;
  private frameStartedAt = 0;
  private playbackRate = 1;
  /** When true, only frame 0 is shown; no frame advancement. */
  private staticMode = false;
  /** When > 0, loop animation holds the last frame until this timestamp. */
  private loopGapUntil = 0;
  /** Latest requested animation; applied when the current cycle finishes. */
  private pending: PendingPlay | null = null;
  /** Monotonic token so a slower `play()` load cannot overwrite a newer request. */
  private playToken = 0;
  private animationFrame?: number;
  private paused = false;
  private transitioning = false;
  private observer?: IntersectionObserver;
  private readonly visibilityHandler = () => { this.paused = document.hidden; };

  constructor(private readonly canvas: HTMLCanvasElement, options: AquaCoderCanvasOptions = {}) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    this.manifestUrl = options.manifestUrl ?? "/companion/aqua-coder-chibi/manifest.json";
    this.pixelRatio = options.pixelRatio ?? window.devicePixelRatio ?? 1;
    this.scale = options.scale ?? 1;
    this.onError = options.onError;
    this.onAnimationComplete = options.onAnimationComplete;
  }

  async start(initial?: string): Promise<void> {
    try {
      this.manifest = await this.fetchManifest();
      const name = initial ?? this.manifest.default;
      const animation = this.manifest.animations[name];
      if (!animation) throw new Error(`Unknown Aqua Coder animation: ${name}`);
      const token = ++this.playToken;
      await this.load(name);
      if (token !== this.playToken) return;
      this.pending = null;
      this.applyPlay(name, animation.playbackRate);
      this.observeVisibility();
      this.animationFrame = requestAnimationFrame(this.draw);
      if (this.staticMode) this.finishOnceIfNeeded();
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Downloads an atlas only once and then uses browser plus memory cache.
   * If another animation is mid-cycle, queues this request and switches only when that cycle ends.
   */
  async play(name: string, options: PlayOptions = {}): Promise<void> {
    const animation = this.manifest.animations[name];
    if (!animation) throw new Error(`Unknown Aqua Coder animation: ${name}`);
    const playbackRate = options.playbackRate ?? animation.playbackRate;
    this.assertPlaybackRate(playbackRate);
    const token = ++this.playToken;
    this.pending = { name, playbackRate };
    await this.load(name);
    if (token !== this.playToken) return;
    if (this.isMidCycle() && name !== this.current) {
      return;
    }
    this.pending = null;
    this.applyPlay(name, playbackRate);
    if (this.staticMode) this.finishOnceIfNeeded();
  }

  private applyPlay(name: string, playbackRate: number): void {
    this.current = name;
    this.playbackRate = playbackRate;
    this.frame = 0;
    this.frameStartedAt = performance.now();
    this.loopGapUntil = 0;
    this.transitioning = false;
    this.resize();
  }

  /** True while the current clip still has frames left in this cycle. */
  private isMidCycle(): boolean {
    if (this.staticMode || !this.current || !this.manifest) return false;
    if (this.transitioning) return false;
    if (this.loopGapUntil > 0) return false;
    return true;
  }

  /** Apply queued play at a cycle boundary. Returns true if a switch happened. */
  private flushPendingPlay(): boolean {
    const next = this.pending;
    if (!next) return false;
    if (!this.images.has(next.name)) {
      // Atlas still loading — hold last frame until it arrives.
      return false;
    }
    this.pending = null;
    this.applyPlay(next.name, next.playbackRate);
    if (this.staticMode) this.finishOnceIfNeeded();
    return true;
  }

  /** Changes the on-screen size without restarting the animation. */
  setScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error("scale must be a number greater than zero.");
    }
    if (scale === this.scale) return;
    this.scale = scale;
    if (this.manifest) this.resize();
  }

  /** Freeze on the first frame of each pose (no playback / loop gaps). */
  setStaticMode(enabled: boolean): void {
    this.staticMode = enabled;
    this.frame = 0;
    this.loopGapUntil = 0;
    this.frameStartedAt = performance.now();
    if (enabled) {
      this.flushPendingPlay();
      this.finishOnceIfNeeded();
    }
  }

  /** Changes the speed of the currently playing animation without restarting its frame sequence. */
  setPlaybackRate(playbackRate: number): void {
    this.assertPlaybackRate(playbackRate);
    this.playbackRate = playbackRate;
    this.frameStartedAt = performance.now();
  }

  stop(): void {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.observer?.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
  }

  destroy(): void {
    this.stop();
    this.pending = null;
    this.images.clear();
  }

  private fetchManifest = async (): Promise<CompanionManifest> => {
    const response = await fetch(this.manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Cannot load companion manifest: ${response.status}`);
    const manifest = (await response.json()) as CompanionManifest;
    if (!manifest.animations[manifest.default]) throw new Error("Companion manifest has no default animation.");
    for (const [name, animation] of Object.entries(manifest.animations)) {
      if (!Number.isFinite(animation.baseFps) || animation.baseFps <= 0) {
        throw new Error(`Animation ${name} has an invalid baseFps.`);
      }
      if (animation.mode !== "loop" && animation.mode !== "once") {
        throw new Error(`Animation ${name} has an invalid mode.`);
      }
      if (animation.loop !== (animation.mode === "loop")) {
        throw new Error(`Animation ${name} has conflicting loop and mode values.`);
      }
      this.assertPlaybackRate(animation.playbackRate);
    }
    return manifest;
  };

  private load(name: string): Promise<HTMLImageElement> {
    const existing = this.images.get(name);
    if (existing) return Promise.resolve(existing);
    const animation = this.manifest.animations[name];
    const image = new Image();
    image.decoding = "async";
    // manifestUrl may be site-relative (`/companion/.../manifest.json`); URL needs an absolute base.
    image.src = new URL(animation.image, new URL(this.manifestUrl, window.location.href)).href;
    return new Promise((resolve, reject) => {
      image.onload = () => { this.images.set(name, image); resolve(image); };
      image.onerror = () => reject(new Error(`Cannot load companion atlas: ${animation.image}`));
    });
  }

  private resize(): void {
    // Keep on-screen box stable (default idle size) so a bad/HD atlas cannot blow up the canvas.
    const box =
      this.manifest.animations[this.manifest.default] ?? this.manifest.animations[this.current];
    const width = Math.round(box.frameWidth * this.scale * this.pixelRatio);
    const height = Math.round(box.frameHeight * this.scale * this.pixelRatio);
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${Math.round(width / this.pixelRatio)}px`;
    this.canvas.style.height = `${Math.round(height / this.pixelRatio)}px`;
    this.context.imageSmoothingEnabled = true;
  }

  private sourceCell(image: HTMLImageElement, animation: AnimationDefinition): {
    cellWidth: number;
    cellHeight: number;
  } {
    // Prefer declared cell size so padded strips (e.g. 8×192 with fewer live frames) slice correctly.
    const cellWidth = animation.frameWidth > 0
      ? animation.frameWidth
      : image.naturalWidth / Math.max(1, animation.columns);
    const cellHeight = animation.frameHeight > 0
      ? animation.frameHeight
      : image.naturalHeight / Math.max(1, Math.ceil(animation.frames / Math.max(1, animation.columns)));
    return { cellWidth, cellHeight };
  }

  private observeVisibility(): void {
    this.observer = new IntersectionObserver(([entry]) => { this.paused = !entry.isIntersecting; }, { threshold: 0 });
    this.observer.observe(this.canvas);
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  private draw = (now: number): void => {
    if (!this.paused) {
      let animation = this.manifest.animations[this.current];
      if (!this.staticMode) {
        if (this.loopGapUntil > 0) {
          if (this.pending && this.flushPendingPlay()) {
            animation = this.manifest.animations[this.current];
          } else if (now >= this.loopGapUntil) {
            this.loopGapUntil = 0;
            this.frame = 0;
            this.frameStartedAt = now;
          }
        } else {
          const duration = 1000 / (animation.baseFps * this.playbackRate);
          if (now - this.frameStartedAt >= duration) {
            const steps = Math.floor((now - this.frameStartedAt) / duration);
            this.frameStartedAt += steps * duration;
            this.frame += steps;
            if (this.frame >= animation.frames) {
              if (this.pending) {
                if (this.flushPendingPlay()) {
                  animation = this.manifest.animations[this.current];
                } else {
                  // Keep last frame until the queued atlas finishes loading.
                  this.frame = animation.frames - 1;
                }
              } else if (animation.mode === "loop") {
                // Continuous motion poses — no idle-style pause between cycles.
                if (
                  this.current === "jumpRopeLoading"
                  || this.current === "runRight"
                  || this.current === "runLeft"
                  || this.current === "jump"
                  || this.current === "work"
                ) {
                  this.frame %= animation.frames;
                } else {
                  this.frame = animation.frames - 1;
                  this.loopGapUntil = now + Math.random() * 5000;
                }
              } else if (!this.transitioning) {
                this.frame = animation.frames - 1;
                this.finishOnceAnimation(animation.returnTo ?? this.manifest.fallback);
                animation = this.manifest.animations[this.current];
              }
            }
          }
        }
      } else {
        this.frame = 0;
      }
      const image = this.images.get(this.current);
      if (image && image.naturalWidth > 0 && animation) {
        const { cellWidth, cellHeight } = this.sourceCell(image, animation);
        const atlasColumns = Math.max(1, Math.round(image.naturalWidth / cellWidth));
        const column = this.frame % atlasColumns;
        const row = Math.floor(this.frame / atlasColumns);
        const fit = Math.min(this.canvas.width / cellWidth, this.canvas.height / cellHeight);
        const drawWidth = cellWidth * fit;
        const drawHeight = cellHeight * fit;
        const dx = (this.canvas.width - drawWidth) / 2;
        const dy = this.canvas.height - drawHeight;
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.drawImage(
          image,
          column * cellWidth,
          row * cellHeight,
          cellWidth,
          cellHeight,
          dx,
          dy,
          drawWidth,
          drawHeight,
        );
      }
    }
    this.animationFrame = requestAnimationFrame(this.draw);
  };

  private finishOnceIfNeeded(): void {
    if (!this.manifest || this.transitioning) return;
    const animation = this.manifest.animations[this.current];
    if (!animation || animation.mode !== "once") return;
    this.finishOnceAnimation(animation.returnTo ?? this.manifest.fallback);
  }

  private finishOnceAnimation(returnTo: string): void {
    if (this.transitioning) return;
    this.transitioning = true;
    const queued = this.pending;
    const event: AnimationCompleteEvent = {
      animation: this.current,
      returnTo: queued?.name ?? returnTo,
    };
    this.onAnimationComplete?.(event);
    if (event.cancelAutoReturn) {
      this.transitioning = false;
      this.flushPendingPlay();
      return;
    }
    if (queued) {
      this.pending = null;
      void this.load(queued.name)
        .then(() => {
          this.applyPlay(queued.name, queued.playbackRate);
        })
        .finally(() => {
          this.transitioning = false;
        });
      return;
    }
    void this.play(returnTo).finally(() => {
      this.transitioning = false;
    });
  }

  private assertPlaybackRate(playbackRate: number): void {
    if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
      throw new Error("playbackRate must be a number greater than zero.");
    }
  }
}
