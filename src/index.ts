import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";
import express from "express";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const bot = new TelegramBot(token, { polling: true });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_ANON_KEY as string
);

console.log("Bot start ho gaya hai... Ab bot ko koi bhi message bhejo Telegram par!");

const CHANNELS: Record<string, string> = {
  "jobs alert": process.env.TELEGRAM_CHANNEL_ID as string,
};

const pendingPosts: Record<number, { post: string; headline: string; channelId: string; topic: string }> = {};
const lastQuizContext: Record<number, { type: string; exam?: string }> = {};

const VACANCY_SITES = ["sarkariresult.com", "freejobalert.com", "employmentnews.gov.in", "sarkarinaukriblog.com", "rojgarresult.com"];

async function saveMessage(chatId: number, role: string, message: string) {
  await supabase.from("conversations").insert({ chat_id: chatId, role, message });
}

async function getRecentHistory(chatId: number) {
  const fourDaysAgo = new Date();
  fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

  const { data, error } = await supabase
    .from("conversations")
    .select("role, message, created_at")
    .eq("chat_id", chatId)
    .gte("created_at", fourDaysAgo.toISOString())
    .order("created_at", { ascending: true })
    .limit(40);

  if (error) return [];
  return data || [];
}

async function forgetHistory(chatId: number) {
  await supabase.from("conversations").delete().eq("chat_id", chatId);
}

async function askForJSON(systemPrompt: string, userPrompt: string, maxRetries = 2): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt + "\n\nBAHUT ZAROORI: Sirf VALID JSON reply karo. Har string properly quoted honi chahiye. Koi markdown (```), koi extra text nahi." },
          { role: "user", content: userPrompt },
        ],
      });

      const raw = response.choices[0].message.content || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.log(`JSON parse attempt ${attempt + 1} failed:`, e);
      if (attempt === maxRetries) return null;
    }
  }
  return null;
}

async function samajhoMessage(userMessage: string, history: any[], hasPending: boolean, lastQuiz: any) {
  const historyText = history.map((h) => `${h.role === "user" ? "User" : "Bot"}: ${h.message}`).join("\n");
  const now = new Date().toString();

  const lastQuizInfo = lastQuiz
    ? `Pichla quiz type: "${lastQuiz.type}"${lastQuiz.exam ? `, exam: "${lastQuiz.exam}"` : ""}`
    : "Koi pichla quiz nahi hai.";

  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      {
        role: "system",
        content: `Tum ek intelligent assistant ho jo Hinglish/Hindi mein poori baat ka MATLAB samajhta hai, sirf keywords nahi pakadta.

Abhi ka time: ${now}
Kya koi post pehle se ready/pending hai: ${hasPending ? "HAAN" : "NAHI"}
${lastQuizInfo}

BAHUT ZAROORI: Agar user ka message CHHOTA hai (jaise sirf "Hindi subject ke"), ye pichle context ka continuation hai. Agar pichla quiz type "pyq_quiz" tha, aur ab user sirf naya subject de raha hai, USI exam ke saath "pyq_quiz" hi rakho.

Reply SIRF JSON format mein do (exact fields, koi extra field mat add karo):
{"action": "pyq_quiz", "exam": "...", "subject": "...", "count": <number>}
YA
{"action": "current_affairs_quiz", "count": <number>}
YA
{"action": "quiz_request", "subject": "...", "count": <number>}
YA
{"action": "post_action", "topic": "...", "destination": "channel" ya "personal", "delaySeconds": <number>}
YA
{"action": "prepare_post", "topic": "..."}
YA
{"action": "forget_context"}
YA
{"action": "chat"}

Rules:
- "current_affairs_quiz" tabhi jab "current affairs", "latest news ke question" bola gaya ho.
- "pyq_quiz" jab kisi exam ka naam liya gaya ho, ya pichla context pyq_quiz tha.
- "quiz_request" general subject quiz jab koi exam context na ho.
- post_action: topic na diya ho aur pending hai to topic empty rakho. destination "personal" sirf "mujhe/mere paas bhejo" bolne par.

Pichli baatein:
${historyText || "(koi purani baat nahi hai)"}`,
      },
      { role: "user", content: userMessage },
    ],
  });

  const raw = response.choices[0].message.content || "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

