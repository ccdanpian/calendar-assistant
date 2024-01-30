export async function getCalendarKey(req: any): Promise<string> {

  const setting_key = req.rawHeaders;

  const calendarKeyHeader = setting_key.find((header: string | string[]) => {
    return header.includes('CALENDAR_KEY');
  });

  if (calendarKeyHeader) {
    const calendarKeyObject = JSON.parse(calendarKeyHeader);
    const calendarKey = calendarKeyObject.CALENDAR_KEY;
    console.log(calendarKey); 
    return calendarKey;
  } else {
    console.log('未找到日历密钥');
    return '';
  }
}

export default getCalendarKey;
