'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileCode, Copy, Check, Loader2, Sparkles, X, AlertCircle, Clock, Download, Plus, History, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';

export default function Home() {
  const [images, setImages] = useState<string[]>([]);
  const [originalImages, setOriginalImages] = useState<string[]>([]); 
  const [isUploading, setIsUploading] = useState(false);
  const [latex, setLatex] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [docConfig, setDocConfig] = useState({
    chapter: '',
    lesson: '',
    date: new Date().toLocaleDateString('vi-VN', { 
      day: 'numeric', month: 'long', year: 'numeric' 
    }).replace('ngày ', 'Ngày ')
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const optimizeImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 1000;
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; } }
        else { if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; } }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Str);
        ctx.filter = 'grayscale(1) contrast(1.2) brightness(1.1)';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.4));
      };
    });
  };

  const createThumbnail = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 400;
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; } }
        else { if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; } }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.filter = 'grayscale(1) contrast(1.2)'; ctx.drawImage(img, 0, 0, width, height); }
        resolve(canvas.toDataURL('image/jpeg', 0.4));
      };
    });
  };

  const processFile = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject("Lỗi đọc file.");
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const fileArray = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    try {
      const newImages = await Promise.all(fileArray.map(f => processFile(f)));
      setOriginalImages((prev) => [...prev, ...newImages]);
      setImages((prev) => [...prev, ...newImages]);
    } catch (err: any) {
      setError("Có gì đó chưa đúng, bạn thử lại nhé.");
    }
  };

  const startCountdown = (seconds: number) => {
    return new Promise<void>((resolve) => {
      setCountdown(seconds);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) { clearInterval(interval); resolve(); return null; }
          return prev - 1;
        });
      }, 1000);
    });
  };

  const sortImagesAutomatically = async () => {
    if (images.length <= 1) return;
    setIsUploading(true);
    setStatusMessage("PHÂN TÍCH THỨ TỰ...");
    try {
      const thumbPromises = images.map((img: string) => createThumbnail(img));
      const thumbnails = await Promise.all(thumbPromises);
      const sortRes = await fetch('/api/sort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbnails })
      });
      const sortData = await sortRes.json();
      if (sortData.order && Array.isArray(sortData.order)) {
        const newOriginals = sortData.order.map((idx: number) => originalImages[idx]).filter(Boolean);
        const newImages = sortData.order.map((idx: number) => images[idx]).filter(Boolean);
        setOriginalImages(newOriginals);
        setImages(newImages);
        setStatusMessage("ĐÃ XONG!");
      }
    } catch (e) {
      setError("Không thể sắp xếp tự động.");
    } finally {
      setIsUploading(false);
      setTimeout(() => setStatusMessage(""), 2000);
    }
  };

  const generateLatex = async () => {
    if (images.length === 0) return;
    setIsUploading(true);
    setError(null);
    setLatex('');
    setProgress(0);
    setCountdown(null);
    
    let combined = "";

    try {
      const CHUNK_SIZE = 5;
      const chunks: string[][] = [];
      for (let i = 0; i < images.length; i += CHUNK_SIZE) {
        chunks.push(images.slice(i, i + CHUNK_SIZE));
      }

      for (let batchIdx = 0; batchIdx < chunks.length; batchIdx++) {
        const currentChunk = chunks[batchIdx];
        setStatusMessage(`NÉN ĐỢT ${batchIdx + 1}/${chunks.length}...`);
        const optimizedBatch = await Promise.all(currentChunk.map(img => optimizeImage(img)));
        
        let currentModelIdx = 0;
        let success = false;
        let retries = 0;
        const MAX_RETRIES = 10;

        while (!success && retries < MAX_RETRIES) {
          setStatusMessage(`${batchIdx + 1}/${chunks.length} (${optimizedBatch.length} TRANG)...`);
          const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              images: optimizedBatch, isFirst: batchIdx === 0,
              batchIndex: batchIdx, totalBatches: chunks.length,
              modelIndex: currentModelIdx, docConfig 
            }),
          });
          const data = await response.json();
          if (response.status === 429 && data.error === "quota_hit") {
            if (currentModelIdx < 5) { currentModelIdx++; continue; }
            const waitTime = data.retryAfter || 45;
            setStatusMessage(`ĐANG XẾP HÀNG ĐỢI GOOGLE... (${retries + 1}/${MAX_RETRIES})`);
            await startCountdown(waitTime);
            retries++; currentModelIdx = 0; continue; 
          }
          if (response.status === 404 && data.error === "model_not_found") {
            currentModelIdx = data.nextModelIndex || (currentModelIdx + 1);
            if (currentModelIdx >= 6) { currentModelIdx = 0; retries++; await startCountdown(30); }
            continue; 
          }
          if (!response.ok || data.error) throw new Error(data.error || "Lỗi server.");
          
          let chunkOutput = data.latex;
          if (batchIdx === 0) { combined = chunkOutput; } 
          else {
            let cleanChunk = chunkOutput;
            const beginDocMatch = chunkOutput.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/i);
            const beginEnumMatch = chunkOutput.match(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/i);
            if (beginDocMatch) { cleanChunk = beginDocMatch[1].trim(); } 
            else if (beginEnumMatch) { cleanChunk = beginEnumMatch[1].trim(); }
            else {
              cleanChunk = chunkOutput.replace(/\\documentclass[\s\S]*?\\begin\{document\}/i, "")
                                       .replace(/\\begin\{document\}/i, "")
                                       .replace(/\\end\{document\}/i, "").trim();
            }
            const lastEndDoc = combined.lastIndexOf("\\end{document}");
            const lastEndEnum = combined.lastIndexOf("\\end{enumerate}");
            let insertAt = lastEndDoc;
            if (cleanChunk.trim().startsWith("\\item") && lastEndEnum !== -1) { insertAt = lastEndEnum; }
            if (insertAt !== -1) { combined = combined.slice(0, insertAt) + "\n" + cleanChunk + "\n" + combined.slice(insertAt); } 
            else { combined += "\n" + cleanChunk; }
          }
          setLatex(combined);
          setProgress(Math.round(((batchIdx + 1) / chunks.length) * 100));
          success = true;
        }
        if (!success) throw new Error(`Thất bại tại đợt ${batchIdx + 1}.`);
      }
      setStatusMessage("HOÀN TẤT!");
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối.");
    } finally {
      setIsUploading(false);
      setCountdown(null);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(latex);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const downloadTex = () => {
    const element = document.createElement("a");
    const file = new Blob([latex], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = "output.tex";
    document.body.appendChild(element); element.click(); document.body.removeChild(element);
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setOriginalImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const smoothTransition = { type: 'spring' as const, stiffness: 100, damping: 20 };

  return (
    <main className="container">
      <div className="raw-grid">
        <motion.section initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ ...smoothTransition, delay: 0.1 }}>
          <div className="meta-block">
            <div className="card doc-config-panel">
              <h2 style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>// CONFIG</h2>
              <input className="input-field" value={docConfig.chapter} onChange={(e) => setDocConfig({...docConfig, chapter: e.target.value})} placeholder="CHƯƠNG / CHUYÊN ĐỀ" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <input className="input-field" value={docConfig.lesson} onChange={(e) => setDocConfig({...docConfig, lesson: e.target.value})} placeholder="TÊN BÀI" />
                <input className="input-field" value={docConfig.date} onChange={(e) => setDocConfig({...docConfig, date: e.target.value})} placeholder="NGÀY THÁNG" />
              </div>
            </div>
          </div>

          <div className="card">
            <div 
              className={`upload-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileCode size={40} strokeWidth={2} style={{ marginBottom: '1.5rem', opacity: 0.6 }} />
              <p style={{ fontWeight: 600, fontSize: '1.1rem' }}>Thả ảnh tại đây</p>
              <input type="file" ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} accept="image/*" multiple hidden />
            </div>

            <AnimatePresence>
              {originalImages.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={smoothTransition} style={{ marginTop: '2.5rem' }}>
                  <Reorder.Group axis="y" values={originalImages} onReorder={(n) => { setOriginalImages(n); setImages(n); }}>
                    {originalImages.map((img, idx) => (
                      <Reorder.Item key={img} value={img} className="preview-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={smoothTransition}>
                        <div className="preview-thumb"><img src={img} alt="" /></div>
                        <span style={{ fontWeight: 700 }}>TRANG {idx + 1}</span>
                        <button className="remove-btn" onClick={(e) => { e.stopPropagation(); removeImage(idx); }}><X size={16} /></button>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginTop: '2rem' }}>
                    <button className="btn btn-secondary" onClick={sortImagesAutomatically} disabled={isUploading}><History size={20} /> SORT</button>
                    <button className="btn" onClick={generateLatex} disabled={isUploading}>
                      {isUploading ? <Loader2 className="animate-spin" /> : <><Sparkles size={20} /> START</>}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {error && <div className="card" style={{ background: '#000', color: '#fff', padding: '1rem' }}>ERROR: {error}</div>}
        </motion.section>

        <motion.section initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ ...smoothTransition, delay: 0.2 }}>
          {isUploading && (
            <div className="status-bar">
              <span>{countdown !== null ? `WAIT: ${countdown}S` : statusMessage}</span>
              <span>{progress}%</span>
            </div>
          )}

          <div className="code-container">
            <div className="code-header">
              <span style={{ fontWeight: 900 }}>OUTPUT_FINAL.TEX</span>
              {latex && (
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="btn" style={{ padding: '0.6rem', border: '2px solid #fff', background: 'transparent' }} onClick={downloadTex}><Download size={16} /></button>
                  <button className="btn" style={{ padding: '0.6rem 1.25rem', border: '2px solid #fff', background: 'transparent', fontSize: '0.9rem' }} onClick={copyToClipboard}>
                    {isCopied ? <Check size={16} /> : <Copy size={16} />} <span>{isCopied ? 'DONE' : 'COPY'}</span>
                  </button>
                </div>
              )}
            </div>
            <div className="code-content">
              {latex ? (
                <pre><code>{latex}</code></pre>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.2 }}>
                  <FileCode size={80} strokeWidth={1} />
                  <p style={{ fontWeight: 800 }}>MÃ LATEX SẼ XUẤT HIỆN TẠI ĐÂY</p>
                </div>
              )}
            </div>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
