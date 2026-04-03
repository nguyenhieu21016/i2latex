import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Verified models for 2026 free tier - Expanded for max redundancy
const MODELS = [
  "gemini-2.5-flash", 
  "gemini-2.5-flash-lite", 
  "gemini-1.5-flash", 
  "gemini-2.5-pro", 
  "gemini-1.5-pro", 
  "gemini-2.0-flash-lite"
];

export async function POST(req: Request) {
  try {
    const { images, isFirst, batchIndex, totalBatches, modelIndex = 0, docConfig } = await req.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }

    const promptPath = path.join(process.cwd(), "prompt.txt");
    const systemPromptOrigin = await fs.readFile(promptPath, "utf-8");

    // Metadata Injection
    const metaInstruction = docConfig ? `
SỬ DỤNG THÔNG TIN SAU CHO HEADER/FOOTER (TUYỆT ĐỐI CHÍNH XÁC):
- Ngày tháng (\lhead): ${docConfig.date || "Ngày ... tháng ... năm ..."}
- Tên bài học (\rhead): ${docConfig.lesson || "Tên bài học"}
- Tên chương (\fancyfoot[L]): ${docConfig.chapter || "Tên chương"}
- Chân trang phải (\fancyfoot[R]): Trang \\thepage
` : "";

    // Strengthened context for unified processing
    const systemPrompt = `${systemPromptOrigin}\n${metaInstruction}\n\nSTRICT UNIFIED INSTRUCTION:\n1. BẠN SẼ NHẬN ĐƯỢC NHIỀU ẢNH. Hãy coi chúng là các trang liên tiếp của MỘT tài liệu duy nhất.\n2. CHỈ TRẢ VỀ mã LaTeX hoàn chỉnh. Không thêm lời dẫn.\n3. Nhất quán định dạng: Sử dụng cùng một style enumerate cho tất cả các câu hỏi từ trang đầu đến trang cuối.`;

    const currentModel = MODELS[modelIndex] || MODELS[0];
    const model = genAI.getGenerativeModel({ 
      model: currentModel,
      systemInstruction: systemPrompt 
    });

    // Prepare multi-part input
    const imageParts = images.map((img: string) => {
      const base64Data = img.split(",")[1];
      const mimeType = img.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
      return {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      };
    });

    const userPrompt = isFirst && batchIndex === 0
      ? "Đây là toàn bộ các trang của tài liệu. Hãy chuyển đổi tất cả sang một file LaTeX hoàn chỉnh duy nhất, bắt đầu từ preamble. HÃY ĐỌC KỸ TỪNG KÝ TỰ TOÁN HỌC."
      : `Đây là đợt ảnh thứ ${batchIndex + 1}/${totalBatches}. Hãy tiếp tục nội dung từ các trang trước. CHỈ TRẢ VỀ phần thân tài liệu (body content), không lặp lại preamble. KIỂM TRA KỸ CÁC CHỈ SỐ DƯỚI (SUBSCRIPT).`;

    try {
      const result = await model.generateContent([...imageParts, userPrompt]);
      const response = await result.response;
      let rawText = response.text().trim();
      
      let latex = rawText;
      const codeBlockMatch = rawText.match(/```(?:latex|tex)?\s*([\s\S]*?)```/i);
      if (codeBlockMatch) {
        latex = codeBlockMatch[1].trim();
      } else {
        const latexStart = rawText.search(/\\documentclass|\\begin\{document\}|\\begin\{enumerate\}/);
        if (latexStart !== -1) {
          latex = rawText.slice(latexStart).trim();
        }
      }

      // Cleanup
      latex = latex.replace(/\\begin\{document\}[\s\S]*?\\begin\{document\}/g, "\\begin{document}");

      return NextResponse.json({ latex });
    } catch (error: any) {
      // Quota handling
      if (error.message?.includes("429") || error.status === 429) {
        if (error.message?.includes("limit: 0")) {
          return NextResponse.json({ error: "model_not_found", nextModelIndex: modelIndex + 1 }, { status: 404 });
        }
        let retryAfter = 45;
        const match = error.message?.match(/retry in ([\d\.]+)s/);
        if (match) retryAfter = Math.ceil(parseFloat(match[1]));
        return NextResponse.json({ error: "quota_hit", retryAfter }, { status: 429 });
      }

      if (error.status === 404 || error.message?.includes("404")) {
        return NextResponse.json({ error: "model_not_found", nextModelIndex: modelIndex + 1 }, { status: 404 });
      }

      throw error;
    }
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message || "Lỗi hệ thống." }, { status: 500 });
  }
}
