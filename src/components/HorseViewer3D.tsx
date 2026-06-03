"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

type LandmarkPoint = { x: number; y: number };

export type HorseViewer3DLandmarks = {
  left?: Record<string, LandmarkPoint>;
  front?: Record<string, LandmarkPoint>;
  hind?: Record<string, LandmarkPoint>;
};

type HorseViewer3DProps = {
  landmarks: HorseViewer3DLandmarks;
  coatColor?: string;
  markings?: string[];
  className?: string;
};

const HORSE_MODEL_PATH =
  "https://uketidictondmetyngxh.supabase.co/storage/v1/object/public/models/horse-compressed.glb";
const COAT_COLOR_MAP: Record<string, number> = {
  black: 0x0a0a0a,
  bay: 0x6b3a2a,
  dark_bay: 0x3d1f15,
  chestnut: 0x8b4513,
  sorrel: 0xc0622a,
  gray: 0xa0a0a0,
  dun: 0xc4a35a,
  buckskin: 0xc8a96e,
  palomino: 0xe8c878,
  roan: 0x8b5a5a,
  cremello: 0xf5e6c8,
  pinto: 0x8b4513,
};
const LINE_COLOR = 0xff3333;
const GROUND_TEAL = 0x00d4b4;

function getLandmark(
  map: Record<string, LandmarkPoint> | undefined,
  key: string,
): LandmarkPoint | null {
  const point = map?.[key];
  if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
    return null;
  }
  return point;
}

function createPlumbLineSegment(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, y1, z1),
    new THREE.Vector3(x2, y2, z2),
  ]);
  const material = new THREE.LineBasicMaterial({
    color: LINE_COLOR,
    linewidth: 2,
  });
  return new THREE.LineSegments(geometry, material);
}

function addConformationLines(
  wrapper: THREE.Object3D,
  lineBbox: THREE.Box3,
  scaledBbox: THREE.Box3,
) {
  const depth = scaledBbox.max.z - scaledBbox.min.z;
  const frontZ = scaledBbox.min.z + depth * 0.2;
  const hindZ = scaledBbox.max.z - depth * 0.2;

  wrapper.add(
    createPlumbLineSegment(
      0,
      lineBbox.max.y,
      0,
      0,
      lineBbox.min.y,
      0,
    ),
  );
  wrapper.add(
    createPlumbLineSegment(
      0,
      scaledBbox.max.y,
      frontZ,
      0,
      0,
      frontZ,
    ),
  );
  wrapper.add(
    createPlumbLineSegment(
      0,
      scaledBbox.max.y,
      hindZ,
      0,
      0,
      hindZ,
    ),
  );
}

function resolveCoatColor(coatColor?: string): number {
  if (!coatColor) return COAT_COLOR_MAP.bay;
  return COAT_COLOR_MAP[coatColor] ?? COAT_COLOR_MAP.bay;
}

