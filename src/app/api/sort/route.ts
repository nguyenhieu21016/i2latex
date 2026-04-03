import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { thumbnails } = await req.json();

    if (!thumbnails || !Array.isArray(thumbnails) || thumbnails.length <= 1) {
      return NextResponse.json({ order: [0] }); // No need to sort 1 or 0 images
    }

    // Use a fast model for sorting to save costs/time
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `
      Bạn là chuyên gia sắp xếp tài liệu. Tôi sẽ cung cấp cho bạn danh sách các ảnh thu nhỏ (thumbnail) của các trang tài liệu/đề thi.
      Nhiệm vụ của bạn: 
      1. Phân tích nội dung văn bản, số trang, và thứ tự các câu hỏi (ví dụ: Câu 10 phải sau Câu 9).
      2. Xác định thứ tự logic đúng của các trang này từ đầu đến cuối.
      3. Chỉ trả về một mảng JSON chứa các chỉ số (index) theo thứ tự đúng. 
      Ví dụ: Nếu ảnh thứ 3 là trang 1, ảnh thứ 1 là trang 2, ảnh thứ 2 là trang 3, hãy trả về [2, 0, 1].
      
      CHỈ TRẢ VỀ MẢNG JSON, KHÔNG GIẢI THÍCH GÌ THÊM.
    `;

    const imageParts = thumbnails.map((base64: string) => ({
      inlineData: {
        data: base64.split(",")[1],
        mimeType: "image/jpeg",
      },
    }));

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text().trim();
    
    // Extract array from the AI response
    try {
      const match = text.match(/\[[\d,\s]+\]/);
      const order = match ? JSON.parse(match[0]) : Array.from({ length: thumbnails.length }, (_, i) => i);
      return NextResponse.json({ order });
    } catch (e) {
      return NextResponse.json({ order: Array.from({ length: thumbnails.length }, (_, i) => i) });
    }
  } catch (error: any) {
    console.error("Sorting Error:", error);
    return NextResponse.json({ error: "Không thể sắp xếp tự động." }, { status: 500 });
  }
}
