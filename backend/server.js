require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
const db = require('./database');
const pdfParse = require('pdf-parse');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Configure OpenAI SDK to use Groq API
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Configure Multer for audio uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const SYSTEM_PROMPT = `
You are a friendly, encouraging AI English Tutor.
Your goal is to help the user improve their spoken English.

Follow these strict rules for every interaction:
1. Understand the user's input meaning (they might use broken English).
2. Adapt to their level: use simple sentences for beginners, and complex ones for advanced users.
3. If they make a grammar mistake, correct it.
4. Explain the correction in simple, easy-to-understand English (e.g., 'Use "did not go" for past tense.').
5. Motivate the user with phrases like "Good try!", "Say one more sentence", or "Great effort!".
6. Do NOT stop at the correction. Always ask a follow-up question to keep the conversation going and encourage them to speak more.
7. NEVER use any language other than English in your response. All explanations and replies must be 100% English.

You must reply in JSON format exactly as follows:
{
  "correction": "The corrected English sentence. Leave empty if no correction needed.",
  "explanation": "Explanation of the mistake in simple English. Leave empty if no correction.",
  "reply": "Your motivational conversational reply and follow-up question in English.",
  "proficiency": "Beginner | Intermediate | Advanced"
}
`;

// Session histories for maintaining context
const sessions = new Map();
const interviewSessions = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Initialize session history
  sessions.set(socket.id, [
    { role: "system", content: SYSTEM_PROMPT }
  ]);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    sessions.delete(socket.id);
  });
});

