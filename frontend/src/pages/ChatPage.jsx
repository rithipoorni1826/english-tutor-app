import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Mic, Square, Loader2, ArrowLeft, Send, Volume2, VolumeX } from 'lucide-react';
import '../index.css';

const API_URL = 'http://localhost:3000/api/speaking-practice';



function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentLevel = location.state?.level || 'beginner';
  
  const currentTheme = {
    beginner: {
      bg: 'linear-gradient(-45deg, #11998e, #38ef7d, #00b09b, #96c93d)',
      primary: '#38ef7d',
      btn: 'linear-gradient(135deg, #11998e, #38ef7d)',
      border: 'rgba(56, 239, 125, 0.5)',
      hover: 'rgba(56, 239, 125, 0.1)',
      shadow: 'rgba(56, 239, 125, 0.3)'
    },
    intermediate: {
      bg: 'linear-gradient(-45deg, #4facfe, #00f2fe, #2193b0, #6dd5ed)',
      primary: '#00f2fe',
      btn: 'linear-gradient(135deg, #4facfe, #00f2fe)',
      border: 'rgba(0, 242, 254, 0.5)',
      hover: 'rgba(0, 242, 254, 0.1)',
      shadow: 'rgba(0, 242, 254, 0.3)'
    },
    advanced: {
      bg: 'linear-gradient(-45deg, #667eea, #764ba2, #8E2DE2, #4A00E0)',
      primary: '#a18cd1',
      btn: 'linear-gradient(135deg, #667eea, #764ba2)',
      border: 'rgba(161, 140, 209, 0.5)',
      hover: 'rgba(161, 140, 209, 0.1)',
      shadow: 'rgba(161, 140, 209, 0.3)'
    }
  }[currentLevel] || {
    bg: 'linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)',
    primary: '#3498db',
    btn: 'linear-gradient(135deg, #3498db, #2980b9)',
    border: 'rgba(52, 152, 219, 0.5)',
    hover: 'rgba(52, 152, 219, 0.1)',
    shadow: 'rgba(52, 152, 219, 0.3)'
  };
  
  const [task, setTask] = useState('');
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.speechSynthesis.cancel();
  };

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  useEffect(() => {
    loadNewTask();
  }, [currentLevel]);

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorderRef.current.onstop = async () => {
          setIsProcessing(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          try {
            const response = await axios.post('http://localhost:3000/api/transcribe', formData);
            if (response.data.text) {
              setInputText((prev) => prev + (prev ? ' ' : '') + response.data.text);
            }
          } catch (err) {
             console.error("Transcription error", err);
             alert("Failed to transcribe audio. Please try again.");
          } finally {
             setIsProcessing(false);
          }
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing mic:", err);
        alert("Please enable microphone permissions.");
      }
    }
  };

  const handleSubmit = async () => {
    if (!inputText.trim()) return;
    
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const response = await axios.post(API_URL, {
        level: currentLevel,
        userInput: inputText
      });
      setResult({ ...response.data, userInput: inputText });

      // Play audio response
      stopAudio();
      if (response.data.audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${response.data.audioBase64}`);
        audioRef.current = audio;
        audio.play().catch(e => console.error('Audio play error:', e));
      } else if (response.data.useClientTTS && response.data.spokenText) {
        const utterance = new SpeechSynthesisUtterance(response.data.spokenText);
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.error("Error submitting practice:", err);
      alert("Failed to process your response. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const [isTaskLoading, setIsTaskLoading] = useState(false);

  const loadNewTask = async () => {
    stopAudio();
    setIsTaskLoading(true);
    setResult(null);
    setInputText('');
    setTask('Generating a new task for you...');
    
    try {
      const res = await axios.get(`http://localhost:3000/api/speaking-task?level=${currentLevel}`);
      setTask(res.data.task);
    } catch (e) {
      console.error("Failed to load new task", e);
      setTask("Please introduce yourself and tell me about your day.");
    } finally {
      setIsTaskLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper" style={{ backgroundImage: currentTheme.bg }}>
      <div className="auth-card" style={{ maxWidth: '900px', padding: '30px', display: 'flex', flexDirection: 'column', backgroundColor: 'rgba(10, 15, 30, 0.8)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
        
        <header style={{ position: 'relative', width: '100%', textAlign: 'center', marginBottom: '20px' }}>
          <button 
            onClick={() => navigate('/levels')} 
            style={{ position: 'absolute', top: '0px', left: '0', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <ArrowLeft size={24} /> <span style={{fontSize: '14px', fontWeight: '500'}}>Back</span>
          </button>
          <h1 style={{ textTransform: 'capitalize', fontSize: '2.5rem', margin: '0 0 10px 0', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>{currentLevel} Speaking Practice</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem' }}>Complete the task below to get AI feedback</p>
        </header>

        <div style={{ flex: 1, width: '100%', background: 'rgba(0,0,0,0.2)', padding: '25px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '15px', borderLeft: `4px solid ${currentTheme.primary}` }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: currentTheme.primary, textTransform: 'uppercase', letterSpacing: '1px' }}>Your Task:</h3>
            <p style={{ margin: '0 0 15px 0', fontSize: '1.25rem', fontWeight: '500', lineHeight: '1.5' }}>{task}</p>
            <button onClick={loadNewTask} disabled={isTaskLoading} style={{ background: 'transparent', border: `1px solid ${currentTheme.border}`, color: currentTheme.primary, padding: '6px 12px', borderRadius: '8px', cursor: isTaskLoading ? 'not-allowed' : 'pointer', fontSize: '0.9rem', transition: 'all 0.2s', opacity: isTaskLoading ? 0.5 : 1 }} onMouseOver={(e) => { if(!isTaskLoading) e.target.style.background=currentTheme.hover }} onMouseOut={(e) => { if(!isTaskLoading) e.target.style.background='transparent' }}>
              {isTaskLoading ? 'Loading...' : 'Skip / Get New Task'}
            </button>
          </div>

          {!result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <textarea 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your answer here or click the mic to speak..."
                style={{ width: '100%', minHeight: '120px', padding: '15px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '1.1rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                onFocus={(e) => e.target.style.borderColor = currentTheme.primary}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
              />
              
              <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                <button 
                  onClick={toggleRecording}
                  disabled={isProcessing}
                  title="Speech to Text"
                  style={{ 
                    width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    borderRadius: '50%', border: 'none', background: isRecording ? '#e74c3c' : 'rgba(255,255,255,0.1)',
                    color: '#fff', cursor: isProcessing ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                    boxShadow: isRecording ? '0 0 15px rgba(231,76,60,0.5)' : 'none'
                  }}
                  onMouseOver={(e) => { if(!isRecording && !isProcessing) e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
                  onMouseOut={(e) => { if(!isRecording && !isProcessing) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                >
                  {isRecording ? <Square fill="currentColor" size={24} /> : <Mic size={24} />}
                </button>
                
                <button 
                  onClick={handleSubmit}
                  disabled={isProcessing || !inputText.trim()}
                  style={{ flex: 1, background: currentTheme.btn, color: '#fff', border: 'none', borderRadius: '28px', fontSize: '1.1rem', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: (isProcessing || !inputText.trim()) ? 'not-allowed' : 'pointer', opacity: (isProcessing || !inputText.trim()) ? 0.7 : 1, transition: 'all 0.2s', boxShadow: `0 4px 15px ${currentTheme.shadow}` }}
                >
                  {isProcessing ? <><Loader2 className="animate-spin" size={20} /> Analyzing...</> : <><Send size={20} /> Submit Response</>}
                </button>
              </div>
            </div>
          )}

          {result && (
            <div style={{ animation: 'fadeIn 0.5s ease', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', background: 'rgba(46, 204, 113, 0.1)', borderRadius: '15px', border: '1px solid rgba(46, 204, 113, 0.3)', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                  <h3 style={{ margin: '0', color: '#2ecc71', fontSize: '1.2rem' }}>Evaluation Score</h3>
                  <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>Based on {currentLevel} criteria</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button 
                    onClick={() => {
                      stopAudio();
                      if (result.audioBase64) {
                        const audio = new Audio(`data:audio/mp3;base64,${result.audioBase64}`);
                        audioRef.current = audio;
                        audio.play().catch(e => console.error('Audio play error:', e));
                      } else if (result.useClientTTS && result.spokenText) {
                        const utterance = new SpeechSynthesisUtterance(result.spokenText);
                        window.speechSynthesis.speak(utterance);
                      }
                    }}
                    style={{ background: 'rgba(46, 204, 113, 0.2)', color: '#2ecc71', border: '1px solid rgba(46, 204, 113, 0.5)', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', transition: 'all 0.2s' }}
                    title="Replay AI Voice"
                    onMouseOver={(e) => e.currentTarget.style.background='rgba(46, 204, 113, 0.3)'}
                    onMouseOut={(e) => e.currentTarget.style.background='rgba(46, 204, 113, 0.2)'}
                  >
                    <Volume2 size={18} /> Replay
                  </button>
                  <button 
                    onClick={stopAudio}
                    style={{ background: 'rgba(231, 76, 60, 0.2)', color: '#e74c3c', border: '1px solid rgba(231, 76, 60, 0.5)', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', transition: 'all 0.2s' }}
                    title="Stop AI Voice"
                    onMouseOver={(e) => e.currentTarget.style.background='rgba(231, 76, 60, 0.3)'}
                    onMouseOut={(e) => e.currentTarget.style.background='rgba(231, 76, 60, 0.2)'}
                  >
                    <VolumeX size={18} /> Stop
                  </button>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2ecc71', textShadow: '0 0 10px rgba(46,204,113,0.3)', marginLeft: '10px' }}>
                    {result.score}
                  </div>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px' }}>
                <h4 style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 8px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Your Input:</h4>
                <p style={{ margin: 0, fontStyle: 'italic', fontSize: '1.1rem', color: '#fff' }}>"{result.userInput}"</p>
              </div>

              <div style={{ background: 'rgba(243, 156, 18, 0.1)', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #f39c12' }}>
                <h4 style={{ color: '#f39c12', margin: '0 0 8px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Mistakes Identified:</h4>
                <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: '1.5', color: '#fff' }}>{result.feedback}</p>
              </div>

              <div style={{ background: 'rgba(46, 204, 113, 0.1)', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #2ecc71' }}>
                <h4 style={{ color: '#2ecc71', margin: '0 0 8px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Improved Version:</h4>
                <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '500', color: '#fff' }}>{result.correctedText}</p>
              </div>

              <div style={{ background: 'rgba(155, 89, 182, 0.1)', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #9b59b6' }}>
                <h4 style={{ color: '#9b59b6', margin: '0 0 8px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Explanation (English):</h4>
                <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: '1.5', color: '#fff' }}>{result.explanationEnglish}</p>
              </div>

              <div style={{ background: 'rgba(231, 76, 60, 0.1)', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #e74c3c' }}>
                <h4 style={{ color: '#e74c3c', margin: '0 0 8px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Explanation (Tamil):</h4>
                <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: '1.5', color: '#fff' }}>{result.explanationTamil}</p>
              </div>

              <div style={{ background: 'rgba(52, 152, 219, 0.1)', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #3498db' }}>
                <h4 style={{ color: '#3498db', margin: '0 0 8px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Explanation (Hindi):</h4>
                <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: '1.5', color: '#fff' }}>{result.explanationHindi}</p>
              </div>

              <button 
                onClick={loadNewTask}
                style={{ marginTop: '10px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '28px', padding: '15px', fontSize: '1.1rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseOver={(e) => e.target.style.background='rgba(255,255,255,0.2)'} 
                onMouseOut={(e) => e.target.style.background='rgba(255,255,255,0.1)'}
              >
                Practice Another Task
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
