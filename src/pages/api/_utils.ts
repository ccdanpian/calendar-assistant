import { google } from 'googleapis';

import { sessionManager } from './dynamoDBSessionManagerCrypto';

// 创建 Google Calendar API 客户端
function getGoogleCalendarClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ auth, version: 'v3' });
}


// 
function convertToRunnerArgs(data: any) {

  // 确保每个属性都正确访问
  const action = data.action;
  const subject = data.eventSummary;
  const description = data.eventDetails;
  const startDateTime = data['startDateTime'];
  const endDateTime = data['endDateTime'];
  const eventId = data.eventId;

  // console.log(`Extracted data: action=${action}, subject=${subject}, description=${description}, startDateTime=${startDateTime}, endDateTime=${endDateTime}, eventId=${eventId}`);

  return {
    action: action,    
    description: description,
    end: {
      dateTime: endDateTime ? endDateTime : undefined,
      timeZone: 'Asia/Shanghai',
    },
    eventId: eventId,
    start: {
      dateTime: startDateTime ? startDateTime : undefined,
      timeZone: 'Asia/Shanghai',    
    },  
    subject: subject,
  };
}

async function addEvent(client: any, args: any) {
  let formattedTimeStart = ''; // 默认时间
  let formattedTimeEnd = ''; // 默认时间

  formattedTimeStart = (args.start) ? args.start : new Date().toISOString();
  formattedTimeEnd = (args.end) ? args.end : (() => {
    const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return twoHoursLater.toISOString();
  })();

  const event = {
    description: args.description,
    end: formattedTimeEnd,
    start: formattedTimeStart,
    summary: args.subject,    
  };

  const response = await client.events.insert({
    calendarId: 'primary',
    resource: event,
  });
  return response.data;
}

async function listEvents(client: any, searchParams: any) {
  const {q, timeMax, timeMin} = searchParams;

  let formattedTimeMin = ''; // 默认时间
  let formattedTimeMax = ''; // 默认时间

  formattedTimeMin = (timeMin && timeMin.dateTime) ? timeMin.dateTime : new Date().toISOString();
  formattedTimeMax = (timeMax && timeMax.dateTime) ? timeMax.dateTime : (() => {
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    return oneYearLater.toISOString();
  })();

  console.log(`Extracted data: action=list, startDateTime=${formattedTimeMin}, endDateTime=${formattedTimeMax}`);

  try {
    const events = await client.events.list({
      calendarId: 'primary',
      q: q,
      timeMax: formattedTimeMax,
      timeMin: formattedTimeMin,
    });
    return events.data.items.length === 0 ? '没有找到任何日程' : events.data.items;
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
}

async function updateEvent(client: any, args: any) {
  const { eventId, updateFields } = args; // updateFields 包含要更新的字段

  if (!eventId || !updateFields) {
    throw new Error('Event ID and update fields are required');
  }

  try {
    const updatedEvent = await client.events.update({
      calendarId: 'primary',
      eventId: eventId,
      resource: updateFields
    });
    return updatedEvent.data;
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
}


async function deleteEvent(client: any, eventId: string) {
  if (!eventId) {
    console.error('请提供日程标题或者ID');
    return '请提供日程标题或者ID';
  }

  try {
    await client.events.delete({
      calendarId: 'primary',
      eventId: eventId
    });
    return { message: '日程已成功删除' };
  } catch (error) {
    console.error('删除日程时出错:', error);
    return '删除失败，请重试，重试的时候请提供日程标题或者ID';
  }
}

// Runner
export async function runner(rawArgs: any, userId: string) {
  try {
    const session = await sessionManager.getSession(userId);
    if (!session || !session.accessToken) {
      throw new Error('No valid session found');
    }
    const accessToken = session.accessToken;
    const client = getGoogleCalendarClient(accessToken);

    const args = convertToRunnerArgs(rawArgs); 
    console.log(`Executing action: ${args.action}`, args);

    switch (args.action) {
      case 'add': {
        return await addEvent(client, args);
      }
      case 'list': {
        // 假设 args 中包含 timeMin, timeMax 和 q
        const searchParams = {    
          q: args.subject,      
          timeMax: args.end,
          timeMin: args.start,          
        };
        return await listEvents(client, searchParams);
      }
      case 'update': {
        return await updateEvent(client, args); // 假设 updateEvent 是定义好的函数
      }
      case 'delete': {
        return await deleteEvent(client, args.eventId); // 假设 deleteEvent 是定义好的函数
      }
      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Error in runner:', error);
    throw error;
  }
}

export default runner;
