import fetch from 'node-fetch';

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/weather/dpird/stations/nearby?latitude=-31.95&longitude=115.86&limit=3');
    console.log(res.status);
    const text = await res.text();
    console.log(text.substring(0, 100));
  } catch (e) {
    console.error(e);
  }
}

test();
