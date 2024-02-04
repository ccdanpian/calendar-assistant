// 使用ES6模块导入方式导入moment-timezone和express
import moment from 'moment-timezone';
import express, { Request, Response } from 'express';

// 初始化express应用
const app = express();

// 使用express内置的中间件来解析JSON请求体
app.use(express.json());

// 设置POST路由来处理时间请求
app.post('/api/time_assistant', async (req: Request, res: Response) => {
  try {
    // 获取请求参数
    const args = req.body;

    // 检查时区参数是否存在，如果不存在，则使用北京时间时区作为默认值
    const timezone = args.timezone || 'Asia/Shanghai';

    // 使用moment-timezone获取当前时间和星期几，避免重复调用moment().tz(timezone)
    const currentMoment = moment().tz(timezone);
    const currentTime = currentMoment.format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    const dayOfWeek = currentMoment.format('dddd');

    // 构造响应数据
    const responseData = {
      currentTime: currentTime,
      dayOfWeek: dayOfWeek,
    };

    // 发送响应
    res.json(responseData);
  } catch {
    // 如果有错误，返回错误响应
    res.status(500).json({ error: 'Internal server error' });
  }
});

