const crypto = require('crypto');
require('dotenv').config();
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const axios = require('axios');
const { google } = require('googleapis');
const line = require('@line/bot-sdk');
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Pinecone } = require('@pinecone-database/pinecone');

// 環境変数の取得
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-sonnet-20240620-v1:0";
const BEDROCK_MAX_TOKENS = parseInt(process.env.BEDROCK_MAX_TOKENS || "1000", 10);
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
// Google Sheets API設定
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
// S3情報
const BUCKET_NAME = process.env.DOCUMENT_BUCKET_NAME;
const DOCUMENT_KEY = process.env.DOCUMENT_KEY;

// スプレットシートAPIの初期化
const auth = new google.auth.JWT(
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth });

// LINEクライアントの設定
const lineConfig = {
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: LINE_CHANNEL_SECRET
};
const lineClient = new line.Client(lineConfig);

// Bedrock clientの設定
const bedrockClient = new BedrockRuntimeClient({ 
  region: "us-east-1",
});

// Pineconeクライアントの初期化
// TODO: 将来的には、ログインユーザーごとのインデックスを参照できるようにする。
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index('quickstart');

// S3の初期化
const s3Client = new S3Client({ region: "us-east-1" });

const handler = async (event) => {
  try {
    console.log("eventの情報: ", JSON.stringify(event, null, 2));

     // Line signatureの検証
     const signature = event.headers['x-line-signature'];
     if (!verifySignature(event.body, LINE_CHANNEL_SECRET, signature)) {
       return { statusCode: 403, body: 'Invalid signature' };
     }

     const body = event.body;
     const lineBody = JSON.parse(body);
     console.log("LINEのユーザーのメッセージ: ", JSON.stringify(lineBody, null, 2));

     if (!lineBody.events || !Array.isArray(lineBody.events) || lineBody.events.length === 0) {
      console.log("イベントが空です。これは正常な動作の可能性があります。");
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "イベントが空です。処理をスキップします。" }),
      };
    }

    await Promise.all(lineBody.events.map(async (lineEvent) => {
      if (lineEvent.type === 'message' && lineEvent.message.type === 'text') {
        const userInput = lineEvent.message.text;
        console.log("ユーザーの入力:", userInput);

        const response = await sendToBedrock(userInput);
        console.log("AIの回答結果:", response);

        // LINEのユーザーに返信
        await replyToLine(lineEvent.replyToken, response);

        // ユーザー情報を取得
        const userId = lineEvent.source.userId;
        let userName = 'Unknown User';
        try {
          const profile = await lineClient.getProfile(userId);
          userName = profile.displayName;
        } catch (error) {
          console.error('LINEの質問者情報の取得に失敗しました:', error);
        }

        // Q&Aをスプレッドシートに記録
        try {
          await recordToSpreadsheet(userInput, response, userName, userId);
        } catch (error) {
          console.error('スプレッドシートへの記録中にエラーが発生しました:', error);
          if (error.response) {
            console.error('エラーレスポンス:', JSON.stringify(error.response.data, null, 2));
          }
        }
      } else {
        console.log("処理対象外のイベントタイプです:", lineEvent.type);
      }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ response: response }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};

async function sendToBedrock(userInput) {
  // 1. Pineconeでベクトル検索を実行
  const vectorSearchResults = await performVectorSearch(userInput);

  // 2. ベクトル検索結果からコンテキストを準備
  // コンテキストが存在しても、関連性が低ければAIは理解できない。
  const context = vectorSearchResults.length > 0 
    ? prepareContext(vectorSearchResults)
    : "関連する情報が見つかりませんでした。一般的な知識に基づいて回答します。";
  console.log("ベクトルのコンテキスト", context);
  
  // 3. コンテキストを含むプロンプトを構築
  const prompt = `以下のコンテキストとユーザーの質問に基づいて回答してください：

コンテキスト：
${context}

ユーザーの質問： ${userInput}

回答：`;

  // 4. Bedrockにリクエストを送信
  const command = new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-sonnet-20240620-v1:0",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: parseInt(process.env.BEDROCK_MAX_TOKENS || "1000", 10),
      messages: [
        { role: "user", content: prompt }
      ]
    }),
  });

  try {
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
      return responseBody.content[0].text;
    } else {
      console.error("Bedrockからの予期せぬレスポンス形式:", responseBody);
      throw new Error("Bedrockからの応答生成に失敗しました");
    }
  } catch (error) {
    console.error("Bedrockへのリクエスト送信中にエラーが発生:", error);
    throw error;
  }
}

