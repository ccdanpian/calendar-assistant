// import fetch from 'node-fetch';
import { OAuth2Client } from 'google-auth-library';
import axios, { AxiosError } from 'axios';

// import { sessionManager } from './sessionManager';
import { sessionManager } from './dynamoDBSessionManagerCrypto';
import { runner } from './_utils'; // 假设这是处理日历操作的函数

import { getCalendarKey } from './_types';

import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

// Google 相关的环境变量
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
const googleScopes = process.env.GOOGLE_SCOPES;
const expiresIn_s: number = Number.parseInt(process.env.EXPIRES_IN || '1800', 10);

let calendarUserId: string = '';

// 创建OAuth2Client实例
const authClient = new OAuth2Client(googleClientId, googleClientSecret, googleRedirectUri);

// 使用 Google OAuth2Client 解码 ID 令牌
async function decodeIdToken(idToken: string): Promise<any> {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    audience: googleClientId,  // 指定您的 Google OAuth 2.0 客户端 ID
    idToken: idToken,    
  });
  return ticket.getPayload();
}

// 从 OAuth 令牌中提取用户的Email
async function extractUserIdFromOAuth(tokens: any): Promise<string> {
  if (tokens && tokens.id_token) {
    try {
      const decodedIdToken = await decodeIdToken(tokens.id_token);
      return decodedIdToken.email; // 使用解码后的 ID 令牌中的电子邮件地址
    } catch (error) {
      const message = (error as Error).message;
      console.error(message);
      throw new Error('Error decoding ID token: ' + message);
    }    
  } else {
    throw new Error('No ID token found in OAuth tokens');
  }
}

// 构建授权链接
function buildAuthUrl() {
  const authEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';

  // 确保所有环境变量都有值，或提供默认值
  const clientId = googleClientId || 'default-client-id';
  const redirectUri = googleRedirectUri || 'default-redirect-uri';
  const scopes = googleScopes || 'https://www.googleapis.com/auth/calendar openid email';

  const queryParams = new URLSearchParams({
    access_type: 'offline', 
    client_id: clientId,
    prompt: 'consent',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes
  });

  return `${authEndpoint}?${queryParams.toString()}`;
}


