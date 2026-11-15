// One definition of the scene background for both the WebGL backdrop and the CSS fallback
// (`.app` in ui-polish.css mirrors these values): ellipse 70% × 80% centred at 54% / 38%.
export const SCENE_ELLIPSE = {x: 0.54, y: 0.38, rx: 0.7, ry: 0.8};
export const SCENE_STOPS = [
  [0, '#1d4048'],
  [0.12, '#17363f'],
  [0.26, '#122c3c'],
  [0.4, '#0f2236'],
  [0.54, '#0c1a2e'],
  [0.68, '#0a1424'],
  [0.82, '#080f1c'],
  [1, '#060a14'],
];
