import React, {useEffect, useRef} from 'react';
import {SCENE_STOPS, SCENE_ELLIPSE} from './scene-gradient.js';

// The app background drawn in WebGL instead of CSS. A dark, wide gradient has only a dozen 8-bit levels
// across hundreds of pixels, so CSS shows rings. The shader computes the same gradient in float and adds a
// sub-level offset per pixel (interleaved gradient noise, < ±0.5 of one 8-bit step) before the colour is
// written — the steps disappear and nothing visible is added. Drawn once per size; without WebGL the CSS
// gradient stays as it is.
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `precision highp float;
uniform vec2 size;
uniform vec2 center;
uniform vec2 radii;
uniform vec3 colors[${SCENE_STOPS.length}];
uniform float offsets[${SCENE_STOPS.length}];
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  vec2 frag = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
  float d = length((frag - center) / radii);
  vec3 c = colors[0];
  for (int i = 1; i < ${SCENE_STOPS.length}; i++) {
    float a = offsets[i - 1], b = offsets[i];
    c = mix(c, colors[i], clamp((d - a) / max(b - a, 1e-4), 0.0, 1.0));
  }
  c += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

export function SceneBackdrop() {
  const canvas = useRef(null);
  useEffect(() => {
    const el = canvas.current;
    const gl = el.getContext('webgl', {antialias: false, alpha: false, premultipliedAlpha: false});
    if (!gl) return;
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT),
      fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(
      gl.getUniformLocation(program, 'colors'),
      SCENE_STOPS.flatMap(([, hex]) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255))
    );
    gl.uniform1fv(
      gl.getUniformLocation(program, 'offsets'),
      SCENE_STOPS.map(([at]) => at)
    );
    const uSize = gl.getUniformLocation(program, 'size'),
      uCenter = gl.getUniformLocation(program, 'center'),
      uRadii = gl.getUniformLocation(program, 'radii');
    let frame = 0;
    const draw = () => {
      frame = 0;
      const ratio = window.devicePixelRatio || 1,
        w = Math.max(1, Math.round(el.clientWidth * ratio)),
        h = Math.max(1, Math.round(el.clientHeight * ratio));
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uSize, w, h);
      gl.uniform2f(uCenter, w * SCENE_ELLIPSE.x, h * SCENE_ELLIPSE.y);
      gl.uniform2f(uRadii, w * SCENE_ELLIPSE.rx, h * SCENE_ELLIPSE.ry);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      el.closest('.app')?.classList.add('has-scene-backdrop');
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(el);
    const lost = e => {
      e.preventDefault();
      el.closest('.app')?.classList.remove('has-scene-backdrop');
    };
    el.addEventListener('webglcontextlost', lost);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      el.removeEventListener('webglcontextlost', lost);
      el.closest('.app')?.classList.remove('has-scene-backdrop');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);
  return <canvas ref={canvas} className="scene-backdrop" aria-hidden="true" />;
}
