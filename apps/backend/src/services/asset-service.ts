/**
 * Asset Service
 * 
 * Note: Vercel Blob returns full URLs when files are uploaded (e.g., using `put` method).
 * These URLs are already accessible and include authentication/signing as needed.
 * 
 * Best Practice:
 * - When uploading to Vercel Blob, store the full URL (result.url) in the database
 * - The "blobPath" fields in our schema should contain full URLs like:
 *   "https://your-store.public.blob.vercel-storage.com/characters/nana7mi-portrait-abc123.png"
 * 
 * This service provides a passthrough for now, allowing future enhancement
 * for URL transformation, CDN integration, or access control if needed.
 */

/**
 * Returns the asset URL (currently a passthrough)
 * In the future, this could add CDN prefixes, query parameters, or access tokens
 * 
 * @param blobUrl - The full Vercel Blob URL stored in database
 * @returns The asset URL (currently unchanged)
 */
export const getAssetUrl = (blobUrl: string): string => {
  // Passthrough for now - blob URLs from Vercel are already fully accessible
  // Future enhancements could include:
  // - Adding CDN prefixes
  // - Appending cache-busting parameters
  // - Adding access tokens for private blobs
  return blobUrl;
};

/**
 * Returns asset URLs for multiple blobs
 * @param blobUrls - Array of full Vercel Blob URLs
 * @returns Array of asset URLs
 */
export const getAssetUrls = (blobUrls: readonly string[]): readonly string[] => {
  return blobUrls.map((url) => getAssetUrl(url));
};

