var vertexShaderStr = `
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;
var fragmentShaderStr = `
  varying vec3 vWorldPos;
  uniform vec3 color;
  uniform float scale;
  uniform float lineWidth;
  uniform float angle;

  void main() {
    // Project world XZ onto rotated axis
    float x = vWorldPos.x;
    float z = vWorldPos.z;

    float s = sin(angle);
    float c = cos(angle);

    float u = x * c + z * s;

    float lines = mod(u * scale, 1.0);
    float edge = smoothstep(0.5 - lineWidth, 0.5, lines) * (1.0 - smoothstep(0.5, 0.5 + lineWidth, lines));

    gl_FragColor = vec4(color * edge, edge);
  }
`;

export { vertexShaderStr as hatchVSStr, fragmentShaderStr as hatchFSStr };