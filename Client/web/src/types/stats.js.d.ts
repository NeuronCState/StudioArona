declare module "stats.js" {
  export default class Stats {
    constructor();
    dom: HTMLDivElement;
    begin(): void;
    end(): void;
    update(): void;
    showPanel(panel: number): void;
  }
}