async function chatReply(userMessage: string, history: any[]) {
  const historyText = history.map((h) => `${h.role === "user" ? "User" : "Bot"}: ${h.message}`).join("\n");

  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      {
        role: "system",
        content: `Tum ek helpful Telegram assistant ho jo HAMESHA Hinglish (Roman letters) mein reply deta hai. KABHI Devanagari script use mat karo. Chhota reply do (max 2-3 lines).

ZAROORI - NAAM YAAD RAKHNA: Agar history mein user ne apna naam bataya hai, use yaad rakho. Naya naam bataye toh:
- "mera naam kya hai" -> SABSE RECENT naam batao
- "pehle mera naam kya tha" -> naye se PEHLE wala naam batao

Pichli baatein:
${historyText || "(koi purani baat nahi hai)"}`,
      },
      { role: "user", content: userMessage },
    ],
  });

  return response.choices[0].message.content;
}

async function generateQuiz(subject: string, count: number) {
  const systemPrompt = `Tum ek Government exam (SSC/Railway/Bank level) ke expert ho jo MCQ quiz questions banata hai.

DIFFICULTY: Questions Government competitive exam level ke hone chahiye — SIMPLE school-level ya single-digit arithmetic KABHI mat banao. Math/Reasoning ho toh percentage, ratio, profit-loss, time-speed-distance jaise exam topics use karo.

ANSWER ACCURACY - BAHUT ZAROORI: Har question ka answer khud pehle solve karo, FIR confirm karo "correctIndex" sahi answer ke EXACT position pe hai. Dobara check karo.

Reply SIRF JSON array format mein:
[{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}, ...]
Rules:
- "options" mein EXACTLY 4 options
- "correctIndex" 0,1,2 ya 3 (verified)
- "question" 200 characters se chhota, options 100 characters se chhote`;

  const userPrompt = `${subject} subject ke ${count} MCQ questions banao Government exam level ke.`;

  const result = await askForJSON(systemPrompt, userPrompt);
  return result || [];
}

