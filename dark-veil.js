import { Renderer, Program, Mesh, Triangle, Vec2 } from 'https://esm.sh/ogl';

const vertex = `
attribute vec2 position;
void main(){gl_Position=vec4(position,0.0,1.0);}
`;

const fragment = `
#ifdef GL_ES
precision lowp float;
#endif
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor; /* Changed from uHueShift to explicit Color */
uniform float uNoise;
uniform float uScan;
uniform float uScanFreq;
uniform float uWarp;
#define iTime uTime
#define iResolution uResolution

vec4 buf[8];
float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}

vec4 sigmoid(vec4 x){return 1./(1.+exp(-x));}

vec4 cppn_fn(vec2 coordinate,float in0,float in1,float in2){
    /* Simplified CPPN for stability */
    buf[6]=vec4(coordinate.x,coordinate.y,0.394+in0,0.36+in1);
    buf[7]=vec4(0.14+in2,sqrt(coordinate.x*coordinate.x+coordinate.y*coordinate.y),0.,0.);
    buf[0]=mat4(vec4(6.5,-3.6,0.7,-1.1),vec4(2.4,3.1,1.2,0.06),vec4(-5.4,-6.1,1.8,-4.7),vec4(6.0,-5.5,-0.9,3.2))*buf[6]+vec4(0.2,1.1,-1.8,5.0);
    buf[1]=mat4(vec4(-3.3,-6.0,0.5,-4.4),vec4(0.8,1.7,5.6,1.6),vec4(2.5,-3.5,1.7,6.3),vec4(3.3,8.2,1.1,-1.1))*buf[6]+vec4(-5.9,-6.5,-0.8,1.5);
    buf[0]=sigmoid(buf[0]);buf[1]=sigmoid(buf[1]);
    buf[2]=mat4(vec4(-15.2,8.0,-2.4,-1.9),vec4(-5.9,4.3,2.6,1.2),vec4(-7.3,6.7,5.2,5.9),vec4(5.0,8.9,-1.7,-1.1))*buf[6]+vec4(-4.1,-3.2,-4.5,-3.6);
    buf[2]=sigmoid(buf[2]);
    /* Reduced depth for performance and smoother gradients */
    return vec4(buf[0].x, buf[1].y, buf[2].z, 1.0);
}

void mainImage(out vec4 fragColor,in vec2 fragCoord){
    vec2 uv=fragCoord/uResolution.xy*2.-1.;
    uv.y*=-1.;
    uv+=uWarp*vec2(sin(uv.y*6.28+uTime*0.5),cos(uv.x*6.28+uTime*0.5))*0.05;
    fragColor=cppn_fn(uv,0.1*sin(0.3*uTime),0.1*sin(0.69*uTime),0.1*sin(0.44*uTime));
}

void main(){
    vec4 col;mainImage(col,gl_FragCoord.xy);
    
    /* Convert organic pattern to grayscale intensity */
    float intensity = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    
    /* Apply Scanlines */
    float scanline_val=sin(gl_FragCoord.y*uScanFreq)*0.5+0.5;
    intensity *= 1.-(scanline_val*scanline_val)*uScan;
    
    /* Add Noise */
    intensity += (rand(gl_FragCoord.xy+uTime)-0.5)*uNoise;
    
    /* Tint with the explicit uColor */
    /* Multiplying intensity by color gives a colored version of the pattern */
    vec3 finalColor = vec3(intensity) * uColor * 1.8; /* 1.8 boost for brightness */
    
    gl_FragColor=vec4(clamp(finalColor,0.0,1.0),1.0);
}
`;

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255
    ] : [0, 0, 0];
}

export function initDarkVeil(containerId, {
    baseColor = '#191970', // Default requested Blue
    noiseIntensity = 0.05,
    scanlineIntensity = 0,
    speed = 0.5,
    scanlineFrequency = 0,
    warpAmount = 0,
    resolutionScale = 1
} = {}) {
    const parent = document.getElementById(containerId);
    if (!parent) return;

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'darkveil-canvas';
    Object.assign(canvas.style, {
        width: '100%',
        height: '100%',
        display: 'block'
    });
    // Clear parent and append canvas
    parent.innerHTML = '';
    parent.appendChild(canvas);

    const renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio, 2),
        canvas,
        alpha: true // Allow transparency
    });

    const gl = renderer.gl;
    const geometry = new Triangle(gl);

    const rgbColor = hexToRgb(baseColor);

    const program = new Program(gl, {
        vertex,
        fragment,
        uniforms: {
            uTime: { value: 0 },
            uResolution: { value: new Vec2() },
            uColor: { value: new Float32Array(rgbColor) }, // Pass RGB vector
            uNoise: { value: noiseIntensity },
            uScan: { value: scanlineIntensity },
            uScanFreq: { value: scanlineFrequency },
            uWarp: { value: warpAmount }
        }
    });

    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        renderer.setSize(w * resolutionScale, h * resolutionScale);
        program.uniforms.uResolution.value.set(w, h);
    };

    window.addEventListener('resize', resize);
    resize();

    const start = performance.now();
    let frame;

    const loop = () => {
        program.uniforms.uTime.value = ((performance.now() - start) / 1000) * speed;
        renderer.render({ scene: mesh });
        frame = requestAnimationFrame(loop);
    };

    loop();

    return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', resize);
    };
}
