awsで検証する時はesbuildにして依存関係を最小化する。
```
pnpm build
```

```
zip -r ../function.zip . 
```

lamndaにアップロードする。
```
aws lambda update-function-code \
  --function-name itoi_ai_bot \
  --zip-file fileb://function.zip \
  --region us-east-1
```

ローカルでファイル実行
```
node index.js
```

API Gatewayを呼び出す。
```
curl -X POST https://v7h2aug60h.execute-api.us-east-1.amazonaws.com/webhook \
     -H "Content-Type: application/json" \
     -d '{"query": "Chat GPTについて教えてください"}'
```
