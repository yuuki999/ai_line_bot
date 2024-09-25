const crypto = require('crypto');
const line = require('@line/bot-sdk');

// Channel Secret（環境変数か直接指定）
const channelSecret = process.env.LINE_CHANNEL_SECRET || 'YOUR_CHANNEL_SECRET_HERE';

// テスト用のイベントボディ
const eventBody = {
  events: [{
    type: 'message',
    message: {
      type: 'text',
      text: 'Hello, Bot!'
    },
    replyToken: 'dummy-reply-token'
  }]
};

// イベントボディを文字列化
const eventBodyString = JSON.stringify(eventBody);

// シグネチャを生成
const signature = crypto
  .createHmac('SHA256', channelSecret)
  .update(eventBodyString)
  .digest('base64');

console.log('Event Body:', eventBodyString);
console.log('Generated Signature:', signature);

// シグネチャの検証
const isValid = line.validateSignature(eventBodyString, channelSecret, signature);
console.log('Signature is valid:', isValid);

// Lambda関数のシミュレーション
function simulateLambdaHandler(event) {
  const lambdaSignature = event.headers['x-line-signature'];
  const lambdaBody = event.body;
  
  const isLambdaValid = line.validateSignature(lambdaBody, channelSecret, lambdaSignature);
  console.log('Lambda validation result:', isLambdaValid);
  
  if (!isLambdaValid) {
    console.error('Signature validation failed in Lambda simulation');
    return { statusCode: 400, body: 'Invalid signature' };
  }
  
  return { statusCode: 200, body: 'OK' };
}

// Lambdaシミュレーションの実行
const lambdaEvent = {
  headers: { 'x-line-signature': signature },
  body: eventBodyString
};

const lambdaResult = simulateLambdaHandler(lambdaEvent);
console.log('Lambda simulation result:', lambdaResult);
