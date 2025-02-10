"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFile = exports.uploadFile = void 0;
const uploadFile = (client, bucketName, file, path) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { data, error } = yield client.storage
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
        return (_a = publicUrlData === null || publicUrlData === void 0 ? void 0 : publicUrlData.publicUrl) !== null && _a !== void 0 ? _a : null;
    }
    catch (err) {
        console.error("Upload failed:", err);
        return null;
    }
});
exports.uploadFile = uploadFile;
const deleteFile = (client, bucketName, fileUrl) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Extract the file path relative to the bucket
        const filePath = fileUrl.split(`${bucketName}/`)[1]; // Extract the relative path from the full URL
        if (!filePath) {
            console.error("Invalid file URL format:", fileUrl);
            return;
        }
        // Remove the file from the specified bucket
        const { error } = yield client.storage.from(bucketName).remove([filePath]);
        if (error) {
            console.error(`Error deleting file from bucket "${bucketName}":`, error.message);
        }
        else {
            console.log(`File deleted successfully from bucket "${bucketName}":`, filePath);
        }
    }
    catch (err) {
        console.error("Error in deleteFile utility:", err);
    }
});
exports.deleteFile = deleteFile;
