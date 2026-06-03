"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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

const HORSE_MODEL_PATH = "/models/horse.glb";
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

function addConformationLines(group: THREE.Group, finalBox: THREE.Box3) {
  const width = finalBox.max.x - finalBox.min.x;
  const depth = finalBox.max.z - finalBox.min.z;
  const centerX = (finalBox.max.x + finalBox.min.x) / 2;
  const centerZ = (finalBox.max.z + finalBox.min.z) / 2;
  const frontZ = finalBox.min.z + depth * 0.25;
  const hindZ = finalBox.max.z - depth * 0.25;
  const leftX = centerX - width * 0.2;
  const rightX = centerX + width * 0.2;

  group.add(
    createPlumbLineSegment(
      centerX,
      finalBox.max.y,
      centerZ,
      centerX,
      0,
      centerZ,
    ),
  );

  group.add(
    createPlumbLineSegment(leftX, finalBox.max.y, frontZ, leftX, 0, frontZ),
  );
  group.add(
    createPlumbLineSegment(rightX, finalBox.max.y, frontZ, rightX, 0, frontZ),
  );
  group.add(
    createPlumbLineSegment(leftX, finalBox.max.y, hindZ, leftX, 0, hindZ),
  );
  group.add(
    createPlumbLineSegment(rightX, finalBox.max.y, hindZ, rightX, 0, hindZ),
  );
}

function resolveCoatColor(coatColor?: string): number {
  if (!coatColor) return COAT_COLOR_MAP.bay;
  return COAT_COLOR_MAP[coatColor] ?? COAT_COLOR_MAP.bay;
}

function applyCoatColor(root: THREE.Object3D, coatColor?: string) {
  const color = resolveCoatColor(coatColor);

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const previousMaterial = child.material;
    child.material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.28,
      roughness: 0.48,
    });

    if (Array.isArray(previousMaterial)) {
      previousMaterial.forEach((material) => material.dispose());
    } else {
      previousMaterial.dispose();
    }
  });
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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.42);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff2e6, 1.15);
    keyLight.position.set(2.5, 5, 4);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xcfe8ff, 0.35);
    fillLight.position.set(-3, 2.5, -2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.25);
    rimLight.position.set(0, 3, -4);
    scene.add(rimLight);

    const horseGroup = new THREE.Group();
    scene.add(horseGroup);

    const lineGroup = new THREE.Group();
    scene.add(lineGroup);

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const loader = new GLTFLoader();
    loader.load(
      HORSE_MODEL_PATH,
      (gltf) => {
        if (disposed) return;

        const model = gltf.scene;
        applyCoatColor(model, coatColor);
        horseGroup.add(model);

        const bbox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        bbox.getCenter(center);
        bbox.getSize(size);
        model.position.sub(center);

        const scale = 1.8 / size.y;
        model.scale.setScalar(scale);

        const scaledBox = new THREE.Box3().setFromObject(model);
        model.position.y -= scaledBox.min.y;

        model.rotation.y = Math.PI / 2;

        const rotatedBox = new THREE.Box3().setFromObject(model);
        model.position.y -= rotatedBox.min.y;

        const finalBox = new THREE.Box3().setFromObject(model);
        const finalSize = new THREE.Vector3();
        finalBox.getSize(finalSize);

        addConformationLines(lineGroup, finalBox);

        const groundRadius = Math.max(finalSize.x, finalSize.z) * 0.42;
        const groundGeometry = new THREE.CircleGeometry(groundRadius, 64);
        const groundMaterial = new THREE.MeshBasicMaterial({
          color: GROUND_TEAL,
          transparent: true,
          opacity: 0.22,
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = finalBox.min.y + 0.01;
        horseGroup.add(ground);

        camera.position.set(0, 0.9, 3.5);
        camera.lookAt(0, 0.6, 0);
        controls.target.set(0, 0.6, 0);
        controls.update();

        setLoading(false);
      },
      undefined,
      () => {
        if (disposed) return;
        setLoadError("Unable to load 3D horse model.");
        setLoading(false);
      },
    );

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
