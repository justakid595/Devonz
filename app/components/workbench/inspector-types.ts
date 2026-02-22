import type { BoxModelData } from './BoxModelEditor';

export interface ElementInfo {
  displayText: string;
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  styles: Record<string, string>;
  boxModel?: BoxModelData;
  selector?: string;
  colors?: string[];
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
  };
}
