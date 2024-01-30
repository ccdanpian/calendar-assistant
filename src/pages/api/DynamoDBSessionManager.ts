import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

class DynamoDBSessionManager {
    private ddbDocClient: DynamoDBDocumentClient;
    private tableName: string;

    constructor() {
        // 使用环境变量配置AWS
        const ddbClient = new DynamoDBClient({
            region: process.env.AWS_REGION, // 从环境变量获取AWS区域
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID, // 从环境变量获取访问密钥ID
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY // 从环境变量获取密钥
            }
        });

        this.ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
        this.tableName = process.env.DYNAMODB_SESSION_TABLE; // 从环境变量获取DynamoDB表名
    }

    async storeSession(userId: string, sessionData: any) {
        const ttl = Math.floor(Date.now() / 1000) + 3600; // 设置会话过期时间为1小时
        const params = {
            TableName: this.tableName,
            Item: {
                UserId: userId,
                SessionData: sessionData,
                TTL: ttl // 添加TTL字段
            }
        };

        try {
            await this.ddbDocClient.send(new PutCommand(params));
            return true;
        } catch (error) {
            console.error('Error storing session:', error);
            return false;
        }
    }

    async getSession(userId: string) {
        const params = {
            TableName: this.tableName,
            Key: { UserId: userId }
        };

        try {
            const result = await this.ddbDocClient.send(new GetCommand(params));
            return result.Item ? result.Item.SessionData : null;
        } catch (error) {
            console.error('Error retrieving session:', error);
            return null;
        }
    }

    async deleteSession(userId: string) {
        const params = {
            TableName: this.tableName,
            Key: { UserId: userId }
        };

        try {
            await this.ddbDocClient.send(new DeleteCommand(params));
            return true;
        } catch (error) {
            console.error('Error deleting session:', error);
            return false;
        }
    }
}

export default DynamoDBSessionManager;
