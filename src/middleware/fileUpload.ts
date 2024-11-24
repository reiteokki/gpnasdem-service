import multer from "multer";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
});

export default upload.fields([
  { name: "id_card", maxCount: 1 },
  { name: "avatar", maxCount: 1 },
  { name: "cover", maxCount: 1 },
  { name: "media", maxCount: 10 }, 
]);
