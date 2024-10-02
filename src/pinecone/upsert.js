import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';

dotenv.config();

// Pineconeクライアントの初期化
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

// インデックスの選択
const index = pc.index('quickstart');

// upsertする関数を定義
async function upsertVectors() {
  try {
    // namespaceがテーブルの概念にちかい。
    const upsertResponse = await index.namespace('ns1').upsert([
      {
        id: 'vec1', 
        values: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
        metadata: { genre: 'drama' }
      },
      {
        id: 'vec2', 
        values: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
        metadata: { genre: 'action' }
      },
      {
        id: 'vec3', 
        values: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
        metadata: { genre: 'drama' }
      },
      {
        id: 'vec4', 
        values: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
        metadata: { genre: 'action' }
      }
    ]);

    console.log('Vectors upserted successfully:', upsertResponse);
  } catch (error) {
    console.error('Error upserting vectors:', error);
  }
}

// 関数の実行
upsertVectors();