// Authentication Routes
app.post('/api/signup', async (req, res) => {
  try {
    const { fullName, email, username, password } = req.body;

    if (!fullName || !email || !username || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // Check if user already exists
    const checkUser = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, email);
    if (checkUser) {
      return res.status(400).json({ success: false, message: 'Username or email already exists.' });
    }

    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user into database
    const insertUser = db.prepare('INSERT INTO users (fullName, email, username, passwordHash) VALUES (?, ?, ?, ?)');
    insertUser.run(fullName, email, username, passwordHash);

    res.json({ success: true, message: 'User created successfully.' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Identifier and password are required.' });
    }

    // Find user by username or email
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identifier, identifier);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    // Verify password
    const match = await bcrypt.compare(password, user.passwordHash);
    
    if (match) {
      res.json({ success: true, message: 'Login successful.', user: { username: user.username, email: user.email } });
    } else {
      res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// DAILY QUIZ DATA
const DAILY_QUIZZES = [
  { level: 'Beginner', question: 'I ___ a student.', options: ['am', 'is', 'are', 'be'], answer: 'am', explanation: '"am" is the correct verb to use with the pronoun "I".' },
  { level: 'Intermediate', question: 'Choose the correct sentence:', options: ["She don't like tea.", "She doesn't likes tea.", "She doesn't like tea.", "She not like tea."], answer: "She doesn't like tea.", explanation: 'With the third-person singular "She", we use "doesn\'t" and the base form of the verb "like".' },
  { level: 'Advanced', question: 'Choose the correct synonym of "Happy":', options: ['Ecstatic', 'Melancholy', 'Lethargic', 'Apathetic'], answer: 'Ecstatic', explanation: '"Ecstatic" means feeling or expressing overwhelming happiness.' },
  { level: 'Beginner', question: 'He ___ to school every day.', options: ['go', 'goes', 'going', 'gone'], answer: 'goes', explanation: '"He" is third-person singular, so the verb takes an "s" or "es".' },
  { level: 'Intermediate', question: 'Find the error: "I have visited London last year."', options: ['I', 'have visited', 'London', 'last year'], answer: 'have visited', explanation: 'With a specific past time ("last year"), we use the simple past "visited" rather than present perfect.' },
  { level: 'Advanced', question: 'What does "to beat around the bush" mean?', options: ['To garden', 'To avoid the main topic', 'To search for something', 'To speak directly'], answer: 'To avoid the main topic', explanation: 'It is an idiom meaning to avoid saying what you mean, usually because it is uncomfortable.' }
];

const getDailyQuiz = () => {
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  const quiz = DAILY_QUIZZES[dayOfYear % DAILY_QUIZZES.length];
  const dateStr = today.toISOString().split('T')[0];
  return { ...quiz, date: dateStr };
};

// DAILY QUIZ ROUTES
app.get('/api/daily-quiz', (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username is required' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const dailyQuiz = getDailyQuiz();
    const todayStr = dailyQuiz.date;

    let currentStreak = user.currentStreak || 0;
    const lastAttempt = user.lastAttemptDate;
    
    if (lastAttempt && lastAttempt !== todayStr) {
      const lastDate = new Date(lastAttempt);
      const todayDate = new Date(todayStr);
      const diffTime = todayDate - lastDate;
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); 
      
      if (diffDays > 1) {
        currentStreak = 0;
        db.prepare('UPDATE users SET currentStreak = 0 WHERE username = ?').run(username);
      }
    }

    const hasAttemptedToday = lastAttempt === todayStr;

    res.json({
      question: dailyQuiz.question,
      options: dailyQuiz.options,
      date: dailyQuiz.date,
      level: dailyQuiz.level,
      hasAttemptedToday,
      streak: currentStreak
    });
  } catch (err) {
    console.error('Error fetching daily quiz:', err);
    res.status(500).json({ error: 'Failed to fetch daily quiz' });
  }
});

app.post('/api/submit-quiz', (req, res) => {
  try {
    const { username, answer, date } = req.body;
    if (!username || !answer || !date) return res.status(400).json({ error: 'Missing required fields' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.lastAttemptDate === date) {
      return res.status(400).json({ error: 'Quiz already attempted today' });
    }

    const dailyQuiz = getDailyQuiz();
    if (dailyQuiz.date !== date) {
      return res.status(400).json({ error: 'Invalid quiz date' });
    }

    const isCorrect = answer === dailyQuiz.answer;
    let newStreak = user.currentStreak || 0;
    let totalCorrect = user.totalCorrectAnswers || 0;

    if (isCorrect) {
      newStreak += 1;
      totalCorrect += 1;
    } else {
      newStreak = 0;
    }

    db.prepare('UPDATE users SET currentStreak = ?, lastAttemptDate = ?, totalCorrectAnswers = ? WHERE username = ?')
      .run(newStreak, date, totalCorrect, username);

    res.json({
      isCorrect,
      correctAnswer: dailyQuiz.answer,
      explanation: dailyQuiz.explanation,
      streak: newStreak
    });
  } catch (err) {
    console.error('Error submitting quiz:', err);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

app.post('/api/chat', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const originalPath = req.file.path;
    const webmPath = `${originalPath}.webm`;
    fs.renameSync(originalPath, webmPath);

    const audioFile = fs.createReadStream(webmPath);
    const socketId = req.body.socketId;

    // 1. STT with Groq Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      response_format: 'text',
      language: 'en' // you can leave this out for auto-detect, but since we expect english/tanglish auto is better
    });

    const userText = transcription.trim();
    if (!userText) {
      fs.unlink(webmPath, () => {});
      return res.json({ success: false, message: 'No speech detected.' });
    }

    // Retrieve conversation history
    const history = sessions.get(socketId) || [{ role: "system", content: SYSTEM_PROMPT }];
    history.push({ role: "user", content: userText });

    // 2. LLM with Groq Llama 3
    const chatCompletion = await groq.chat.completions.create({
      messages: history,
      model: "llama-3.1-8b-instant", // Updated from decommissioned llama3-8b-8192
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const aiResponseRaw = chatCompletion.choices[0]?.message?.content || "{}";
    let aiData;
    try {
      aiData = JSON.parse(aiResponseRaw);
    } catch (e) {
      console.error("Failed to parse JSON from AI", aiResponseRaw);
      aiData = { reply: "Sorry, I had trouble processing that.", explanation: "", correction: "" };
    }

    // Add AI reply to history
    history.push({ role: "assistant", content: JSON.stringify(aiData) });
    sessions.set(socketId, history);

    // Construct the full spoken text
    let spokenText = "";
    if (aiData.correction) {
      spokenText += "Suggestion: " + aiData.correction + ". ";
    }
    if (aiData.explanation) {
      spokenText += aiData.explanation + ". ";
    }
    spokenText += aiData.reply;

    // 3. TTS (Check for ElevenLabs, else Fallback)
    let audioBase64 = null;
    let useClientTTS = true;

    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.length > 0) {
      try {
        const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL`, { // Using standard 'Bella' voice id
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: spokenText,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          })
        });
        
        if (ttsResponse.ok) {
          const arrayBuffer = await ttsResponse.arrayBuffer();
          audioBase64 = Buffer.from(arrayBuffer).toString('base64');
          useClientTTS = false;
        } else {
           console.error("Elevenlabs failed:", await ttsResponse.text());
        }
      } catch (err) {
        console.error("TTS Error:", err);
      }
    }

    // Clean up uploaded audio file
    fs.unlink(webmPath, () => {});

    // Send back the comprehensive response
    res.json({
      success: true,
      userText,
      correction: aiData.correction,
      explanation: aiData.explanation,
      reply: aiData.reply,
      spokenText,
      proficiency: aiData.proficiency,
      audioBase64,
      useClientTTS
    });

  } catch (error) {
    console.error("Error processing audio:", error);
    if (req.file) {
       if (fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
       if (typeof webmPath !== 'undefined' && fs.existsSync(webmPath)) fs.unlink(webmPath, () => {});
    }
    res.status(500).json({ error: 'Failed to process audio' });
  }
});

// TRANSCRIBE ROUTE
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const originalPath = req.file.path;
    const webmPath = `${originalPath}.webm`;
    fs.renameSync(originalPath, webmPath);

    const audioFile = fs.createReadStream(webmPath);

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      response_format: 'text',
      language: 'en'
    });

    fs.unlink(webmPath, () => {});
    res.json({ text: transcription.trim() });
  } catch (error) {
   console.error("FULL ERROR:", error.response?.data || error.message || error);
    if (req.file) {
       if (fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
       if (typeof webmPath !== 'undefined' && fs.existsSync(webmPath)) fs.unlink(webmPath, () => {});
    }
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

// SPEAKING TASK ROUTE (Dynamic Generation)
app.get('/api/speaking-task', async (req, res) => {
  try {
    const { level } = req.query;
    let prompt = "";
    if (level === 'beginner') {
      prompt = "Generate a single, unique, simple English speaking practice task for a beginner. The task should focus on basic grammar like articles (a, an, the), simple tenses (present/past), or basic pronunciation. Make it short. Examples: 'Read this sentence focusing on pronunciation: I have an apple.', 'Answer: What did you eat yesterday?', 'Fill in the article and speak: I saw ___ elephant.' Return ONLY the task text, nothing else, no quotes.";
    } else if (level === 'intermediate') {
       prompt = "Generate a single, unique intermediate English speaking practice task. Focus on topics like describing daily routines, past experiences, or opinions. Example: 'Describe your daily routine.' Return ONLY the task text, no quotes.";
    } else {
       prompt = "Generate a single, unique advanced English speaking practice task. Focus on complex opinions, debating, or paragraph speaking. Example: 'Express your opinion on remote work vs office work.' Return ONLY the task text, no quotes.";
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: "llama-3.1-8b-instant",
      temperature: 0.9,
      max_tokens: 100,
    });

    const task = chatCompletion.choices[0]?.message?.content?.replace(/["']/g, '').trim() || "Introduce yourself";
    res.json({ task });
  } catch (error) {
    console.error("Error generating task:", error);
    res.status(500).json({ error: 'Failed to generate task' });
  }
});

// SPEAKING PRACTICE ROUTE
app.post('/api/speaking-practice', async (req, res) => {
  try {
    const { level, userInput } = req.body;

    if (!userInput) {
      return res.status(400).json({ error: 'userInput is required' });
    }

    let maxScore = 5;
    let evaluationCriteria = '';

    if (level === 'beginner') {
      maxScore = 5;
      evaluationCriteria = 'Check basic grammar (articles, tenses), pronunciation clues if possible, and sentence completeness. If they use wrong answers/grammar, provide a CLEAR-CUT grammatical explanation naming the exact rule (e.g. missing article, wrong tense).';
    } else if (level === 'intermediate') {
      maxScore = 10;
      evaluationCriteria = 'Check grammar, tense usage, and sentence structure. If they use wrong grammar, provide a CLEAR-CUT grammatical explanation naming the exact rule broken.';
    } else if (level === 'advanced') {
      maxScore = 20;
      evaluationCriteria = 'Check fluency, vocabulary usage, coherence, and advanced grammar. Provide a detailed, clear-cut grammatical explanation for any errors.';
    } else {
      return res.status(400).json({ error: 'Invalid level' });
    }

    const systemPrompt = `You are an English Tutor evaluating a student's speaking practice.
Level: ${level}

Evaluate the student's input based on the following criteria for the ${level} level:
${evaluationCriteria}

Provide the response in the following JSON format EXACTLY. Ensure the "score" is a number out of ${maxScore}.
{
  "correctedText": "The corrected and improved version of the text",
  "feedback": "List of mistakes identified or general feedback",
  "explanationEnglish": "Simple English explanation of the mistakes and how to improve",
  "explanationTamil": "Explanation of the mistakes and how to improve translated to Tamil",
  "explanationHindi": "Explanation of the mistakes and how to improve translated to Hindi",
  "score": "Score out of ${maxScore} formatted exactly as 'X/${maxScore}' (e.g., '4/${maxScore}')"
}`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Student Input: "${userInput}"` }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" }
    });

    const aiResponseRaw = chatCompletion.choices[0]?.message?.content || "{}";
    let aiData;
    try {
      aiData = JSON.parse(aiResponseRaw);
    } catch (e) {
      console.error("Failed to parse JSON from AI", aiResponseRaw);
      return res.status(500).json({ error: 'Failed to process AI response' });
    }

    let spokenText = "";
    if (aiData.correctedText) {
      spokenText += "Corrected Version: " + aiData.correctedText + ". ";
    }
    if (aiData.explanationEnglish) {
      spokenText += "Explanation: " + aiData.explanationEnglish;
    }

    let audioBase64 = null;
    let useClientTTS = true;

    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.length > 0) {
      try {
        const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL`, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: spokenText,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          })
        });
        
        if (ttsResponse.ok) {
          const arrayBuffer = await ttsResponse.arrayBuffer();
          audioBase64 = Buffer.from(arrayBuffer).toString('base64');
          useClientTTS = false;
        } else {
           console.error("Elevenlabs failed:", await ttsResponse.text());
        }
      } catch (err) {
        console.error("TTS Error:", err);
      }
    }

    res.json({
      correctedText: aiData.correctedText || "",
      feedback: aiData.feedback || "",
      explanationEnglish: aiData.explanationEnglish || "",
      explanationTamil: aiData.explanationTamil || "",
      explanationHindi: aiData.explanationHindi || "",
      score: aiData.score || "",
      audioBase64,
      useClientTTS,
      spokenText
    });

  } catch (error) {
    console.error("Error processing speaking practice:", error);
    res.status(500).json({ error: 'Failed to process speaking practice' });
  }
});

// SPEAK FREE ROUTE
app.post('/api/speak-free', async (req, res) => {
  try {
    const { userInput } = req.body;

    if (!userInput) {
      return res.status(400).json({ error: 'userInput is required' });
    }

    const systemPrompt = `You are a friendly and encouraging English AI Tutor having a free conversation with a student.
Evaluate the student's input and respond naturally. Keep the conversation flowing.

Provide the response in the following JSON format EXACTLY:
{
  "correctedSentence": "The corrected English sentence. Leave empty if no correction needed.",
  "explanationEnglish": "Simple English explanation of any mistakes. Leave empty if no correction.",
  "explanationTamil": "Explanation of the mistakes translated to Tamil. Leave empty if no correction.",
  "explanationHindi": "Explanation of the mistakes translated to Hindi. Leave empty if no correction.",
  "encouragement": "A short, friendly word of encouragement (e.g., 'Great job!', 'Keep it up!').",
  "nextQuestion": "A natural follow-up question to keep the conversation going."
}`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Student Input: "${userInput}"` }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" }
    });

    const aiResponseRaw = chatCompletion.choices[0]?.message?.content || "{}";
    let aiData;
    try {
      aiData = JSON.parse(aiResponseRaw);
    } catch (e) {
      console.error("Failed to parse JSON from AI", aiResponseRaw);
      return res.status(500).json({ error: 'Failed to process AI response' });
    }

    let spokenText = "";
    if (aiData.correctedSentence) {
      spokenText += "Corrected: " + aiData.correctedSentence + ". ";
    }
    spokenText += aiData.encouragement + " " + aiData.nextQuestion;

    let audioBase64 = null;
    let useClientTTS = true;

    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.length > 0) {
      try {
        const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL`, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: spokenText,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          })
        });
        
        if (ttsResponse.ok) {
          const arrayBuffer = await ttsResponse.arrayBuffer();
          audioBase64 = Buffer.from(arrayBuffer).toString('base64');
          useClientTTS = false;
        } else {
           console.error("Elevenlabs failed:", await ttsResponse.text());
        }
      } catch (err) {
        console.error("TTS Error:", err);
      }
    }

    res.json({
      correctedSentence: aiData.correctedSentence || "",
      explanationEnglish: aiData.explanationEnglish || "",
      explanationTamil: aiData.explanationTamil || "",
      explanationHindi: aiData.explanationHindi || "",
      encouragement: aiData.encouragement || "Good effort!",
      nextQuestion: aiData.nextQuestion || "What else would you like to talk about?",
      audioBase64,
      useClientTTS,
      spokenText
    });

  } catch (error) {
    console.error("Error processing speak free:", error);
    res.status(500).json({ error: 'Failed to process speak free' });
  }
});

// INTERVIEW ROUTES

app.post('/api/interview/setup', upload.single('resume'), async (req, res) => {
  try {
    const { socketId, questionCount } = req.body;
    let resumeText = '';

    if (req.file) {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdfParse(dataBuffer);
      resumeText = data.text;
      fs.unlink(req.file.path, () => {}); // Cleanup
    } else {
      resumeText = "Candidate did not provide a resume. Conduct a general behavioral interview.";
    }

    const totalQuestions = parseInt(questionCount) || 5;

    const INTERVIEW_SYSTEM_PROMPT = `
      You are an expert HR Manager conducting a professional job interview.
      Here is the candidate's resume:
      ---
      ${resumeText}
      ---
      
      RULES:
      1. You will ask exactly ${totalQuestions} questions in total.
      2. The very FIRST question must be asking them to introduce themselves (e.g., "Tell me about yourself").
      3. For subsequent questions, base them on the skills and experience found in the resume.
      4. After the candidate answers, briefly acknowledge their answer, give a 1-sentence piece of constructive feedback or correction on their English/content if needed, and then IMMEDIATELY ask the next question.
      5. Do not ask multiple questions at once. One question at a time.
      6. Keep your responses professional but encouraging.

      You must reply in JSON format exactly as follows:
      {
        "correction": "Correction of their grammar/content. Leave empty if none.",
        "reply": "Your brief feedback on their previous answer + Your next interview question.",
        "isComplete": false
      }
    `;

    interviewSessions.set(socketId, {
      totalQuestions,
      currentQuestion: 0,
      history: [{ role: "system", content: INTERVIEW_SYSTEM_PROMPT }],
      accumulatedFeedback: []
    });

    res.json({ success: true, message: 'Interview setup complete.' });
  } catch (error) {
    console.error('Interview setup error:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    res.status(500).json({ success: false, message: 'Failed to setup interview.' });
  }
});

app.post('/api/interview/chat', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const originalPath = req.file.path;
    const webmPath = `${originalPath}.webm`;
    fs.renameSync(originalPath, webmPath);

    const audioFile = fs.createReadStream(webmPath);
    const socketId = req.body.socketId;

    const session = interviewSessions.get(socketId);
    if (!session) {
      return res.status(400).json({ success: false, message: 'Interview session not found. Please setup first.' });
    }

    // 1. STT with Groq Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      response_format: 'text',
      language: 'en'
    });

    const userText = transcription.trim();
    if (!userText) {
      fs.unlink(webmPath, () => {});
      return res.json({ success: false, message: 'No speech detected.' });
    }

    session.history.push({ role: "user", content: userText });
    session.currentQuestion++;

    if (session.currentQuestion >= session.totalQuestions) {
      // Final Evaluation
      session.history.push({ 
        role: "user", 
        content: "That was the final question. Please evaluate my entire interview performance. Provide a JSON response with 'finalScore' (out of 100), 'strengths' (array of strings), 'improvements' (array of strings), and 'reply' (a concluding voice message thanking me). Set 'isComplete' to true." 
      });

      const chatCompletion = await groq.chat.completions.create({
        messages: session.history,
        model: "llama-3.1-8b-instant",
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" }
      });

      const aiResponseRaw = chatCompletion.choices[0]?.message?.content || "{}";
      const aiData = JSON.parse(aiResponseRaw);
      
      fs.unlink(webmPath, () => {});
      
      return res.json({
        success: true,
        userText,
        isComplete: true,
        finalScore: aiData.finalScore || 80,
        strengths: aiData.strengths || [],
        improvements: aiData.improvements || [],
        reply: aiData.reply || "Thank you for your time. That concludes our interview.",
        audioBase64: null,
        useClientTTS: true
      });
    }

    // Regular Interview Question
    const chatCompletion = await groq.chat.completions.create({
      messages: session.history,
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const aiResponseRaw = chatCompletion.choices[0]?.message?.content || "{}";
    let aiData;
    try {
      aiData = JSON.parse(aiResponseRaw);
    } catch (e) {
      aiData = { reply: "Let's move on. Could you tell me more about your experience?", correction: "", isComplete: false };
    }

    session.history.push({ role: "assistant", content: JSON.stringify(aiData) });
    if (aiData.correction) {
      session.accumulatedFeedback.push(aiData.correction);
    }
    interviewSessions.set(socketId, session);

    let spokenText = "";
    if (aiData.correction) {
      spokenText += "Feedback: " + aiData.correction + ". ";
    }
    spokenText += aiData.reply;

    fs.unlink(webmPath, () => {});

    res.json({
      success: true,
      userText,
      correction: aiData.correction,
      reply: aiData.reply,
      spokenText,
      isComplete: false,
      audioBase64: null,
      useClientTTS: true
    });

  } catch (error) {
    console.error("Error processing interview audio:", error);
    if (req.file) {
       if (fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
       if (typeof webmPath !== 'undefined' && fs.existsSync(webmPath)) fs.unlink(webmPath, () => {});
    }
    res.status(500).json({ error: 'Failed to process interview audio' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
