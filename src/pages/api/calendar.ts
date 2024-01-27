import fetch from 'node-fetch';
import { OAuth2Client } from 'google-auth-library';
import { sessionManager } from './sessionManager';
import { runner } from './_utils'; // 假设这是处理日历操作的函数

// const express = require('express');

import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

// Google 相关的环境变量
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
const googleScopes = process.env.GOOGLE_SCOPES;

// 创建OAuth2Client实例
const authClient = new OAuth2Client(googleClientId, googleClientSecret, googleRedirectUri);

function buildAuthUrl() {
  const authEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';

  // 确保所有环境变量都有值，或提供默认值
  const clientId = googleClientId || 'default-client-id';
  const redirectUri = googleRedirectUri || 'default-redirect-uri';
  const scopes = googleScopes || 'default-scopes';

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
      // ... googleAuth.ts 中的 GET 请求处理逻辑 ...
      //检查是否是OAuth回调请求（通常带有授权码）
      const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const authorizationCode = urlParams.get('code');

      if (authorizationCode) {
        // 使用授权码换取访问令牌
        const { tokens } = await authClient.getToken({ code: authorizationCode, redirect_uri: googleRedirectUri });
        authClient.setCredentials(tokens);

        // 存储用户会话
        const userId = '12345'; // 这里需要逻辑来确定用户ID
        const accessToken = tokens.access_token || 'no-access-token'; // 提供默认值或处理为错误
        const refreshToken = tokens.refresh_token || 'no-refresh-token'; // 提供默认值或处理为错误

        const expiresIn = tokens.expiry_date || 0; // 如果expiry_date为null或undefined，则使用0
        // 或者，如果您不想在null时赋值，可以使用条件运算符
        // const expiresIn = tokens.expiry_date != null ? tokens.expiry_date : undefined;

        sessionManager.storeSession(userId, {
          accessToken: accessToken,
          createdAt: new Date(),
          expiresIn: expiresIn, // 使用处理过的值
          refreshToken: refreshToken
        });

        // 返回成功消息
        res.json({ message: 'Authentication successful' });
        return;
      }

      // 如果没有授权码，返回错误
      res.status(400).json({ error: 'Authorization code missing' });
      return;

    } else if (req.path === '/api/calendar' && req.method === 'POST' && req.body.authorizationCode) {
      // ... googleAuth.ts 中的 POST 请求处理逻辑 ...
      // 处理令牌刷新请求（POST）
      const userId = '12345'; // 从请求中获取用户ID
      const session = sessionManager.getSession(userId);

      if (session && session.refreshToken) {
        // 设置先前的令牌信息
        authClient.setCredentials({
          refresh_token: session.refreshToken
        });
      
        // 尝试刷新访问令牌
        try {
          const { credentials } = await authClient.refreshAccessToken();

          const accessToken = credentials.access_token || 'default-access-token'; // 提供默认值或处理为错误
          const refreshToken = credentials.refresh_token || 'default-refresh-token'; // 提供默认值或处理为错误
          const expiresIn = credentials.expiry_date || 0; // 如果expiry_date为null或undefined，则使用0

          sessionManager.storeSession(userId, {
            accessToken: accessToken,
            createdAt: new Date(),
            expiresIn: expiresIn,
            refreshToken: refreshToken
          });

          res.json({ accessToken: accessToken });

          return;
        } catch (error) {
          console.error('Error refreshing token:', error);
          res.status(401).json({ error: 'Failed to refresh token' });
          return;
        }
      }
      
      
      res.status(400).json({ error: 'Refresh token missing or invalid' });
      return;
    } else if (req.method === 'POST') {
      // ... 原 app.ts 中的 POST 请求处理逻辑 ...
      const rawArgs = req.body;
      const args = JSON.parse(rawArgs);

      const userId = "12345";

      let session = sessionManager.getSession(userId);

      console.log(`111111`);

      if (!session) {
        // 会话不存在，生成跳转认证URL
        console.log(`222222`);
        const authUrl = buildAuthUrl(); 
        console.log(`333333`, authUrl);
        res.json({ authUrl: authUrl });
        return;
      }

      if (!session || !session.accessToken || new Date() > new Date(session.createdAt.getTime() + ((session.expiresIn || 0) * 1000))) {
        // ... 其他代码 ...
        if (session && session.refreshToken) {
          try {
            // 使用Google Auth Library刷新令牌
            const refreshResponse = await fetch('http://localhost:3400/api/calendar', { //这个URL应该指向您的googleAuth路由
              body: JSON.stringify({ refreshToken: session.refreshToken }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            });

            if (!refreshResponse.ok) {
              throw new Error('Failed to refresh token');
            }

            const refreshedTokens = await refreshResponse.json();
            sessionManager.storeSession(userId, {
              accessToken: refreshedTokens.accessToken,
              createdAt: new Date(),
              expiresIn: refreshedTokens.expiresIn,
              refreshToken: refreshedTokens.refreshToken || session.refreshToken           
            });

            session = sessionManager.getSession(userId); //重新获取更新后的会话
          } catch (error) {
            console.error('Error refreshing token:', error);
            res.status(401).json({ authUrl: buildAuthUrl() });
            return;
          }
        } else {
          const authUrl = buildAuthUrl();
          res.status(401).json({ authUrl: authUrl });
          return;
        }
      }

      const result = await runner(args, userId);  //执行日历操作
      res.status(200).json(result);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error);
      res.status(500).json({ error: error.message, stack: error.stack });
    } else {
      // 处理其他类型的错误或未知错误
      console.error('Unknown error', error);
      res.status(500).json({ error: "An unknown error occurred" });
    }
  }  
});


module.exports = app;
