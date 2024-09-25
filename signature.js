const crypto = require('crypto');
require('dotenv').config();

// Channel Secret を環境変数から取得（または直接指定）
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
console.log('\nFor use in tests:');
console.log(`"x-line-signature": "${signature}"`);



// このシグネチャ生成は間違っている?
