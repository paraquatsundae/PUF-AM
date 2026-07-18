import * as dotenv from "dotenv";

dotenv.config();

async function test() {
  const apiKey = process.env.DPIRD_API_KEY || process.env.VITE_DPIRD_API_KEY;
  if (!apiKey) {
    console.log("No API key");
    return;
  }
  const url = `https://api.agric.wa.gov.au/v2/weather/stations/summaries/daily?startDate=2026-03-20&endDate=2026-03-25&stationCode=BA&offset=0&limit=10&includeClosed=false`;
  const response = await fetch(url, {
    headers: {
      'api-key': apiKey,
      'Accept': 'application/json'
    }
  });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