// ユーザーのテキストを元に、ベクトルデータを検索
async function performVectorSearch(query, namespaceName = 'company_A', topK = 5, minScore = 0.05) {
  try {
    // クエリのエンベディングを生成
    const queryEmbedding = await getBedrockEmbedding(query);
    console.log('queryEmbedding:', queryEmbedding);

    // 特定の名前空間のインデックスを取得(企業・グループごとに分ける仕組み)
    const namespaceIndex = index.namespace(namespaceName);

    // Pineconeでベクトル検索を実行
    const searchResponse = await namespaceIndex.query({
      vector: queryEmbedding,
      topK: topK, // 類似している情報上位から何件取得するか
      includeMetadata: true,
      includeValues: false, // ベクトル値自体は必要ない場合はfalse
    });

    console.log('検索レスポンス:', JSON.stringify(searchResponse, null, 2));

    // スコアでフィルタリング
    const filteredMatches = searchResponse.matches.filter(match => match.score >= minScore);

    if (filteredMatches.length === 0) {
      console.log(`設定した類似度閾値（${minScore}）を超える検索結果が0件でした。クエリ: "${query}"`);
    } else {
      console.log(`${filteredMatches.length}件の結果が見つかりました。クエリ: "${query}"`);
    }

    return filteredMatches;
  } catch (error) { 
    console.error(`ベクトル検索中にエラーが発生しました: ${error.message}`);
    throw error;
  }
}

function prepareContext(vectorSearchResults) {
  // ベクトル検索結果から関連情報を抽出してフォーマット
  return vectorSearchResults.map(match => match.metadata.content).join('\n\n');
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
    return responseBody.embedding;
  } catch (error) {
    console.error("getBedrockEmbeddingでエラーが発生:", error);
    throw error;
  }
}

async function replyToLine(replyToken, message) {
  const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message/reply';

  const data = {
    replyToken: replyToken,
    messages: [
      {
        type: 'text',
        text: message
      }
    ]
  };

  try {
    const response = await axios.post(LINE_MESSAGING_API, data, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });

    console.log('AIによる、ユーザーへの返答: ', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message to LINE:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function recordToSpreadsheet(question, answer, userName, userId) {
  if (!sheets) {
    console.error('Google Sheets API が初期化されていません。環境変数を確認してください。');
    return;
  }

  try {
    const date = toJapanTime(new Date());
    const values = [[userName, userId, question, date, answer]];

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'シート1!A:E',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values },
    });

    console.log('記録をスプレッドシートに追加しました', response.data);
  } catch (error) {
    console.error('スプレッドシートへの記録中にエラーが発生しました:', error);
    if (error.response) {
      console.error('エラーレスポンス:', error.response.data);
    }
    if (error.config) {
      console.error('リクエスト設定:', {
        url: error.config.url,
        method: error.config.method,
        data: error.config.data,
      });
    }
    throw error;
  }
}

async function loadDocument() {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: DOCUMENT_KEY,
  });

  try {
    const response = await s3Client.send(command);
    const documentContent = await response.Body.transformToString();
    console.log("Document loaded successfully");
    return documentContent;
  } catch (error) {
    console.error("Error loading document:", error);
    throw error;
  }
}

// 日本時間に変換する関数
function toJapanTime(date) {
  return new Date(date.getTime() + (9 * 60 * 60 * 1000)).toISOString().replace('T', ' ').substr(0, 19);
}

function verifySignature(body, channelSecret, signature) {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}


module.exports = { handler };
