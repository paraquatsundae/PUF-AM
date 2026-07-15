import * as dotenv from "dotenv";
dotenv.config();

async function testSummaries() {
  const stationCode = 'AN001'; // Allanooka
  const startDate = '2026-04-10';
  const endDate = '2026-04-15';
  
  const url = `http://localhost:3000/api/weather/dpird/stations/summaries/daily?startDate=${startDate}&endDate=${endDate}&stationCode=${stationCode}&limit=100`;
  console.log('Fetching:', url);
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
        console.error('Status:', res.status);
        console.error(await res.text());
        return;
    }
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
  }
}
testSummaries();
