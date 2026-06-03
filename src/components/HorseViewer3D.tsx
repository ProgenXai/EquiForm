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
  className?: string;
};

const HORSE_MODEL_PATH = "/models/horse.glb";
const BAY_COAT_COLOR = 0x8b4513;
const LINE_COLOR = 0xdc2828;
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

function createVerticalLine(
  x: number,
  z: number,
  yTop: number,
  yBottom: number,
): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, yTop, z),
    new THREE.Vector3(x, yBottom, z),
  ]);
  const material = new THREE.LineBasicMaterial({
    color: LINE_COLOR,
    transparent: true,
    opacity: 0.92,
  });
  return new THREE.Line(geometry, material);
}

function addConformationLines(
  group: THREE.Group,
  landmarks: HorseViewer3DLandmarks,
  bbox: THREE.Box3,
) {
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const groundY = bbox.min.y + size.y * 0.04;
  const frontZ = bbox.min.z + size.z * 0.9;
  const hindZ = bbox.min.z + size.z * 0.1;
  const centerX = (bbox.min.x + bbox.max.x) / 2;

  const leftPoll = getLandmark(landmarks.left, "poll");
  const leftTail = getLandmark(landmarks.left, "tail");
  if (leftPoll) {
    const spineZ = leftTail
      ? bbox.min.z + leftTail.x * size.z
      : bbox.min.z + leftPoll.x * size.z;
    const topY = bbox.max.y - leftPoll.y * size.y;
    group.add(createVerticalLine(centerX, spineZ, topY, groundY));
  }

  const frontLeftKnee = getLandmark(landmarks.front, "left_knee");
  const frontRightKnee = getLandmark(landmarks.front, "right_knee");
  const frontLeftShoulder = getLandmark(
    landmarks.front,
    "left_point_of_shoulder",
  );
  const frontRightShoulder = getLandmark(
    landmarks.front,
    "right_point_of_shoulder",
  );

  if (frontLeftKnee && frontLeftShoulder) {
    const x = bbox.min.x + frontLeftKnee.x * size.x;
    const topY = bbox.max.y - frontLeftShoulder.y * size.y;
    group.add(createVerticalLine(x, frontZ, topY, groundY));
  }

  if (frontRightKnee && frontRightShoulder) {
    const x = bbox.min.x + frontRightKnee.x * size.x;
    const topY = bbox.max.y - frontRightShoulder.y * size.y;
    group.add(createVerticalLine(x, frontZ, topY, groundY));
  }

  const hindLeftHock = getLandmark(landmarks.hind, "left_hock");
  const hindRightHock = getLandmark(landmarks.hind, "right_hock");
  const hindLeftGaskin = getLandmark(landmarks.hind, "left_gaskin");
  const hindRightGaskin = getLandmark(landmarks.hind, "right_gaskin");

  if (hindLeftHock && hindLeftGaskin) {
    const x = bbox.min.x + hindLeftHock.x * size.x;
    const topY = bbox.max.y - hindLeftGaskin.y * size.y;
    group.add(createVerticalLine(x, hindZ, topY, groundY));
  }

  if (hindRightHock && hindRightGaskin) {
    const x = bbox.min.x + hindRightHock.x * size.x;
    const topY = bbox.max.y - hindRightGaskin.y * size.y;
    group.add(createVerticalLine(x, hindZ, topY, groundY));
  }
}

function applyBayCoat(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const previousMaterial = child.material;
    child.material = new THREE.MeshStandardMaterial({
      color: BAY_COAT_COLOR,
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
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.65;

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
    horseGroup.add(lineGroup);

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
        applyBayCoat(model);
        horseGroup.add(model);

        const bbox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        bbox.getCenter(center);
        bbox.getSize(size);
        model.position.sub(center);

        const scale = 3 / size.y;
        model.scale.setScalar(scale);

        const scaledBox = new THREE.Box3().setFromObject(model);
        model.position.y -= scaledBox.min.y;

        const finalBox = new THREE.Box3().setFromObject(model);
        const finalSize = new THREE.Vector3();
        finalBox.getSize(finalSize);

        addConformationLines(lineGroup, landmarks, finalBox);

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

        camera.position.set(0, 1.5, 4);
        camera.lookAt(0, 1, 0);
        controls.target.set(0, 1, 0);
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
  }, [landmarks]);

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
