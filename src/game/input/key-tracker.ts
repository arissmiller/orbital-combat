export class KeyTracker {
  private readonly pressed = new Set<string>();
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Tab") {
      event.preventDefault();
    }
    this.pressed.add(event.code);
  };
  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.pressed.delete(event.code);
  };

  public attach(target: Window): void {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
  }

  public detach(target: Window): void {
    target.removeEventListener("keydown", this.onKeyDown);
    target.removeEventListener("keyup", this.onKeyUp);
  }

  public isPressed(code: string): boolean {
    return this.pressed.has(code);
  }
}
