import dotenv from 'dotenv';
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { Pinecone } from '@pinecone-database/pinecone';
import crypto from 'crypto';

dotenv.config();

// AWSの認証情報を環境変数から取得
const bedrockClient = new BedrockRuntimeClient({ 
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index('quickstart');

function generateUniqueId() {
  return crypto.randomUUID();
}

async function processAndStoreDocument(document, namespace) {
  // 1. ドキュメントを分割
  const chunks = splitDocument(document);

  for (const chunk of chunks) {
    // 2. Bedrockを使用してエンベディングを生成
    const embedding = await getBedrockEmbedding(chunk);

    // 3. Pineconeに保存
    await index.namespace(namespace).upsert([{
      id: generateUniqueId(), // ユニークIDを生成する関数
      values: embedding,
      metadata: {
        content: chunk,
        // 他のメタデータ（ドキュメント名、タイムスタンプなど）
      }
    }]);
  }
}

function splitDocument(document) {
  // 改行で分割しています。必要に応じて調整
  return document.split('\n').filter(chunk => chunk.trim() !== '');
}

async function getBedrockEmbedding(text) {
  const params = {
    modelId: "amazon.titan-embed-text-v2:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      inputText: text
    }),
  };

  try {
    const command = new InvokeModelCommand(params);
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    console.log("ベッドロックのレスポンス:", responseBody);
    
    return responseBody.embedding;
  } catch (error) {
    console.error("Error in getBedrockEmbedding:", error);
    console.error("Request params:", JSON.stringify(params, null, 2));
    throw error;
  }
}

// 使用例
const document = "Your document content here...";
const namespace = "company_A";
await processAndStoreDocument(document, namespace);
