import fetch from 'node-fetch';

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/weather/dpird/stations/summaries/daily?startDate=2026-03-20&endDate=2026-03-25&stationCode=MA002&offset=0&limit=100&includeClosed=false');
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Body:', text.substring(0, 200));
  } catch (err) {
    console.error('Error:', err);
  }
}
test();

