import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function getNews(topic: string) {
  const apiKey = process.env.SERPAPI_KEY;
  const url = `https://serpapi.com/search.json?engine=google_news&q=${encodeURIComponent(
    topic
  )}&gl=in&hl=en&api_key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  return data.news_results;
}

async function likhoPost(newsTitle: string, source: string) {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `Tum ek Telegram channel ke liye engaging Hindi/Hinglish post likhne wale expert ho.
Chhota, punchy, emoji ke saath post likho (max 60 words). End mein source mention karo.`,
      },
      {
        role: "user",
        content: `Is news pe post likho: "${newsTitle}" (Source: ${source})`,
      },
    ],
  });

  return response.choices[0].message.content;
}

async function getImage(query: string) {
  const apiKey = process.env.PIXABAY_API_KEY;
  const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(
    query
  )}&image_type=photo&per_page=3`;

  const response = await fetch(url);
  const data = await response.json();

  return data.hits?.[0]?.webformatURL;
}

async function main() {
  const news = await getNews("Sports India");

  const firstItem = news?.[0];
  const actualNews = firstItem?.stories ? firstItem.stories[0] : firstItem;

  console.log("News mili:", actualNews.title);

  const post = await likhoPost(actualNews.title, actualNews.source.name);

  console.log("\n--- Groq ne likha ---");
  console.log(post);

  const imageUrl = await getImage("sports India commonwealth games");
  console.log("\n--- Pixabay Image URL ---");
  console.log(imageUrl);
}

main();