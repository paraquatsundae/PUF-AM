import * as dotenv from "dotenv";
dotenv.config();

async function testStations() {
  const apiKey = process.env.DPIRD_API_KEY || process.env.VITE_DPIRD_API_KEY;
  const headers = { 'api-key': apiKey, 'Accept': 'application/json' };
  
  const url = 'http://localhost:3000/api/weather/dpird/stations?limit=500';
  const res = await fetch(url);
  const data = await res.json();
  console.log(data);
}
testStations();
