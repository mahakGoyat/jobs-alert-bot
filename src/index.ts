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

const lastQuizContext: Record<number, { type: string; exam?: string }> = {};

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

// SIRF QUIZ related actions - koi vacancy/job search nahi
async function samajhoMessage(userMessage: string, history: any[], lastQuiz: any) {
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
        content: `Tum ek Telegram quiz assistant ho jo Hinglish/Hindi mein poori baat ka MATLAB samajhta hai.

Abhi ka time: ${now}
${lastQuizInfo}

BAHUT ZAROORI - YE BOT SIRF QUIZ/MCQ QUESTIONS BANATA HAI, KABHI BHI JOB VACANCY YA RECRUITMENT NEWS NAHI DHOONDTA. Agar message mein "question", "quiz", "MCQ" jaisa word hai, YA koi subject (History, Hindi, GK, Math, Science, Reasoning) mention hua hai, YE HAMESHA QUIZ REQUEST HAI.

Agar user ka message CHHOTA hai (jaise sirf "Hindi subject ke"), ye pichle context ka continuation hai. Agar pichla quiz type "pyq_quiz" tha, USI exam ke saath rakho.

Reply SIRF JSON format mein do (exact fields, koi extra field mat add karo):
{"action": "pyq_quiz", "exam": "...", "subject": "...", "count": <number>, "language": "Hindi" ya "English" ya "Hindi and English"}
YA
{"action": "current_affairs_quiz", "count": <number>, "language": "Hindi" ya "English" ya "Hindi and English"}
YA
{"action": "quiz_request", "subject": "...", "count": <number>, "language": "Hindi" ya "English" ya "Hindi and English"}
YA
{"action": "forget_context"}
YA
{"action": "chat"}

Rules:
- "current_affairs_quiz" tabhi jab "current affairs", "latest news ke question" bola gaya ho.
- "pyq_quiz" jab kisi exam ka naam liya gaya ho, ya pichla context pyq_quiz tha.
- "quiz_request" general subject quiz jab koi exam context na ho.
- "language": agar user ne kuch na bataya ho, default "Hindi" rakho. Agar "dono language", "hindi english dono" bola ho, "Hindi and English" rakho.
- Agar user "channel/group mein daalo" bola ho quiz ke saath, wo bhi "quiz_request"/"pyq_quiz"/"current_affairs_quiz" hi hai (channel mein posting in sabhi actions ka default behavior hai).

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
        content: `Tum ek helpful Telegram quiz assistant ho jo HAMESHA Hinglish (Roman letters) mein reply deta hai. KABHI Devanagari script use mat karo. Chhota reply do (max 2-3 lines). Tum SIRF quiz/MCQ questions banate ho, koi job/vacancy kaam nahi karte.

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

function languageInstruction(language: string): string {
  if (language === "Hindi and English") {
    return `Har question DONO languages mein likho — pehle Hindi (Devanagari) mein, phir uske turant baad bracket mein English translation. Jaise: "question": "भारत की राजधानी क्या है? (What is the capital of India?)". Options bhi isi tarah dono languages mein do, jaise: "नई दिल्ली (New Delhi)".`;
  } else if (language === "English") {
    return `Sab kuch SIRF English mein likho.`;
  } else {
    return `Sab kuch SIRF Hindi (Devanagari script) mein likho.`;
  }
}

async function generateQuiz(subject: string, count: number, language: string) {
  const systemPrompt = `Tum ek Government exam (SSC/Railway/Bank level) ke expert ho jo MCQ quiz questions banata hai.

DIFFICULTY: Questions Government competitive exam level ke hone chahiye — SIMPLE school-level ya single-digit arithmetic KABHI mat banao.

LANGUAGE: ${languageInstruction(language)}

ANSWER ACCURACY - BAHUT ZAROORI: Har question ka answer khud pehle solve karo, FIR confirm karo "correctIndex" sahi answer ke EXACT position pe hai.

Reply SIRF JSON array format mein:
[{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}, ...]
Rules:
- "options" mein EXACTLY 4 options
- "correctIndex" 0,1,2 ya 3 (verified)
- "question" 250 characters se chhota (bilingual ho toh thoda zyada chal jayega), options 100 characters se chhote`;

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

async function generateCurrentAffairsQuiz(newsItems: any[], count: number, language: string) {
  const newsText = newsItems
    .slice(0, 15)
    .map((item, i) => {
      const actual = item.stories ? item.stories[0] : item;
      return `${i + 1}. ${actual.title}`;
    })
    .join("\n");

  const systemPrompt = `Tum ek current affairs quiz expert ho. Di gayi ACTUAL latest news headlines ke aadhar par MCQ questions banao.

LANGUAGE: ${languageInstruction(language)}

ANSWER ACCURACY - BAHUT ZAROORI: Har answer verify karo, "correctIndex" exact sahi position pe ho.

Reply SIRF JSON array format mein:
[{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}, ...]
Rules:
- Har question kisi news headline se related ho
- "options" mein EXACTLY 4 options
- "question" 250 characters se chhota, options 100 characters se chhote`;

  const userPrompt = `Ye hain latest news headlines:\n${newsText}\n\nInme se ${count} MCQ questions banao.`;

  const result = await askForJSON(systemPrompt, userPrompt);
  return result || [];
}

async function generatePYQStyleQuiz(examName: string, subject: string, count: number, language: string) {
  const subjectLine = subject && subject.trim() !== ""
    ? `Questions SIRF "${subject}" subject ke hone chahiye.`
    : `Koi specific subject nahi bataya gaya, exam ke overall pattern ke general questions banao.`;

  const systemPrompt = `Tum ek Government exam expert ho jo ${examName} exam ke pichle saalon ke actual pattern ke hisaab se questions banata hai.
${subjectLine}

LANGUAGE: ${languageInstruction(language)}

DIFFICULTY: Questions real ${examName} exam ke difficulty level ke hone chahiye, basic/school-level nahi.

ANSWER ACCURACY - BAHUT ZAROORI: Har question ka answer khud pehle solve karo, FIR confirm karo "correctIndex" sahi position pe hai.

Reply SIRF JSON array format mein:
[{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}, ...]
Rules:
- "options" mein EXACTLY 4 options
- "question" 250 characters se chhota, options 100 characters se chhote`;

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

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  console.log("Naya message aaya:", text);

  try {
    await saveMessage(chatId, "user", text);
    const history = await getRecentHistory(chatId);

    const samajh = await samajhoMessage(text, history, lastQuizContext[chatId]);
    console.log("Groq ne samjha:", samajh);

    if (samajh.action === "forget_context") {
      await forgetHistory(chatId);
      delete lastQuizContext[chatId];
      const msg2 = "Thik hai, maine purani saari baatein bhula di hain!";
      bot.sendMessage(chatId, msg2);
      await saveMessage(chatId, "assistant", msg2);
      return;
    }

    if (samajh.action === "chat") {
      const reply = await chatReply(text, history);
      const finalReply = reply || "Ji bolo, kis subject ke question chahiye?";
      bot.sendMessage(chatId, finalReply);
      await saveMessage(chatId, "assistant", finalReply);
      return;
    }

    const channelId = CHANNELS["jobs alert"];
    const language = samajh.language || "Hindi";

    if (samajh.action === "quiz_request") {
      const subject = samajh.subject || "General Knowledge";
      const count = Math.min(samajh.count || 5, 20);

      bot.sendMessage(chatId, `Samajh gayi! "${subject}" ke ${count} questions taiyar kar rahi hoon (${language})...`);

      const questions = await generateQuiz(subject, count, language);

      if (!questions || questions.length === 0) {
        const errMsg = "Questions banane mein dikkat hui, dobara try karo.";
        bot.sendMessage(chatId, errMsg);
        await saveMessage(chatId, "assistant", errMsg);
        return;
      }

      const posted = await postQuizToChannel(channelId, questions);
      lastQuizContext[chatId] = { type: "quiz_request" };

      const confirmMsg = `✅ ${posted} quiz questions channel mein daal diye! Subject: ${subject}`;
      bot.sendMessage(chatId, confirmMsg);
      await saveMessage(chatId, "assistant", confirmMsg);
      return;
    }

    if (samajh.action === "current_affairs_quiz") {
      const count = Math.min(samajh.count || 5, 15);

      bot.sendMessage(chatId, `Samajh gayi! Latest current affairs news dhoondh rahi hoon (${language})...`);

      const newsItems = await getCurrentAffairsNews();

      if (newsItems.length === 0) {
        const errMsg = "Abhi latest news nahi mil rahi, thodi der baad try karo.";
        bot.sendMessage(chatId, errMsg);
        await saveMessage(chatId, "assistant", errMsg);
        return;
      }

      const questions = await generateCurrentAffairsQuiz(newsItems, count, language);

      if (!questions || questions.length === 0) {
        const errMsg = "Questions banane mein dikkat hui, dobara try karo.";
        bot.sendMessage(chatId, errMsg);
        await saveMessage(chatId, "assistant", errMsg);
        return;
      }

      const posted = await postQuizToChannel(channelId, questions);
      lastQuizContext[chatId] = { type: "current_affairs_quiz" };

      const confirmMsg = `✅ ${posted} current affairs quiz questions channel mein daal diye!`;
      bot.sendMessage(chatId, confirmMsg);
      await saveMessage(chatId, "assistant", confirmMsg);
      return;
    }

    if (samajh.action === "pyq_quiz") {
      const count = Math.min(samajh.count || 5, 15);

      bot.sendMessage(chatId, `Samajh gayi! practice mode mein "${samajh.exam}" ke ${count} questions taiyar kar rahi hoon (${language})...`);

      const questions = await generatePYQStyleQuiz(samajh.exam, samajh.subject || "", count, language);

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
  } catch (error) {
    console.error("Error aayi:", error);
    bot.sendMessage(chatId, "Kuch gadbad ho gayi, dobara try karo.");
  }
});

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot chal raha hai!");
});

app.listen(PORT, () => {
  console.log(`Web server bhi chal raha hai port ${PORT} par`);
});