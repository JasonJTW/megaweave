import React, { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface ImageGalleryProps {
  images: string[]; // medium thumbnails — for gallery & nav strip
  fullImages?: string[]; // originals — lazy-loaded only when modal opens
  /** Rendered on top of the main image only (not over thumbnails) */
  mainOverlay?: React.ReactNode;
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  fullImages,
  mainOverlay,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goToImage = (index: number) => {
    setCurrentIndex(index);
  };

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  if (images.length === 0) return null;

  return (
    <>
      <div className="relative">
        {/* 主圖片 */}
        <div className="relative overflow-hidden rounded-[20px] bg-gray-200 shadow-sm">
          <div
            className="relative h-[420px] cursor-pointer overflow-hidden sm:h-[520px]"
            onClick={openModal}
          >
            <Image
              key={images[currentIndex]}
              src={images[currentIndex]}
              alt={`圖片 ${currentIndex + 1}`}
              fill
              className="object-contain"
            />

            {/* 圖片數量指示器 */}
            {images.length > 1 && (
              <div className="absolute right-4 top-4 rounded bg-black bg-opacity-50 px-2 py-1 text-sm text-white">
                {currentIndex + 1} / {images.length}
              </div>
            )}

            {mainOverlay}

            {/* 左右箭頭 — 對齊主圖區域 */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    prevImage();
                  }}
                  className="absolute left-4 top-1/2 z-10 -translate-y-1/2 transform rounded-full bg-black bg-opacity-50 p-2 text-white transition-opacity hover:bg-opacity-75"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    nextImage();
                  }}
                  className="absolute right-4 top-1/2 z-10 -translate-y-1/2 transform rounded-full bg-black bg-opacity-50 p-2 text-white transition-opacity hover:bg-opacity-75"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* 縮圖導航 — 在主圖外，點擊切換上方大圖 */}
        {images.length > 1 && (
          <div className="mt-4 flex space-x-2 overflow-x-auto pb-2">
            {images.map((image, index) => (
              <button
                key={index}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goToImage(index);
                }}
                className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 ${
                  index === currentIndex
                    ? "border-blue-500"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="relative h-full w-full">
                  <Image
                    src={image}
                    alt={`縮圖 ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 全螢幕模態框 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
          <div className="max-h-4xl relative flex h-full w-full max-w-4xl items-center justify-center">
            {/* 關閉按鈕 */}
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 z-10 text-white hover:text-gray-300"
            >
              <X className="h-8 w-8" />
            </button>

            {/* 圖片 */}
            <div className="relative flex h-full w-full items-center justify-center">
              <div className="relative max-h-full max-w-full">
                <Image
                  key={fullImages?.[currentIndex] ?? images[currentIndex]}
                  src={fullImages?.[currentIndex] ?? images[currentIndex]}
                  alt={`圖片 ${currentIndex + 1}`}
                  width={1200}
                  height={800}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>

            {/* 左右箭頭 */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 transform rounded-full bg-black bg-opacity-50 p-3 text-white transition-opacity hover:bg-opacity-75"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transform rounded-full bg-black bg-opacity-50 p-3 text-white transition-opacity hover:bg-opacity-75"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}

            {/* 圖片數量指示器 */}
            {images.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 transform rounded bg-black bg-opacity-50 px-4 py-2 text-sm text-white">
                {currentIndex + 1} / {images.length}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ImageGallery;