async function getCurrentAffairsNews() {
  const apiKey = process.env.SERPAPI_KEY;
  const url = `https://serpapi.com/search.json?engine=google_news&q=India+current+affairs&gl=in&hl=en&api_key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();
  return data.news_results || [];
}

async function generateCurrentAffairsQuiz(newsItems: any[], count: number) {
  const newsText = newsItems
    .slice(0, 15)
    .map((item, i) => {
      const actual = item.stories ? item.stories[0] : item;
      return `${i + 1}. ${actual.title}`;
    })
    .join("\n");

  const systemPrompt = `Tum ek current affairs quiz expert ho. Di gayi ACTUAL latest news headlines ke aadhar par MCQ questions banao.

ANSWER ACCURACY - BAHUT ZAROORI: Har answer verify karo, "correctIndex" exact sahi position pe ho.

Reply SIRF JSON array format mein:
[{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}, ...]
Rules:
- Har question kisi news headline se related ho
- "options" mein EXACTLY 4 options
- "question" 200 characters se chhota, options 100 characters se chhote`;

  const userPrompt = `Ye hain latest news headlines:\n${newsText}\n\nInme se ${count} MCQ questions banao.`;

  const result = await askForJSON(systemPrompt, userPrompt);
  return result || [];
}

async function generatePYQStyleQuiz(examName: string, subject: string, count: number) {
  const subjectLine = subject && subject.trim() !== ""
    ? `Questions SIRF "${subject}" subject ke hone chahiye.`
    : `Koi specific subject nahi bataya gaya, exam ke overall pattern ke general questions banao.`;

  const systemPrompt = `Tum ek Government exam expert ho jo ${examName} exam ke pichle saalon ke actual pattern ke hisaab se questions banata hai.
${subjectLine}

DIFFICULTY: Questions real ${examName} exam ke difficulty level ke hone chahiye, basic/school-level nahi.

ANSWER ACCURACY - BAHUT ZAROORI: Har question ka answer khud pehle solve karo, FIR confirm karo "correctIndex" sahi position pe hai.

Reply SIRF JSON array format mein:
[{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}, ...]
Rules:
- "options" mein EXACTLY 4 options
- "question" 200 characters se chhota, options 100 characters se chhote`;

  const userPrompt = `${examName} exam ke ${subject ? subject + " subject ke" : ""} ${count} MCQ questions banao.`;

  const result = await askForJSON(systemPrompt, userPrompt);
  return result || [];
}

async function postQuizToChannel(channelId: string, questions: any[]) {
  let successCount = 0;

  for (const q of questions) {
    try {
      if (!q.question || !q.options || q.options.length !== 4 || q.correctIndex === undefined) {
        continue;
      }

      await bot.sendPoll(channelId, q.question, q.options, {
        type: "quiz",
        correct_option_id: q.correctIndex,
        is_anonymous: true,
      });

      successCount++;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (e) {
      console.log("Quiz poll bhejne mein error:", e);
    }
  }

  return successCount;
}

async function getNews(topic: string) {
  const apiKey = process.env.SERPAPI_KEY;
  let allResults: any[] = [];

  for (const site of VACANCY_SITES) {
    const searchQuery = `${topic} recruitment 2026 vacancy site:${site}`;
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(
      searchQuery
    )}&num=5&gl=in&hl=en&api_key=${apiKey}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.organic_results) {
        allResults = allResults.concat(data.organic_results);
      }
    } catch (e) {
      console.log(`${site} search error:`, e);
    }
  }

  return allResults;
}

function extractAndCheckDate(text: string): { valid: boolean } {
  const dateRegex = /\b(\d{1,2})[\/\-.\s](\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\/\-.\s](\d{2,4})\b/i;
  const match = text.match(dateRegex);
  if (!match) return { valid: false };

  const parsed = new Date(match[0].replace(/[\/\-.]/g, " "));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isNaN(parsed.getTime())) return { valid: false };
  return { valid: parsed >= today };
}

function hasVacancyDetails(item: any): boolean {
  const text = `${item.title} ${item.snippet || ""}`;
  const vacancyRegex = /\d+\s*(vacanc|post|seat)/i;
  if (!vacancyRegex.test(text)) return false;
  return extractAndCheckDate(text).valid;
}

async function likhoPost(newsTitle: string, source: string, link: string, snippet: string) {
  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      {
        role: "system",
        content: `Tum ek Telegram channel ke liye job vacancy posts likhne wale expert ho.
Post SIRF Hinglish (Roman letters) mein likho, KABHI Devanagari script use mat karo.

Format:
🚨 [Post ka naam]
🏢 Department: [naam]
📋 Total Vacancies: [exact number]
🎓 Eligibility: [qualification]
📅 Last Date to Apply: [exact date]
🔗 Apply/More Info: [link]

Agar exact vacancy number ya exact last date nahi mil rahi, sirf ye reply karo: "SKIP"`,
      },
      {
        role: "user",
        content: `Title: "${newsTitle}"\nSource: ${source}\nSnippet: ${snippet || "N/A"}\nLink: ${link}`,
      },
    ],
  });

  return response.choices[0].message.content;
}

async function findAndWritePost(topic: string): Promise<{ post: string; headline: string } | null> {
  const newsList = await getNews(topic);
  const candidates = newsList.filter(hasVacancyDetails);

  for (const candidate of candidates) {
    const generated = await likhoPost(
      candidate.title,
      candidate.displayed_link || "Official Source",
      candidate.link,
      candidate.snippet
    );

    if (generated && !generated.trim().startsWith("SKIP")) {
      return { post: generated, headline: candidate.title };
    }
  }

  return null;
}

async function sendToDestination(chatId: number, channelId: string, post: string, headline: string, destination: string) {
  if (destination === "personal") {
    await bot.sendMessage(chatId, post);
    const msg = `✅ Post tumhe yahan bhej di (channel mein nahi daali).`;
    bot.sendMessage(chatId, msg);
    await saveMessage(chatId, "assistant", msg);
  } else {
    await bot.sendMessage(channelId, post);
    const msg = `✅ Post daal diya "jobs alert" channel mein!\n\n📰 Headline: ${headline}`;
    bot.sendMessage(chatId, msg);
    await saveMessage(chatId, "assistant", msg);
  }
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  console.log("Naya message aaya:", text);

  try {
    await saveMessage(chatId, "user", text);
    const history = await getRecentHistory(chatId);
    const hasPending = !!pendingPosts[chatId];

    const samajh = await samajhoMessage(text, history, hasPending, lastQuizContext[chatId]);
    console.log("Groq ne samjha:", samajh);

    if (samajh.action === "forget_context") {
      await forgetHistory(chatId);
      delete pendingPosts[chatId];
      delete lastQuizContext[chatId];
      const msg2 = "Thik hai, maine purani saari baatein bhula di hain!";
      bot.sendMessage(chatId, msg2);
      await saveMessage(chatId, "assistant", msg2);
      return;
    }

    if (samajh.action === "chat") {
      const reply = await chatReply(text, history);
      const finalReply = reply || "Ji bolo, kya karna hai?";
      bot.sendMessage(chatId, finalReply);
      await saveMessage(chatId, "assistant", finalReply);
      return;
    }

    if (samajh.action === "quiz_request") {
      const channelId = CHANNELS["jobs alert"];
      const subject = samajh.subject || "General Knowledge";
      const count = Math.min(samajh.count || 5, 20);

      bot.sendMessage(chatId, `Samajh gayi! "${subject}" ke ${count} questions taiyar kar rahi hoon...`);

      const questions = await generateQuiz(subject, count);

      if (!questions || questions.length === 0) {
        const errMsg = "Questions banane mein dikkat hui, dobara try karo.";
        bot.sendMessage(chatId, errMsg);
        await saveMessage(chatId, "assistant", errMsg);
        return;
      }

      const posted = await postQuizToChannel(channelId, questions);
      lastQuizContext[chatId] = { type: "quiz_request" };

      const confirmMsg = `✅ ${posted} quiz questions "jobs alert" channel mein daal diye! Subject: ${subject}`;
      bot.sendMessage(chatId, confirmMsg);
      await saveMessage(chatId, "assistant", confirmMsg);
      return;
    }

    if (samajh.action === "current_affairs_quiz") {
      const channelId = CHANNELS["jobs alert"];
      const count = Math.min(samajh.count || 5, 15);

      bot.sendMessage(chatId, `Samajh gayi! Latest current affairs news dhoondh rahi hoon...`);

      const newsItems = await getCurrentAffairsNews();

      if (newsItems.length === 0) {
        const errMsg = "Abhi latest news nahi mil rahi, thodi der baad try karo.";
        bot.sendMessage(chatId, errMsg);
        await saveMessage(chatId, "assistant", errMsg);
        return;
      }

      const questions = await generateCurrentAffairsQuiz(newsItems, count);

      if (!questions || questions.length === 0) {
        const errMsg = "Questions banane mein dikkat hui, dobara try karo.";
        bot.sendMessage(chatId, errMsg);
        await saveMessage(chatId, "assistant", errMsg);
        return;
      }

      const posted = await postQuizToChannel(channelId, questions);
      lastQuizContext[chatId] = { type: "current_affairs_quiz" };

      const confirmMsg = `✅ ${posted} current affairs quiz questions "jobs alert" channel mein daal diye!`;
      bot.sendMessage(chatId, confirmMsg);
      await saveMessage(chatId, "assistant", confirmMsg);
      return;
    }

    if (samajh.action === "pyq_quiz") {
      const channelId = CHANNELS["jobs alert"];
      const count = Math.min(samajh.count || 5, 15);

      bot.sendMessage(chatId, `Samajh gayi! practice mode mein "${samajh.exam}" ke ${count} questions taiyar kar rahi hoon...`);

      const questions = await generatePYQStyleQuiz(samajh.exam, samajh.subject || "", count);

      if (!questions || questions.length === 0) {
        bot.sendMessage(chatId, "Questions banane mein dikkat hui, dobara try karo.");
        await saveMessage(chatId, "assistant", "Questions banane mein dikkat hui.");
        return;
      }

      const posted = await postQuizToChannel(channelId, questions);
      lastQuizContext[chatId] = { type: "pyq_quiz", exam: samajh.exam };

      const confirmMsg = `✅ ${posted} "${samajh.exam}"${samajh.subject ? " (" + samajh.subject + ")" : ""} pattern quiz questions channel mein daal diye!`;
      bot.sendMessage(chatId, confirmMsg);
      await saveMessage(chatId, "assistant", confirmMsg);
      return;
    }

    if (samajh.action === "prepare_post") {
      const channelId = CHANNELS["jobs alert"];
      bot.sendMessage(chatId, `Samajh gayi! "${samajh.topic}" pe confirmed vacancy dhoondh rahi hoon...`);

      const result = await findAndWritePost(samajh.topic);

      if (!result) {
        const noNewsMsg = `"${samajh.topic}" pe koi post nahi mili jisme EXACT vacancy number aur last date dono clear ho. Dusra topic try karo.`;
        bot.sendMessage(chatId, noNewsMsg);
        await saveMessage(chatId, "assistant", noNewsMsg);
        return;
      }

      bot.sendMessage(chatId, result.post);
      const previewMsg = `👆 Ye post ready hai. Bolo "channel pe daalo", "mujhe bhejo", ya "X minute baad daalo".`;
      bot.sendMessage(chatId, previewMsg);
      await saveMessage(chatId, "assistant", `${result.post}\n\n${previewMsg}`);

      pendingPosts[chatId] = { post: result.post, headline: result.headline, channelId, topic: samajh.topic };
      return;
    }

    if (samajh.action === "post_action") {
      const channelId = CHANNELS["jobs alert"];
      const destination = samajh.destination || "channel";
      const delaySeconds = samajh.delaySeconds || 0;

      let postData: { post: string; headline: string } | null = null;

      if (samajh.topic && samajh.topic.trim() !== "") {
        bot.sendMessage(chatId, `Samajh gayi! "${samajh.topic}" pe confirmed vacancy dhoondh rahi hoon...`);
        postData = await findAndWritePost(samajh.topic);

        if (!postData) {
          const noNewsMsg = `"${samajh.topic}" pe koi post nahi mili jisme EXACT vacancy number aur last date dono clear ho. Dusra topic try karo.`;
          bot.sendMessage(chatId, noNewsMsg);
          await saveMessage(chatId, "assistant", noNewsMsg);
          return;
        }
      } else if (pendingPosts[chatId]) {
        postData = { post: pendingPosts[chatId].post, headline: pendingPosts[chatId].headline };
      } else {
        bot.sendMessage(chatId, `Samajh gayi! Latest job vacancy dhoondh rahi hoon...`);

        const fallbackTopics = ["SSC Jobs", "Railway Jobs", "Bank Jobs", "Police Jobs", "Government Jobs"];

        for (const fallbackTopic of fallbackTopics) {
          postData = await findAndWritePost(fallbackTopic);
          if (postData) break;
        }

        if (!postData) {
          const noNewsMsg = `Abhi koi confirmed vacancy nahi mili kisi bhi category mein. Thodi der baad try karo.`;
          bot.sendMessage(chatId, noNewsMsg);
          await saveMessage(chatId, "assistant", noNewsMsg);
          return;
        }
      }

      if (delaySeconds > 0) {
        const minutes = Math.round(delaySeconds / 60);
        const scheduleMsg = `⏰ Thik hai, ${minutes > 0 ? minutes + " minute" : delaySeconds + " second"} baad ye post bhej dungi.`;
        bot.sendMessage(chatId, scheduleMsg);
        await saveMessage(chatId, "assistant", scheduleMsg);

        const finalPost = postData;
        setTimeout(() => {
          sendToDestination(chatId, channelId, finalPost!.post, finalPost!.headline, destination);
          delete pendingPosts[chatId];
        }, delaySeconds * 1000);
      } else {
        await sendToDestination(chatId, channelId, postData.post, postData.headline, destination);
        delete pendingPosts[chatId];
      }

      return;
    }
  } catch (error) {
    console.error("Error aayi:", error);
    bot.sendMessage(chatId, "Kuch gadbad ho gayi, dobara try karo.");
  }
});

// Render ko khush rakhne ke liye chhota sa web server
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot chal raha hai!");
});

app.listen(PORT, () => {
  console.log(`Web server bhi chal raha hai port ${PORT} par`);
});