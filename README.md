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


node index.js
