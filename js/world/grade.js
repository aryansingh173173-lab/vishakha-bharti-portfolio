// The final colour grade, and its exact inverse. The grade runs over the whole frame after tone
// mapping; her images are pre-corrected with the inverse (and inverse tone mapping) so they reach
// the screen in their true colours instead of picking up the sunset tint.
const v3 = (a) => `vec3(${a.map((n) => n.toFixed(4)).join(', ')})`;

export const GRADE_PARAMS = {
  sat: 1.08,
  shadow: [0.97, 0.96, 1.02],
  high: [1.03, 1.0, 0.97],
  top: [0.9, 0.88, 0.98],
  topAmount: 0.35,
  vignette: 0.45,
};
const P = GRADE_PARAMS;

const CONSTANTS = /* glsl */`
  const vec3 G_LUMA = vec3(0.299, 0.587, 0.114);
  const float G_SAT = ${P.sat.toFixed(4)};
  const vec3 G_SHADOW = ${v3(P.shadow)};
  const vec3 G_HIGH = ${v3(P.high)};
  const vec3 G_TOP = ${v3(P.top)};
  const float G_TOP_AMT = ${P.topAmount.toFixed(4)};
  const float G_VIG = ${P.vignette.toFixed(4)};
`;

export const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    ${CONSTANTS}
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, G_LUMA);
      col = mix(vec3(l), col, G_SAT);
      col *= mix(G_SHADOW, G_HIGH, smoothstep(0.1, 0.9, l));
      col = mix(col, col * G_TOP, smoothstep(0.55, 1.0, vUv.y) * G_TOP_AMT);
      vec2 d = vUv - 0.5;
      col *= 1.0 - dot(d, d) * G_VIG;
      gl_FragColor = vec4(col, c.a);
    }`,
};

// GLSL: given the colour we want on screen (sRGB) at a screen position, return the linear HDR value
// to output so that tone mapping (ACES filmic, three's fit) + sRGB encoding + the grade reproduce it.
export const TRUE_COLOR_GLSL = /* glsl */`
  ${CONSTANTS}
  uniform float uExposure;
  uniform vec2 uResolution;
  vec3 gInvGrade(vec3 T, vec2 uv) {
    vec2 d = uv - 0.5;
    float vig = 1.0 - dot(d, d) * G_VIG;
    vec3 top = mix(vec3(1.0), G_TOP, smoothstep(0.55, 1.0, uv.y) * G_TOP_AMT);
    vec3 u = T / (vig * top);
    float l = dot(u, G_LUMA);
    for (int i = 0; i < 3; i++) l = dot(u / mix(G_SHADOW, G_HIGH, smoothstep(0.1, 0.9, l)), G_LUMA);
    vec3 s = u / mix(G_SHADOW, G_HIGH, smoothstep(0.1, 0.9, l));
    return l + (s - l) / G_SAT;
  }
  vec3 gSrgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  }
  vec3 gLinearToSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }
  vec3 gInvAces(vec3 y) {
    const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    vec3 v = clamp(inverse(OUT) * y, 0.0, 0.985);
    vec3 A = 1.0 - 0.983729 * v;
    vec3 B = 0.0245786 - 0.4329510 * v;
    vec3 C = -(0.000090537 + 0.238081 * v);
    vec3 x = (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
    return max(inverse(IN) * x, 0.0) * 0.6 / uExposure;
  }
  // linear colour from the texture -> what to output so the screen shows exactly that colour
  vec3 gTrueColor(vec3 linearColor, vec3 addSrgb) {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 T = clamp(gLinearToSrgb(max(linearColor, 0.0)) + addSrgb, 0.0, 0.93);
    vec3 g = clamp(gInvGrade(T, uv), 0.0, 1.0);
    return gInvAces(gSrgbToLinear(g));
  }
`;
