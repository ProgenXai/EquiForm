"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type PhotoGuideSlide = {
  id: string;
  title: string;
  image: string;
  imageAlt: string;
  doItems: readonly string[];
  dontItems: readonly string[];
};

const SWIPE_THRESHOLD_PX = 50;

function DoDontList({
  doItems,
  dontItems,
}: {
  doItems: readonly string[];
  dontItems: readonly string[];
}) {
  return (
    <div className="mt-8 grid gap-6 sm:grid-cols-2">
      <section>
        <h3 className="text-sm font-semibold text-green-400">Do</h3>
        <ul className="mt-3 space-y-3">
          {doItems.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-sm leading-relaxed text-zinc-300"
            >
              <span className="shrink-0" aria-hidden="true">
                ✅
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-red-400">Don&apos;t</h3>
        <ul className="mt-3 space-y-3">
          {dontItems.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-sm leading-relaxed text-zinc-300"
            >
              <span className="shrink-0" aria-hidden="true">
                ❌
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function PhotoGuideCarousel({
  slides,
}: {
  slides: readonly PhotoGuideSlide[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const slide = slides[activeIndex];
  const slideCount = slides.length;

  const goToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= slideCount) return;
      setActiveIndex(index);
    },
    [slideCount],
  );

  const goToPrevious = useCallback(() => {
    goToSlide(activeIndex - 1);
  }, [activeIndex, goToSlide]);

  const goToNext = useCallback(() => {
    goToSlide(activeIndex + 1);
  }, [activeIndex, goToSlide]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNext, goToPrevious]);

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchEndX.current = null;
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    touchEndX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd() {
    if (touchStartX.current === null || touchEndX.current === null) {
      touchStartX.current = null;
      touchEndX.current = null;
      return;
    }

    const delta = touchStartX.current - touchEndX.current;
    if (delta > SWIPE_THRESHOLD_PX) {
      goToNext();
    } else if (delta < -SWIPE_THRESHOLD_PX) {
      goToPrevious();
    }

    touchStartX.current = null;
    touchEndX.current = null;
  }

  if (!slide) {
    return null;
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Photo guide by view"
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
    >
      <div className="mb-4 flex flex-col items-center gap-1 text-center sm:flex-row sm:justify-between sm:text-left">
        <h2 className="text-xl font-semibold text-white">{slide.title}</h2>
        <p className="text-sm text-zinc-400" aria-live="polite">
          {activeIndex + 1} of {slideCount}
        </p>
      </div>

      <div
        className="relative touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
          <Image
            key={slide.id}
            src={`/examples/${slide.image}`}
            alt={slide.imageAlt}
            width={800}
            height={600}
            priority={activeIndex === 0}
            className="mx-auto max-h-72 w-full object-contain sm:max-h-96"
          />
        </div>

        <button
          type="button"
          onClick={goToPrevious}
          disabled={activeIndex === 0}
          aria-label="Previous view"
          className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700 bg-black/70 text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={goToNext}
          disabled={activeIndex === slideCount - 1}
          aria-label="Next view"
          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700 bg-black/70 text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>

      <div
        className="mt-4 flex justify-center gap-2"
        role="tablist"
        aria-label="Photo guide views"
      >
        {slides.map((item, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${item.title}, slide ${index + 1} of ${slideCount}`}
              onClick={() => goToSlide(index)}
              className={`h-2.5 w-2.5 rounded-full transition ${
                isActive ? "bg-accent" : "bg-zinc-600 hover:bg-zinc-500"
              }`}
            />
          );
        })}
      </div>

      <DoDontList doItems={slide.doItems} dontItems={slide.dontItems} />
    </section>
  );
}
