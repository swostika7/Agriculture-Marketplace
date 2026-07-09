/**
 * ImageUploader.jsx
 * Allows uploading image from device (converts to base64)
 * Supports drag-and-drop and click-to-upload
 */
import React, { useRef, useState } from 'react';
import { MdCloudUpload, MdDelete, MdImage } from 'react-icons/md';

export default function ImageUploader({ value, onChange, label = 'Product Image', size = 'normal' }) {
  const inputRef    = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error,    setError]    = useState('');

  const handleFile = (file) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file (JPG, PNG, WEBP, etc.)'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('Image must be under 2 MB'); return; }

    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleChange = (e) => handleFile(e.target.files[0]);
  const handleDrop   = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); };
  const handleDrag   = (e) => { e.preventDefault(); setDragging(true); };
  const handleLeave  = ()  => setDragging(false);
  const clear        = (e) => { e.stopPropagation(); onChange(''); if (inputRef.current) inputRef.current.value = ''; };

  const isSmall = size === 'small';

  if (value) {
    return (
      <div>
        <label className="label">{label}</label>
        <div className={`relative inline-block ${isSmall ? 'w-24 h-24' : 'w-full h-48'}`}>
          <img
            src={value}
            alt="Preview"
            className={`${isSmall ? 'w-24 h-24 rounded-2xl' : 'w-full h-48 rounded-2xl'} object-cover border-2 border-earth-200 shadow-sm`}
          />
          <button
            type="button"
            onClick={clear}
            className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors"
            title="Remove image"
          >
            <MdDelete size={14} />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 px-2.5 py-1 bg-black/60 hover:bg-black/80 text-white text-xs rounded-lg transition-colors font-body"
          >
            Change
          </button>
          <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="sr-only" />
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && <label className="label">{label}</label>}
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDrag}
        onDragLeave={handleLeave}
        className={`
          flex flex-col items-center justify-center gap-3 cursor-pointer rounded-2xl border-2 border-dashed transition-all
          ${isSmall ? 'h-24 w-24' : 'h-40 w-full'}
          ${dragging
            ? 'border-leaf-400 bg-leaf-50 scale-[1.01]'
            : 'border-earth-300 bg-earth-50 hover:border-leaf-400 hover:bg-leaf-50'}
        `}
      >
        {dragging
          ? <MdCloudUpload size={isSmall ? 28 : 36} className="text-leaf-500 animate-bounce" />
          : <MdImage       size={isSmall ? 24 : 32} className="text-earth-400" />}
        {!isSmall && (
          <>
            <div className="text-center">
              <p className="text-sm font-medium text-earth-600 font-body">Click to upload or drag & drop</p>
              <p className="text-xs text-earth-400 font-body mt-0.5">JPG, PNG, WEBP · Max 2 MB</p>
            </div>
            <span className="text-xs bg-leaf-100 text-leaf-700 px-3 py-1 rounded-full font-body font-medium">Browse Files</span>
          </>
        )}
        <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="sr-only" />
      </div>
      {error && <p className="text-xs text-red-500 mt-1.5 font-body flex items-center gap-1">⚠️ {error}</p>}
    </div>
  );
}
