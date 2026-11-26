-- Supabase SQL for the TOA Admin feature updates.
-- Run this once in Supabase SQL Editor.

-- Allow named customer reviews to store an uploaded customer photo.
DO $$
BEGIN
  IF to_regclass('public.reviews') IS NOT NULL THEN
    ALTER TABLE public.reviews
      ADD COLUMN IF NOT EXISTS photo_url text;

    COMMENT ON COLUMN public.reviews.photo_url IS
      'Storage path for the customer photo shown with the review.';
  END IF;
END $$;

-- Store product hashtag assignments in the existing settings table.
DO $$
BEGIN
  IF to_regclass('public.settings') IS NOT NULL THEN
    INSERT INTO public.settings (key, value)
    VALUES ('hashtags', '{}')
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

-- Remove the product-images bucket file-size limit.
-- A NULL file_size_limit means the bucket is not limited by Supabase.
-- NULL allowed_mime_types allows the existing admin page to upload photos,
-- GIFs, animations, and videos.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'product-images',
      'product-images',
      true,
      NULL,
      NULL
    )
    ON CONFLICT (id) DO UPDATE
    SET
      public = true,
      file_size_limit = NULL,
      allowed_mime_types = NULL;
  END IF;
END $$;
