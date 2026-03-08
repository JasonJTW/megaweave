/**
 * Utility for compressing images on the client side using HTML5 Canvas.
 */
export async function compressImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.8
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        // Use WebP if supported, otherwise fallback to JPEG
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              // Final fallback to JPEG if WebP blob creation fails
              canvas.toBlob((jpegBlob) => resolve(jpegBlob), "image/jpeg", quality);
            }
          },
          "image/webp",
          quality
        );
      };
      img.onerror = () => resolve(null);
    };
    reader.onerror = () => resolve(null);
  });
}
