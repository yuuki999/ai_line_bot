import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist';

async function extractTextFromPDF(pdfPath) {
  try {
    // PDFファイルを読み込む
    const data = new Uint8Array(await fs.promises.readFile(pdfPath));
    
    // PDFドキュメントを読み込む
    const loadingTask = pdfjsLib.getDocument(data);
    const pdf = await loadingTask.promise;

    let fullText = '';

    // 各ページからテキストを抽出
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += `\n--- Page ${i} ---\n${pageText}\n`;
    }

    return fullText;
  } catch (error) {
    console.error('PDFの処理中にエラーが発生しました:', error.message);
    throw error;
  }
}

// メイン処理
const main = async () => {
  // コマンドライン引数からPDFファイルのパスを取得
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.error('使用方法: node pdfText.mjs <PDFファイルへのパス>');
    process.exit(1);
  }

  try {
    const text = await extractTextFromPDF(pdfPath);
    console.log(text); // 標準出力に直接書き込む
  } catch (error) {
    console.error('テキスト抽出に失敗しました:', error);
  }
};

main();
