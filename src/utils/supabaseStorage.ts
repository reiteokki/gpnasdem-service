import { SupabaseClient } from "@supabase/supabase-js";

export const uploadFile = async (
  client: SupabaseClient,
  bucketName: string,
  file: Buffer | File,
  path: string
): Promise<string | null> => {
  try {
    const { data, error } = await client.storage
      .from(bucketName)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Upload error:", error.message);
      return null;
    }

    const { data: publicUrlData } = client.storage
      .from(bucketName)
      .getPublicUrl(path);
    return publicUrlData?.publicUrl ?? null;
  } catch (err) {
    console.error("Upload failed:", err);
    return null;
  }
};

export const deleteFile = async (
  client: SupabaseClient,
  bucketName: string,
  fileUrl: string
): Promise<void> => {
  try {
    // Extract the file path relative to the bucket
    const filePath = fileUrl.split(`${bucketName}/`)[1]; // Extract the relative path from the full URL

    if (!filePath) {
      console.error("Invalid file URL format:", fileUrl);
      return;
    }

    // Remove the file from the specified bucket
    const { error } = await client.storage.from(bucketName).remove([filePath]);

    if (error) {
      console.error(
        `Error deleting file from bucket "${bucketName}":`,
        error.message
      );
    } else {
      console.log(
        `File deleted successfully from bucket "${bucketName}":`,
        filePath
      );
    }
  } catch (err) {
    console.error("Error in deleteFile utility:", err);
  }
};
