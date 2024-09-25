require('dotenv').config();
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

// 環境変数の取得
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-sonnet-20240620-v1:0";
const BEDROCK_MAX_TOKENS = parseInt(process.env.BEDROCK_MAX_TOKENS || "1000", 10);

// Bedrock clientの設定
const bedrockClient = new BedrockRuntimeClient({ 
  region: "us-east-1",
});

const handler = async (event) => {
  try {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    let userInput;
    if (typeof event.body === 'string') {
      userInput = JSON.parse(event.body).query;
    } else if (typeof event.body === 'object') {
      userInput = event.body.query;
    } else {
      userInput = event.query; // API Gateway経由の場合
    }
    console.log("ユーザーの入力:", userInput);
    if (!userInput) {
      throw new Error("ユーザーの入力を取得できませんでした。");
    }

    const response = await sendToBedrock(userInput);
    console.log("AIの回答結果:", response);

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
  const command = new InvokeModelCommand({
    modelId: BEDROCK_MODEL_ID,
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: BEDROCK_MAX_TOKENS,
      messages: [
        { role: "user", content: userInput }
      ]
    }),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  
  if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
    return responseBody.content[0].text;
  } else {
    console.error("Unexpected response format from Bedrock:", responseBody);
    throw new Error("Failed to generate response from Bedrock");
  }
}

module.exports = { handler };

// ローカルテスト用
if (require.main === module) {
  const crypto = require('crypto');
  
  // 実際のチャネルシークレットを使用（環境変数から読み込むか、直接指定）
  const channelSecret = process.env.LINE_CHANNEL_SECRET || 'your_channel_secret_here';

  const eventBody = JSON.stringify({
    events: [{
      type: 'message',
      message: {
        type: 'text',
        text: 'こんにちは'
      },
      replyToken: 'dummy_reply_token'
    }]
  });

  // 正しいシグネチャを生成
  const signature = crypto
    .createHmac('SHA256', channelSecret)
    .update(eventBody)
    .digest('base64');

  const testEvent = {
    headers: {
      'x-line-signature': signature
    },
    body: eventBody
  };

  handler(testEvent)
    .then(result => console.log('Result:', result))
    .catch(error => console.error('Error:', error));
}

module.exports = { handler };