app.use(async (req: Request, res: Response) => {  
  try {
    if (req.path === '/api/calendar' && req.method === 'GET') {
      //检查是否是OAuth回调请求（通常带有授权码）
      const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const authorizationCode = urlParams.get('code');

      if (authorizationCode) {
        // 使用授权码换取访问令牌
        const { tokens } = await authClient.getToken({ code: authorizationCode, redirect_uri: googleRedirectUri });
        authClient.setCredentials(tokens);

        // 存储用户会话
        // 从 OAuth 提供的信息中获取用户身份
        const userEmail = await extractUserIdFromOAuth(tokens);// 这里需要实现 extractUserIdFromOAuth 函数

        // console.log(`calendar_user_id`, calendarUserId);
        const userId = calendarUserId;
        const accessToken = tokens.access_token || 'no-access-token'; // 提供默认值或处理为错误
        const refreshToken = tokens.refresh_token || 'no-refresh-token'; // 提供默认值或处理为错误

        // const expiresIn = expiresIn; //设置为30分钟

        await sessionManager.storeSession(userId, accessToken, new Date(), expiresIn_s, refreshToken, userEmail);


        // 返回成功消息
        // res.json({ message: 'Authentication successful' });
        res.redirect('/auth_s.html');
        return;
      }

      // 如果没有授权码，返回错误
      // res.status(400).json({ error: 'Authorization code missing' });
      res.redirect('/auth_f.html');
      return;

    } else if (req.method === 'POST') {
      // 获取用户设定的key，作为userId
      calendarUserId = await getCalendarKey(req);    
      const userId = calendarUserId;      
 
      let session = await sessionManager.getSession(userId);
      // console.log(`session:`, await session);

      if (!session) {
        // 会话不存在，生成跳转认证URL
        console.log(`会话不存在, 生成跳转认证URL`);
        const authUrl = buildAuthUrl();  
        res.json({ authUrl: authUrl });
        return;
      }

      if (!session || !session.accessToken || new Date() > new Date(session.createdAt.getTime() + ((session.expiresIn || 0) * 1000))) {
        // ... 其他代码 ...
        // console.log(`333333, refreshToken:`, session.refreshToken);
        if (session && session.refreshToken) {
          try {
            // console.log(`try refesh:`, session.refreshToken);
            // 使用 Google Auth Library 刷新令牌
            authClient.setCredentials({
              refresh_token: session.refreshToken
            });
        
            const { credentials } = await authClient.refreshAccessToken();
        
            // 更新会话信息
            const accessToken = credentials.access_token || 'default-access-token'; // 提供默认值或处理为错误,
            const refreshToken = credentials.refresh_token || session.refreshToken;

            // 从 OAuth 提供的信息中获取用户身份
            const userEmail = session.userEmail;// 这里需要实现 extractUserIdFromOAuth 函数

            await sessionManager.storeSession(userId, accessToken, new Date(), expiresIn_s, refreshToken, userEmail);
        
            // 继续处理原始请求
          } catch (error: unknown) {
            // 使用类型断言来处理
            const axiosError = error as { response: { data: { error: string } } | undefined };
            console.error('000000000000############', error);
          
            if (axiosError.response && (axiosError.response.data.error === 'Invalid Credentials' || axiosError.response.data.error === 'invalid_grant')) {
              // 对'invalid_grant'错误特殊处理
              console.log('000000000*****************');
              console.error('000000Token has been expired or revoked. Please re-authenticate using the following URL:', error);
              const authUrl = buildAuthUrl();
              res.json({ authUrl: authUrl });
            } else if (axiosError.response) {
              // 处理其他类型的HTTP响应错误
              console.log('0000000000000088888888888888888888');
              console.error('Error refreshing token:', axiosError.response.data);
              res.status(401).json({ error: 'Failed to refresh token' });
              const authUrl = buildAuthUrl();
              res.json({ authUrl: authUrl });
            } else if (error instanceof Error) {
              // 处理标准错误对象
              console.log('0000000000000000000%%%%%%%%%%%%%%%%%%%%%');
              console.error('Error refreshing token:', error.message);
              res.status(401).json({ error: error.message });
            } else {
              // 处理未知类型错误
              console.error('0000000000000000An unknown error occurred while refreshing token:', error);
              res.status(401).json({ error: 'An unknown error occurred while refreshing token' });
            }
            return;
          }
        } else {
          // 如果没有有效的刷新令牌，需要重新授权
          console.error('No valid refresh token. Requiring re-authentication');
          const authUrl = buildAuthUrl();  // 重新获取授权的URL
          res.json({ authUrl: authUrl });
          return;
        }
      }

      const rawArgs = req.body;
      const args = JSON.parse(rawArgs);

      const result = await runner(args, userId);  //执行日历操作
      res.status(200).json(result);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: unknown) {
    console.error('An error occurred:', error);
    const e = error as any;  // 使用 'any'类型，这样就不需要特定的类型提示了。
  
    if (e && e.response && e.response.data && e.response.data.error) {
      // 提取错误信息并处理它
      const errors = e.response.data.error.errors;
      
      if (errors && Array.isArray(errors)) {
        errors.forEach((errorDetail) => {
          if (errorDetail.reason === 'authError' && errorDetail.message === 'Invalid Credentials') {
            // 这里处理 'Invalid Credentials' 错误
            console.error('Invalid Credentials: Please check the OAuth credentials and ensure they are correct.');
            
            // 在这里添加用于刷新token或重新授权的逻辑
            const authUrl = buildAuthUrl(); // 重新获取授权的URL
            // Create an object with authUrl and a message
            const responseObject = {
              authUrl: authUrl,
              message: "你需要重新授权。请点击以下链接完成授权过程。" // 你想要提供的提示信息
            };

            // Send the response object as JSON
            res.json(responseObject);
          }
        });
      }
    } else {
      // 处理未知或不是来自Gaxios的错误
      console.error('An unknown error occurred that is not related to Gaxios:', error);
    }
    // 添加你的错误响应逻辑，例如设定HTTP状态码
    return;
  }
});

module.exports = app;
