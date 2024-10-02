import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

async function main() {
  const indexName = 'quickstart';
  const dimension = 1024;  // bedrockの出力次元数に合わせる

  try {
    const indexList = await pc.listIndexes();
    
    if (!indexList.indexes.some(index => index.name === indexName)) {
      await pc.createIndex({
        name: indexName,
        dimension: dimension,
        metric: 'cosine',
        spec: { 
          serverless: { 
            cloud: 'aws', 
            region: 'us-east-1' 
          }
        } 
      });
      console.log(`Index ${indexName} created with dimension ${dimension}.`);
    } else {
      console.log(`Index ${indexName} already exists.`);
    }

    let indexStatus;
    do {
      indexStatus = await pc.describeIndex(indexName);
      if (indexStatus.status.state !== 'Ready') {
        console.log(`Waiting for index to be ready. Current state: ${indexStatus.status.state}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } while (indexStatus.status.state !== 'Ready');

    const index = pc.index(indexName);
    console.log(`Index ${indexName} is ready.`);
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
}

main();
