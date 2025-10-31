"use client";

import { useState, useRef } from "react";
import { notification } from "~~/utils/scaffold-eth";

interface ImageUploadProps {
  onImageUploaded: (ipfsHash: string, imageUrl: string) => void;
  currentImage?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ onImageUploaded, currentImage }) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentImage || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Upload to Thirdweb Storage (Flow ecosystem partner)
   * - No API key required
   * - Free IPFS storage
   * - Fast CDN delivery
   * - Perfect for Flow/EVM
   */
  const uploadToThirdweb = async (file: File): Promise<{ hash: string; url: string }> => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      console.log("📤 Uploading to Thirdweb Storage...");
      // Get Client ID from environment variable
const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;

if (!clientId) {
  throw new Error("Thirdweb Client ID is not configured. Please add NEXT_PUBLIC_THIRDWEB_CLIENT_ID to your .env.local file");
}
const response = await fetch("https://storage.thirdweb.com/ipfs/upload", {
  method: "POST",
  headers: {
    "x-client-id": clientId, // THIS IS THE NEW LINE
  },
  body: formData,
});

      const data = await response.json();
      console.log("📦 Thirdweb response:", data);
      
      // Thirdweb returns different formats, handle both
      const ipfsHash = data.IpfsHash || data.cid || data.ipfsHash;
      
      if (!ipfsHash) {
        throw new Error("No IPFS hash returned from Thirdweb");
      }

      // Use Thirdweb's fast CDN gateway
      const ipfsUrl = `https://ipfs.thirdwebcdn.com/ipfs/${ipfsHash}`;

      console.log("✅ Upload successful!");
      console.log("📦 IPFS Hash:", ipfsHash);
      console.log("🔗 Image URL:", ipfsUrl);

      return { hash: ipfsHash, url: ipfsUrl };
    } catch (error) {
      console.error("❌ Thirdweb upload error:", error);
      throw error;
    }
  };

  /**
   * Compress image before upload (reduces costs and speeds up upload)
   */
  const compressImage = (file: File, maxWidth: number = 1200): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          // Scale down if too large
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Failed to compress image"));
                return;
              }
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              console.log(`🗜️ Compressed: ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB`);
              resolve(compressedFile);
            },
            "image/jpeg",
            0.85 // Quality: 85%
          );
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      notification.error("Please select an image file");
      return;
    }

    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      notification.error("Image size must be less than 10MB");
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to Thirdweb
    setUploading(true);
    notification.info("📤 Uploading to Thirdweb Storage...");

    try {
      // Compress image first to save bandwidth and storage
      let fileToUpload = file;
      if (file.size > 500 * 1024) { // Compress if larger than 500KB
        notification.info("🗜️ Compressing image...");
        fileToUpload = await compressImage(file);
      }

      // Upload to Thirdweb
      const result = await uploadToThirdweb(fileToUpload);

      notification.success(
        `✅ Uploaded to Thirdweb! Hash: ${result.hash.substring(0, 8)}...`
      );
      
      onImageUploaded(result.hash, result.url);
    } catch (error: any) {
      console.error("Upload failed:", error);
      notification.error(
        `Failed to upload: ${error.message || "Unknown error"}. Please try again.`
      );
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleClearImage = () => {
    setPreview(null);
    onImageUploaded("", "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-gray-300 text-sm mb-1 font-medium">
        📸 Service Image <span className="text-red-400">*</span>
      </label>
      
      {/* Preview */}
      {preview && (
        <div className="relative w-full h-48 bg-gray-900 rounded-lg overflow-hidden border-2 border-purple-500 shadow-lg">
          <img 
            src={preview} 
            alt="Service preview" 
            className="w-full h-full object-cover" 
          />
          {uploading && (
            <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center">
              <div className="relative">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-purple-500 text-xl">⬆️</div>
                </div>
              </div>
              <div className="text-white text-sm font-medium mt-3">Uploading to Thirdweb...</div>
              <div className="text-purple-400 text-xs mt-1">Flow Ecosystem Storage</div>
            </div>
          )}
          {!uploading && (
            <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
              ✓ Ready
            </div>
          )}
          {!uploading && (
            <div className="absolute bottom-2 left-2 bg-purple-600 bg-opacity-90 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 0C4.477 0 0 4.477 0 10s4.477 10 10 10 10-4.477 10-10S15.523 0 10 0zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"/>
              </svg>
              Thirdweb IPFS
            </div>
          )}
        </div>
      )}

      {/* Upload Buttons */}
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />
        
        <button
          type="button"
          onClick={handleCapture}
          disabled={uploading}
          className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Uploading...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              📷 {preview ? "Change Photo" : "Take/Upload Photo"}
            </span>
          )}
        </button>

        {preview && !uploading && (
          <button
            type="button"
            onClick={handleClearImage}
            className="px-4 py-3 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-all shadow-md hover:shadow-lg"
          >
            🗑️ Remove
          </button>
        )}
      </div>

      {/* Info */}
      <div className="bg-purple-900 bg-opacity-30 border border-purple-700 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <div className="text-purple-400 text-lg mt-0.5">🔷</div>
          <div className="flex-1">
            <p className="text-xs text-purple-300 font-medium mb-1">
              Powered by Thirdweb Storage
            </p>
            <p className="text-xs text-purple-400">
              ✓ Free IPFS storage • ✓ Fast CDN • ✓ Decentralized • ✓ No API key needed
            </p>
          </div>
        </div>
      </div>

      {/* Required indicator */}
      {!preview && (
        <div className="bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded-lg p-2">
          <p className="text-xs text-yellow-300 flex items-center gap-2">
            <span>⚠️</span>
            <span>Photo is required to create a service</span>
          </p>
        </div>
      )}
    </div>
  );
};