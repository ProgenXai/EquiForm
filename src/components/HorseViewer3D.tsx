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
  leftPhotoUrl?: string;
  rightPhotoUrl?: string;
  frontPhotoUrl?: string;
  hindPhotoUrl?: string;
};

const HORSE_MODEL_PATH =
  "https://uketidictondmetyngxh.supabase.co/storage/v1/object/public/models/horse-rigged.glb";
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

function imageXToWorldX(
  normX: number,
  landmarkXMin: number,
  landmarkXMax: number,
  bboxXMin: number,
  bboxXMax: number,
  facingRight: boolean,
): number {
  const t = (normX - landmarkXMin) / (landmarkXMax - landmarkXMin);
  return facingRight
    ? bboxXMax - t * (bboxXMax - bboxXMin)
    : bboxXMin + t * (bboxXMax - bboxXMin);
}

function imageYToWorldY(
  normY: number,
  landmarkYMin: number,
  landmarkYMax: number,
  bboxYMin: number,
  bboxYMax: number,
): number {
  // image Y increases downward, world Y increases upward — invert
  const t = (normY - landmarkYMin) / (landmarkYMax - landmarkYMin);
  return bboxYMax - t * (bboxYMax - bboxYMin);
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

function formatDebugNumber(
  value: number | boolean | undefined,
  digits: number,
): string {
  return typeof value === "number" ? value.toFixed(digits) : "—";
}

function applyMorphWeights(
  root: THREE.Object3D,
  weights: Record<string, number>,
): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.morphTargetDictionary) return;

    const influences = child.morphTargetInfluences;
    if (!influences) return;

    for (const [name, weight] of Object.entries(weights)) {
      const index = child.morphTargetDictionary[name];
      if (index === undefined) continue;
      influences[index] = Math.max(0, Math.min(1, weight));
    }
  });
}

function setBoneWorldPosition(bone: THREE.Bone, worldPos: THREE.Vector3): void {
  const local = worldPos.clone();
  if (bone.parent) {
    bone.parent.updateMatrixWorld(true);
    bone.parent.worldToLocal(local);
  }
  bone.position.copy(local);
}

async function loadPhotoTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
}