function coatColorToCss(hex: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgb(${r}, ${g}, ${b})`;
}

const COAT_TEXTURE_SIZE = 1024;
const MARKING_WHITE = "#ffffff";

const MARKING_ATLAS = {
  head: {
    centerX: 820,
    width: 150,
    pollY: 95,
    muzzleY: 385,
    foreheadY: 175,
  },
  frontLegs: {
    leftX: 245,
    rightX: 325,
    width: 55,
    hoofY: 910,
    kneeY: 560,
  },
} as const;

function paintMarking(
  ctx: CanvasRenderingContext2D,
  marking: string,
): void {
  const { head, frontLegs } = MARKING_ATLAS;
  ctx.fillStyle = MARKING_WHITE;

  switch (marking) {
    case "blaze": {
      const blazeWidth = head.width * 0.3;
      ctx.fillRect(
        head.centerX - blazeWidth / 2,
        head.pollY,
        blazeWidth,
        head.muzzleY - head.pollY,
      );
      break;
    }
    case "stripe": {
      const stripeWidth = head.width * 0.15;
      ctx.fillRect(
        head.centerX - stripeWidth / 2,
        head.pollY,
        stripeWidth,
        head.muzzleY - head.pollY,
      );
      break;
    }
    case "star": {
      ctx.beginPath();
      ctx.ellipse(
        head.centerX,
        head.foreheadY,
        head.width * 0.12,
        head.width * 0.08,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      break;
    }
    case "snip": {
      ctx.beginPath();
      ctx.ellipse(
        head.centerX + head.width * 0.28,
        head.muzzleY - 25,
        head.width * 0.1,
        head.width * 0.07,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      break;
    }
    case "left_sock": {
      const lowerLeg = frontLegs.hoofY - frontLegs.kneeY;
      const sockTop = frontLegs.kneeY + lowerLeg * 0.25;
      ctx.fillRect(
        frontLegs.leftX - frontLegs.width / 2,
        sockTop,
        frontLegs.width,
        frontLegs.hoofY - sockTop,
      );
      break;
    }
    case "right_sock": {
      const lowerLeg = frontLegs.hoofY - frontLegs.kneeY;
      const sockTop = frontLegs.kneeY + lowerLeg * 0.25;
      ctx.fillRect(
        frontLegs.rightX - frontLegs.width / 2,
        sockTop,
        frontLegs.width,
        frontLegs.hoofY - sockTop,
      );
      break;
    }
    case "left_stocking": {
      ctx.fillRect(
        frontLegs.leftX - frontLegs.width / 2,
        frontLegs.kneeY,
        frontLegs.width,
        frontLegs.hoofY - frontLegs.kneeY,
      );
      break;
    }
    case "right_stocking": {
      ctx.fillRect(
        frontLegs.rightX - frontLegs.width / 2,
        frontLegs.kneeY,
        frontLegs.width,
        frontLegs.hoofY - frontLegs.kneeY,
      );
      break;
    }
    default:
      break;
  }
}

function createCoatTexture(
  coatColor?: string,
  markings?: string[],
): THREE.CanvasTexture | null {
  const activeMarkings =
    markings?.filter((marking) => marking !== "none" && marking.trim() !== "") ??
    [];

  if (activeMarkings.length === 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = COAT_TEXTURE_SIZE;
  canvas.height = COAT_TEXTURE_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.fillStyle = coatColorToCss(resolveCoatColor(coatColor));
  ctx.fillRect(0, 0, COAT_TEXTURE_SIZE, COAT_TEXTURE_SIZE);

  for (const marking of activeMarkings) {
    paintMarking(ctx, marking);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function applyCoatColor(
  root: THREE.Object3D,
  coatColor?: string,
  markings?: string[],
): THREE.CanvasTexture | null {
  const coatTexture = createCoatTexture(coatColor, markings);
  const color = coatTexture ? 0xffffff : resolveCoatColor(coatColor);

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const previousMaterial = child.material;
    child.material = new THREE.MeshStandardMaterial({
      color,
      map: coatTexture ?? undefined,
      metalness: 0.28,
      roughness: 0.48,
    });

    if (Array.isArray(previousMaterial)) {
      previousMaterial.forEach((material) => material.dispose());
    } else {
      previousMaterial.dispose();
    }
  });

  return coatTexture;
}

export default function HorseViewer3D({
  landmarks,
  coatColor,
  markings,
  className = "",
}: HorseViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hintVisible, setHintVisible] = useState(true);
  const [hintOpacity, setHintOpacity] = useState(1);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setHintOpacity(0), 2500);
    const hideTimer = window.setTimeout(() => setHintVisible(false), 3200);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrameId = 0;
    let disposed = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.2;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.minPolarAngle = Math.PI * 0.22;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.35;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff2e6, 2.0);
    keyLight.position.set(2.5, 5, 4);
    scene.add(keyLight);

    const rightLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rightLight.position.set(4, 2, 0);
    scene.add(rightLight);

    const fillLight = new THREE.DirectionalLight(0xcfe8ff, 0.35);
    fillLight.position.set(-3, 2.5, -2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.25);
    rimLight.position.set(0, 3, -4);
    scene.add(rimLight);

    const belowFrontLight = new THREE.DirectionalLight(0xffffff, 0.8);
    belowFrontLight.position.set(0, -1, 2);
    scene.add(belowFrontLight);

    const blueRimLight = new THREE.DirectionalLight(0x6699ff, 0.6);
    blueRimLight.position.set(0, 2, -3);
    scene.add(blueRimLight);

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let coatTexture: THREE.CanvasTexture | null = null;

    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
    );
    loader.setDRACOLoader(dracoLoader);

    void (async () => {
      try {
        const gltf = await loader.loadAsync(HORSE_MODEL_PATH);
        if (disposed) return;

        const model = gltf.scene;
        scene.add(model);

        const bbox = new THREE.Box3().setFromObject(model);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());

        model.position.x = -center.x;
        model.position.y = -center.y;
        model.position.z = -center.z;

        const s = 2.4 / size.y;
        model.scale.setScalar(s);

        const scaledBbox = new THREE.Box3().setFromObject(model);
        model.position.y -= scaledBbox.min.y;

        model.rotation.y = Math.PI / 2;

        coatTexture = applyCoatColor(model, coatColor, markings);

        const finalBbox = new THREE.Box3().setFromObject(model);
        console.log("finalBbox Z:", finalBbox.min.z, "to", finalBbox.max.z);
        console.log("landmarks.left:", JSON.stringify(landmarks.left));
        const bboxCenter = finalBbox.getCenter(new THREE.Vector3());
        const width = finalBbox.max.x - finalBbox.min.x;
        const depth = finalBbox.max.z - finalBbox.min.z;
        const mapLandmarkZ = (normX: number) => {
          const clamped = Math.max(0, Math.min(1, normX));
          return finalBbox.min.z + clamped * (finalBbox.max.z - finalBbox.min.z);
        };

        function makeVerticalLine(
          x: number,
          yTop: number,
          yBottom: number,
          z: number,
          color: number,
        ) {
          const points = [
            new THREE.Vector3(x, yTop, z),
            new THREE.Vector3(x, yBottom, z),
          ];
          const geo = new THREE.BufferGeometry().setFromPoints(points);
          const mat = new THREE.LineBasicMaterial({
            color,
            linewidth: 2,
          });
          return new THREE.Line(geo, mat);
        }

        scene.add(
          makeVerticalLine(
            bboxCenter.x,
            finalBbox.max.y,
            0,
            mapLandmarkZ(landmarks.left?.shoulder?.x ?? 0.20),
            0xff3333,
          ),
        );
        scene.add(
          makeVerticalLine(
            bboxCenter.x,
            finalBbox.max.y,
            0,
            mapLandmarkZ(landmarks.left?.girth?.x ?? 0.40),
            0xff3333,
          ),
        );
        scene.add(
          makeVerticalLine(
            bboxCenter.x,
            finalBbox.max.y,
            0,
            mapLandmarkZ(landmarks.left?.point_of_hip?.x ?? 0.65),
            0xff3333,
          ),
        );
        scene.add(
          makeVerticalLine(
            bboxCenter.x,
            finalBbox.max.y,
            0,
            mapLandmarkZ(landmarks.left?.buttock?.x ?? 0.85),
            0xff3333,
          ),
        );
        scene.add(
          makeVerticalLine(
            bboxCenter.x,
            finalBbox.max.y * 0.55,
            0,
            finalBbox.min.z + depth * 0.12,
            0xffffff,
          ),
        );
        scene.add(
          makeVerticalLine(
            bboxCenter.x,
            finalBbox.max.y * 0.55,
            0,
            finalBbox.max.z - depth * 0.12,
            0xffffff,
          ),
        );

        const discGeo = new THREE.CircleGeometry(0.9, 64);
        discGeo.rotateX(-Math.PI / 2);
        const discMat = new THREE.MeshStandardMaterial({
          color: 0x00d4b4,
          opacity: 0.22,
          transparent: true,
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.position.set(bboxCenter.x, 0.01, bboxCenter.z);
        scene.add(disc);

        camera.position.set(
          bboxCenter.x + 6.0,
          bboxCenter.y,
          bboxCenter.z,
        );
        camera.lookAt(bboxCenter.x, bboxCenter.y, bboxCenter.z);
        controls.target.set(bboxCenter.x, bboxCenter.y, bboxCenter.z);
        controls.update();

        resize();
        setLoading(false);
      } catch {
        if (disposed) return;
        setLoadError("Unable to load 3D horse model.");
        setLoading(false);
      }
    })();

    const animate = () => {
      animationFrameId = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();

      scene.traverse((object) => {
        if (object instanceof THREE.Line) {
          object.geometry.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          }
          return;
        }

        if (!(object instanceof THREE.Mesh)) return;

        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose());
        } else {
          material.dispose();
        }
      });

      coatTexture?.dispose();
      dracoLoader.dispose();

      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 bg-[radial-gradient(ellipse_at_center,_#1a1a1f_0%,_#09090b_55%,_#030303_100%)] h-[400px] md:h-[500px] ${className}`}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-[#00D4B4]" />
        </div>
      ) : null}

      {loadError ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="text-sm text-zinc-500">{loadError}</p>
        </div>
      ) : null}

      {hintVisible && !loading && !loadError ? (
        <p
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-zinc-500 transition-opacity duration-700"
          style={{ opacity: hintOpacity }}
        >
          Drag to rotate
        </p>
      ) : null}
    </div>
  );
}
