import Phaser from "phaser";

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 540;
const GRID = 48;

/**
 * Renderer bootstrap scene. It proves Phaser initialises inside the Vue shell;
 * it draws only a neutral grid. World projections are rendered from Phase 20.
 */
export class RendererBootScene extends Phaser.Scene {
  constructor() {
    super("renderer-boot");
  }

  create(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x0f1b24, 1).fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    graphics.lineStyle(1, 0x24394a, 1);
    for (let x = 0; x <= MAP_WIDTH; x += GRID) graphics.lineBetween(x, 0, x, MAP_HEIGHT);
    for (let y = 0; y <= MAP_HEIGHT; y += GRID) graphics.lineBetween(0, y, MAP_WIDTH, y);
    this.game.events.emit("renderer-ready");
  }
}

export function createMapGame(parent: HTMLElement, onReady: () => void): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    backgroundColor: "#0f1b24",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene: [RendererBootScene],
    banner: false,
  });
  game.events.once("renderer-ready", onReady);
  return game;
}
