export interface FixedStepOptions {
  stepSeconds: number;
  maxAccumulatedSeconds?: number;
}

export class FixedStepLoop {
  private readonly stepSeconds: number;
  private readonly maxAccumulatedSeconds: number;
  private accumulator = 0;

  public constructor(options: FixedStepOptions) {
    this.stepSeconds = options.stepSeconds;
    this.maxAccumulatedSeconds = options.maxAccumulatedSeconds ?? options.stepSeconds * 5;
  }

  public tick(deltaMilliseconds: number, onStep: (stepSeconds: number) => void): void {
    const deltaSeconds = Math.min(deltaMilliseconds / 1000, this.maxAccumulatedSeconds);
    this.accumulator += deltaSeconds;

    while (this.accumulator >= this.stepSeconds) {
      onStep(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
    }
  }
}