export default function HorseViewer3D({
  landmarks,
  coatColor,
  markings,
  className = "",
  leftPhotoUrl,
  rightPhotoUrl,
  frontPhotoUrl,
  hindPhotoUrl,
}: HorseViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frontPlumbLineRef = useRef<THREE.Line | null>(null);
  const hindPlumbLineRef = useRef<THREE.Line | null>(null);
  const frontSphereRef = useRef<THREE.Mesh | null>(null);
  const hindSphereRef = useRef<THREE.Mesh | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hintVisible, setHintVisible] = useState(true);
  const [hintOpacity, setHintOpacity] = useState(1);
  const [debugInfo, setDebugInfo] = useState<Record<
    string,
    number | boolean
  > | null>(null);

  function computeMorphWeights(
    sideLandmarks: Record<string, { x: number; y: number }>,
    imageWidth: number,
    imageHeight: number,
  ): Record<string, number> {
    const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
    const mapRange = (value: number, min: number, max: number) =>
      clamp01((value - min) / (max - min));
    const aspect = imageWidth / imageHeight;

    const get = (key: string) => sideLandmarks[key];

    // BACK LENGTH: distance shoulder.x to buttock.x (typical range 0.35–0.65; center 0.50)
    const backRatio = Math.abs(
      (get("buttock")?.x ?? 0.85) - (get("shoulder")?.x ?? 0.36),
    );
    const backLong = mapRange(backRatio, 0.35, 0.65);

    // CROUP: height of croup relative to withers/buttock topline
    const croupY = get("croup")?.y ?? get("loin")?.y ?? 0.35;
    const withersY = get("withers")?.y ?? 0.18;
    const buttockY = get("buttock")?.y ?? 0.42;
    const croupDrop = (buttockY - croupY) * aspect;
    const croupHigh = mapRange(croupDrop, 0.04, 0.22);

    // SHOULDER: layback from withers to shoulder (more horizontal = laid back)
    const shoulderX = get("shoulder")?.x ?? 0.36;
    const shoulderY = get("shoulder")?.y ?? 0.45;
    const withersX = get("withers")?.x ?? 0.32;
    const shoulderReach =
      Math.abs(shoulderX - withersX) * aspect;
    const shoulderDrop = Math.max(shoulderY - withersY, 0.001);
    const shoulderLayback = shoulderReach / shoulderDrop;
    const shoulderLaidBack = mapRange(shoulderLayback, 0.6, 2.4);

    // NECK: poll to withers length
    const pollX = get("poll")?.x ?? 0.15;
    const pollY = get("poll")?.y ?? 0.08;
    const neckDx = (withersX - pollX) * aspect;
    const neckDy = withersY - pollY;
    const neckLength = Math.hypot(neckDx, neckDy);
    const neckLong = mapRange(neckLength, 0.1, 0.32);

    // LEGS: knee/hock extension below shoulder and loin
    const frontKnee = get("front_knee") ?? get("knee");
    const hindHock = get("hind_hock") ?? get("hock");
    const loinY = get("loin")?.y ?? 0.5;
    const frontLegSpan = ((frontKnee?.y ?? 0.68) - shoulderY) * aspect;
    const hindLegSpan = ((hindHock?.y ?? 0.65) - loinY) * aspect;
    const legsLong = mapRange((frontLegSpan + hindLegSpan) / 2, 0.12, 0.38);

    return {
      back_long: backLong,
      back_short: 1 - backLong,
      croup_high: croupHigh,
      croup_low: 1 - croupHigh,
      shoulder_upright: 1 - shoulderLaidBack,
      shoulder_laid_back: shoulderLaidBack,
      neck_long: neckLong,
      neck_short: 1 - neckLong,
      legs_long: legsLong,
      legs_short: 1 - legsLong,
    };
  }

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

    const updatePlumbVisibility = () => {
      const azimuth = controls.getAzimuthalAngle();
      const isFrontOrHind = Math.abs(Math.cos(azimuth)) > 0.5;

      if (frontPlumbLineRef.current) {
        frontPlumbLineRef.current.visible = isFrontOrHind;
      }
      if (hindPlumbLineRef.current) {
        hindPlumbLineRef.current.visible = isFrontOrHind;
      }
      if (frontSphereRef.current) {
        frontSphereRef.current.visible = isFrontOrHind;
      }
      if (hindSphereRef.current) {
        hindSphereRef.current.visible = isFrontOrHind;
      }
    };

    controls.addEventListener("change", updatePlumbVisibility);

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

        scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            if (mesh.morphTargetDictionary) {
              console.log(
                "MORPH MESH:",
                mesh.name,
                Object.keys(mesh.morphTargetDictionary),
              );
            } else {
              console.log("NO MORPHS:", mesh.name);
            }
          }
        });

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

        const facingRight = (landmarks.left?.poll?.x ?? 0.21) < 0.5;
        model.rotation.y = facingRight ? Math.PI / 2 : -Math.PI / 2;

        const morphWeights = computeMorphWeights(
          landmarks.left ?? {},
          4,
          3,
        );
        applyMorphWeights(model, morphWeights);
        console.log("Morph weights:", morphWeights);

        coatTexture = applyCoatColor(model, coatColor, markings);

        const finalBbox = new THREE.Box3().setFromObject(model);

        if (leftPhotoUrl || rightPhotoUrl || frontPhotoUrl || hindPhotoUrl) {
          try {
            const textureMap: Partial<Record<string, THREE.Texture>> = {};

            if (leftPhotoUrl) {
              textureMap.left = await loadPhotoTexture(leftPhotoUrl);
            }
            if (rightPhotoUrl) {
              textureMap.right = await loadPhotoTexture(rightPhotoUrl);
            }
            if (frontPhotoUrl) {
              textureMap.front = await loadPhotoTexture(frontPhotoUrl);
            }
            if (hindPhotoUrl) {
              textureMap.hind = await loadPhotoTexture(hindPhotoUrl);
            }

            const primaryTexture = textureMap.left ?? textureMap.right;
            if (primaryTexture) {
              primaryTexture.colorSpace = THREE.SRGBColorSpace;

              model.traverse((child) => {
                if (!(child instanceof THREE.Mesh)) return;

                const geometry = child.geometry.clone();
                const positions = geometry.attributes.position;
                const uvs = new Float32Array(positions.count * 2);

                child.updateMatrixWorld(true);

                for (let i = 0; i < positions.count; i++) {
                  const vertex = new THREE.Vector3(
                    positions.getX(i),
                    positions.getY(i),
                    positions.getZ(i),
                  );
                  vertex.applyMatrix4(child.matrixWorld);

                  const u =
                    (vertex.x - finalBbox.min.x) /
                    (finalBbox.max.x - finalBbox.min.x);
                  const v =
                    (vertex.y - finalBbox.min.y) /
                    (finalBbox.max.y - finalBbox.min.y);

                  uvs[i * 2] = u;
                  uvs[i * 2 + 1] = v;
                }

                geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
                child.geometry = geometry;

                child.material = new THREE.MeshStandardMaterial({
                  map: primaryTexture,
                  metalness: 0.1,
                  roughness: 0.7,
                });
              });
            }
          } catch (err) {
            console.warn("Photo texture load failed, using coat color:", err);
          }
        }

        console.log("finalBbox Z:", finalBbox.min.z, "to", finalBbox.max.z);
        console.log("finalBbox X range:", finalBbox.min.x, "to", finalBbox.max.x);
        console.log("finalBbox Y:", finalBbox.min.y, "to", finalBbox.max.y);
        const bboxCenter = finalBbox.getCenter(new THREE.Vector3());
        console.log("finalBbox center:", bboxCenter.x, bboxCenter.y, bboxCenter.z);
        console.log("model rotation Y:", model.rotation.y);
        console.log("landmarks.left:", JSON.stringify(landmarks.left));
        console.log("=== MODEL BONES AND MESHES ===");
        model.traverse((child) => {
          if (child instanceof THREE.Bone) {
            console.log("BONE:", child.name, "worldPos:", child.getWorldPosition(new THREE.Vector3()));
          }
          if (child instanceof THREE.Mesh) {
            console.log("MESH:", child.name);
          }
        });

        const bonePositions: Record<string, THREE.Vector3> = {};
        scene.traverse((obj) => {
          if (obj.type === "Bone") {
            const worldPos = new THREE.Vector3();
            obj.getWorldPosition(worldPos);
            bonePositions[obj.name] = worldPos;
          }
        });

        const lm = landmarks?.left ?? {};

        const ikAllLmY = [
          lm.withers?.y,
          lm.shoulder?.y,
          lm.front_knee?.y,
          lm.hind_hock?.y,
          lm.buttock?.y,
        ].filter((v): v is number => v != null);
        const ikLandmarkYMin =
          ikAllLmY.length > 0 ? Math.min(...ikAllLmY) : finalBbox.min.y;
        const ikLandmarkYMax =
          ikAllLmY.length > 0 ? Math.max(...ikAllLmY) : finalBbox.max.y;

        const mapY = (normY: number) => {
          const span = ikLandmarkYMax - ikLandmarkYMin;
          if (span <= 0) return finalBbox.min.y;
          return (
            finalBbox.max.y -
            ((normY - ikLandmarkYMin) / span) *
              (finalBbox.max.y - finalBbox.min.y)
          );
        };

        const ikAllLmX = [
          lm.shoulder?.x,
          lm.girth?.x,
          lm.point_of_hip?.x ?? lm.loin?.x,
          lm.buttock?.x,
          lm.front_knee?.x ?? lm.knee?.x,
          lm.hind_hock?.x ?? lm.hock?.x,
        ].filter((v): v is number => v != null);
        const ikLandmarkXMin =
          ikAllLmX.length > 0 ? Math.min(...ikAllLmX) : 0;
        const ikLandmarkXMax =
          ikAllLmX.length > 0 ? Math.max(...ikAllLmX) : 1;

        const mapX = (normX: number) =>
          imageXToWorldX(
            normX,
            ikLandmarkXMin,
            ikLandmarkXMax,
            finalBbox.min.x,
            finalBbox.max.x,
            facingRight,
          );

        const frontKneeNormX = lm.front_knee?.x ?? lm.knee?.x ?? lm.shoulder?.x ?? 0.36;
        const frontKneeNormY = lm.front_knee?.y ?? lm.knee?.y ?? 0.68;
        const hindHockNormX =
          lm.hind_hock?.x ?? lm.hock?.x ?? lm.point_of_hip?.x ?? 0.75;
        const hindHockNormY = lm.hind_hock?.y ?? lm.hock?.y ?? 0.65;
        const hipNormX = lm.point_of_hip?.x ?? lm.loin?.x ?? 0.72;
        const hipNormY = lm.point_of_hip?.y ?? 0.38;

        const ikTargets: Record<string, THREE.Vector3> = {
          "forefoot_ik.L": new THREE.Vector3(
            mapX(frontKneeNormX),
            mapY(frontKneeNormY),
            bboxCenter.z,
          ),
          "hind_foot_ik.L": new THREE.Vector3(
            mapX(hindHockNormX),
            mapY(hindHockNormY),
            bboxCenter.z,
          ),
          "upper_arm_ik_target.L": new THREE.Vector3(
            mapX(frontKneeNormX),
            mapY(frontKneeNormY),
            bboxCenter.z,
          ),
          "thigh_ik_target.L": new THREE.Vector3(
            mapX(hipNormX),
            mapY(hipNormY),
            bboxCenter.z,
          ),
        };

        model.traverse((obj) => {
          if (!(obj instanceof THREE.Bone)) return;
          const target = ikTargets[obj.name];
          if (!target) return;
          setBoneWorldPosition(obj, target);
        });

        model.updateMatrixWorld(true);
        console.log("IK targets:", ikTargets);

        scene.traverse((obj) => {
          if (obj.type === "Bone") {
            const worldPos = new THREE.Vector3();
            obj.getWorldPosition(worldPos);
            bonePositions[obj.name] = worldPos;
          }
        });

        const width = finalBbox.max.x - finalBbox.min.x;
        const depth = finalBbox.max.z - finalBbox.min.z;

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

        const allLmX = [
          lm.shoulder?.x,
          lm.girth?.x,
          lm.point_of_hip?.x ?? lm.loin?.x,
          lm.buttock?.x,
        ].filter((v): v is number => v != null);
        const landmarkXMin = Math.min(...allLmX);
        const landmarkXMax = Math.max(...allLmX);
        const bboxXMin = finalBbox.min.x;
        const bboxXMax = finalBbox.max.x;

        console.log("facingRight:", facingRight, "poll.x:", lm.poll?.x);
        console.log(
          "shoulder.x:",
          lm.shoulder?.x,
          "buttock.x:",
          lm.buttock?.x,
        );
        console.log("finalBbox X:", bboxXMin, "to", bboxXMax);

        let line1X = imageXToWorldX(
          lm.shoulder?.x ?? 0.36,
          landmarkXMin,
          landmarkXMax,
          bboxXMin,
          bboxXMax,
          facingRight,
        );
        let line2X = imageXToWorldX(
          lm.girth?.x ?? 0.42,
          landmarkXMin,
          landmarkXMax,
          bboxXMin,
          bboxXMax,
          facingRight,
        );
        let line3X = imageXToWorldX(
          lm.point_of_hip?.x ?? lm.loin?.x ?? 0.65,
          landmarkXMin,
          landmarkXMax,
          bboxXMin,
          bboxXMax,
          facingRight,
        );
        let line4X = imageXToWorldX(
          lm.buttock?.x ?? 0.85,
          landmarkXMin,
          landmarkXMax,
          bboxXMin,
          bboxXMax,
          facingRight,
        );

        console.log("Red line norm X:", {
          shoulder: lm.shoulder?.x ?? 0.36,
          girth: lm.girth?.x ?? 0.42,
          point_of_hip: lm.point_of_hip?.x,
          loin: lm.loin?.x,
          buttock: lm.buttock?.x ?? 0.85,
        });
        console.log("Red line X:", {
          line1X,
          line2X,
          line3X,
          line4X,
          landmarkXMin,
          landmarkXMax,
          facingRight,
          distinct: new Set([line1X, line2X, line3X, line4X]).size === 4,
        });

        scene.add(
          makeVerticalLine(
            line1X,
            finalBbox.max.y,
            0,
            bboxCenter.z,
            0xff3333,
          ),
        );
        scene.add(
          makeVerticalLine(
            line2X,
            finalBbox.max.y,
            0,
            bboxCenter.z,
            0xff3333,
          ),
        );
        scene.add(
          makeVerticalLine(
            line3X,
            finalBbox.max.y,
            0,
            bboxCenter.z,
            0xff3333,
          ),
        );
        scene.add(
          makeVerticalLine(
            line4X,
            finalBbox.max.y,
            0,
            bboxCenter.z,
            0xff3333,
          ),
        );

        const elbowBone =
          bonePositions["VIS_upper_arm_ik_pole.L"] ??
          bonePositions["VIS_upper_arm_ik_poleL"];
        const frontPlumbX = elbowBone
          ? elbowBone.x
          : (bonePositions["forefoot_ik.L"]?.x ??
            bonePositions["forefoot_ikL"]?.x ??
            line1X);
        const frontSphereY = elbowBone
          ? elbowBone.y
          : finalBbox.max.y * 0.6;

        const buttockBone =
          bonePositions["ORG-tail.003"] ?? bonePositions["ORG-tail003"];
        const hindPlumbX = buttockBone ? buttockBone.x : line4X;
        const hindSphereY = buttockBone
          ? buttockBone.y
          : finalBbox.max.y * 0.7;

        const frontPlumbGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(frontPlumbX, finalBbox.min.y, bboxCenter.z),
          new THREE.Vector3(frontPlumbX, frontSphereY, bboxCenter.z),
        ]);
        const plumbMat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.85,
        });
        const frontPlumbLine = new THREE.Line(frontPlumbGeo, plumbMat);
        frontPlumbLine.visible = false;
        scene.add(frontPlumbLine);
        frontPlumbLineRef.current = frontPlumbLine;

        const hindPlumbGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(hindPlumbX, finalBbox.min.y, bboxCenter.z),
          new THREE.Vector3(hindPlumbX, hindSphereY, bboxCenter.z),
        ]);
        const hindPlumbLine = new THREE.Line(hindPlumbGeo, plumbMat.clone());
        hindPlumbLine.visible = false;
        scene.add(hindPlumbLine);
        hindPlumbLineRef.current = hindPlumbLine;

        const sphereGeo = new THREE.SphereGeometry(0.04, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        const frontSphere = new THREE.Mesh(sphereGeo, sphereMat);
        frontSphere.position.set(frontPlumbX, frontSphereY, bboxCenter.z);
        frontSphere.visible = false;
        scene.add(frontSphere);
        frontSphereRef.current = frontSphere;

        const hindSphere = new THREE.Mesh(sphereGeo.clone(), sphereMat.clone());
        hindSphere.position.set(hindPlumbX, hindSphereY, bboxCenter.z);
        hindSphere.visible = false;
        scene.add(hindSphere);
        hindSphereRef.current = hindSphere;

        if (!disposed) {
          setDebugInfo({
            ...morphWeights,
            line1X,
            line2X,
            line3X,
            line4X,
            frontPlumbX,
            hindPlumbX,
            facingRight,
          });
        }

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
          bboxCenter.x,
          bboxCenter.y,
          finalBbox.max.z + 5.0,
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
      setDebugInfo(null);
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.removeEventListener("change", updatePlumbVisibility);
      controls.dispose();
      frontPlumbLineRef.current = null;
      hindPlumbLineRef.current = null;
      frontSphereRef.current = null;
      hindSphereRef.current = null;

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

      {process.env.NODE_ENV === "development" && debugInfo ? (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            background: "rgba(0,0,0,0.75)",
            color: "#00ff88",
            fontFamily: "monospace",
            fontSize: "11px",
            padding: "8px 10px",
            borderRadius: 6,
            lineHeight: 1.6,
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          <div style={{ color: "#ffcc00", marginBottom: 4 }}>EQUIFORM DEBUG</div>
          <div>back_long:          {formatDebugNumber(debugInfo.back_long, 2)}</div>
          <div>croup_high:         {formatDebugNumber(debugInfo.croup_high, 2)}</div>
          <div>
            shoulder_laid_back: {formatDebugNumber(debugInfo.shoulder_laid_back, 2)}
          </div>
          <div>neck_long:          {formatDebugNumber(debugInfo.neck_long, 2)}</div>
          <div>legs_long:          {formatDebugNumber(debugInfo.legs_long, 2)}</div>
          <div style={{ marginTop: 4, color: "#88ccff" }}>
            L1x: {formatDebugNumber(debugInfo.line1X, 3)} &nbsp; L2x:{" "}
            {formatDebugNumber(debugInfo.line2X, 3)}
          </div>
          <div style={{ color: "#88ccff" }}>
            L3x: {formatDebugNumber(debugInfo.line3X, 3)} &nbsp; L4x:{" "}
            {formatDebugNumber(debugInfo.line4X, 3)}
          </div>
          <div style={{ color: "#ff88ff", marginTop: 4 }}>
            frontPlumb: {formatDebugNumber(debugInfo.frontPlumbX, 3)} &nbsp;
            hindPlumb: {formatDebugNumber(debugInfo.hindPlumbX, 3)}
          </div>
          <div style={{ color: "#ff88ff" }}>
            facingRight: {debugInfo.facingRight ? "YES" : "NO"}
          </div>
        </div>
      ) : null}

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
