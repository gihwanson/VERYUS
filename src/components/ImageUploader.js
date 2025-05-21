// src/components/ImageUploader.js

import React, { useState } from "react";

const ImageUploader = ({ uploadType = "post", onUploadSuccess }) => {
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      const res = await fetch(
        `https://firebase-proxy-966196979262.asia-northeast3.run.app/upload?type=${uploadType}`,
        {
          method: "POST",
          body: formData,
        }
      );
      const data = await res.json();
      if (data.url) {
        alert("✅ 업로드 성공!");
        if (onUploadSuccess) onUploadSuccess(data.url); // 부모에게 URL 전달
      } else {
        alert("❌ 업로드 실패");
      }
    } catch (err) {
      console.error("❌ 업로드 중 오류:", err);
      alert("❌ 업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: "10px", border: "1px dashed #aaa", borderRadius: "6px" }}>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading}
      />
      {preview && (
        <div style={{ marginTop: 10 }}>
          <strong>{fileName}</strong>
          <img
            src={preview}
            alt="미리보기"
            style={{ width: "150px", marginTop: "10px", borderRadius: "8px" }}
          />
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
