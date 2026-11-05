import { handler } from '../apps/v2-dag-lambda/src/handler';
import { LocalDiskS3Client } from './run-local-v2-dag-lambda-parity';
import type { SendMessageCommand } from '@aws-sdk/client-sqs';

const send = (message: unknown) => new Promise<void>((resolve, reject) => {
  if (!process.send) { reject(new Error('Local policy worker requires IPC.')); return; }
  process.send(message, error => error ? reject(error) : resolve());
});
process.once('message', async (input: {payload: unknown; storageRoot: string; workspaceRoot: string}) => {
  try {
    const record = input.payload as {workerLane?: string; targetEnvironment?: string};
    if (record.workerLane !== 'policy_evidence' || record.targetEnvironment !== 'local') throw new Error('Only local policy work may use this entrypoint.');
    const s3 = new LocalDiskS3Client(input.storageRoot);
    const result = await handler(input.payload, {s3Client: s3, s3GetClient: s3, workspaceRoot: input.workspaceRoot,
      sqsClient: {send: async (command: SendMessageCommand) => {
        await send({type:'sqs',body:String(command.input.MessageBody ?? '')}); return {$metadata:{}};
      }}});
    await send({type:'result',result});
    process.exit(0);
  } catch (error) {
    await send({type:'error',error:error instanceof Error ? error.message : String(error)}).catch(()=>{});
    process.exit(1);
  }
});
