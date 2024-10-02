
# エラーが発生したら即座に終了
set -e

# 関数名とリージョンを変数として定義
FUNCTION_NAME="itoi_ai_bot"
REGION="us-east-1"
PROFILE="itoi"

echo "Building the project..."
pnpm build

echo "Creating deployment package..."
cd dist
zip -r ../function.zip .
cd ..

echo "Deploying to Lambda..."
aws lambda update-function-code \
  --function-name $FUNCTION_NAME \
  --zip-file fileb://function.zip \
  --region $REGION \
  --profile $PROFILE

echo "Deployment completed successfully!"

# デプロイ後にzipファイルを削除（オプション）
rm function.zip
