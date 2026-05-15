import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Mic, Square, Loader2, ArrowLeft, Send, Volume2, VolumeX } from 'lucide-react';
import '../index.css';

const TRANSCRIBE_URL = 'http://localhost:3000/api/transcribe';
const SPEAK_FREE_URL = 'http://localhost:3000/api/speak-free';

export default function SpeakFreePage() {
  const navigate = useNavigate();
  
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
    return () => stopAudio();
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        stopAudio();
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
            const response = await axios.post(TRANSCRIBE_URL, formData);
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
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const response = await axios.post(SPEAK_FREE_URL, {
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

  const handleReset = () => {
    stopAudio();
    setResult(null);
    setInputText('');
  };

  return (
    <div className="auth-page-wrapper" style={{ backgroundImage: 'linear-gradient(-45deg, #11998e, #38ef7d, #00b09b, #96c93d)' }}>
      <div className="auth-card" style={{ maxWidth: '900px', padding: '30px', display: 'flex', flexDirection: 'column', backgroundColor: 'rgba(10, 15, 30, 0.8)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
        
        <header style={{ position: 'relative', width: '100%', textAlign: 'center', marginBottom: '20px' }}>
          <button 
            onClick={() => navigate('/mode')} 
            style={{ position: 'absolute', top: '0px', left: '0', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <ArrowLeft size={24} /> <span style={{fontSize: '14px', fontWeight: '500'}}>Back</span>
          </button>
          <h1 style={{ fontSize: '2.5rem', margin: '0 0 10px 0', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>Speak Free</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem' }}>Have a free-flowing conversation with your AI English Tutor</p>
        </header>

        <div style={{ flex: 1, width: '100%', background: 'rgba(0,0,0,0.2)', padding: '25px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {!result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', borderLeft: '4px solid #38ef7d' }}>
                 <p style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>Click the microphone icon and say whatever comes to mind! Practice talking about your day, expressing your opinions, or describing something you love.</p>
              </div>

              <textarea 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your thought here or click the mic to speak..."
                style={{ width: '100%', minHeight: '150px', padding: '15px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '1.1rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                onFocus={(e) => e.target.style.borderColor = '#38ef7d'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
              />
              
              <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                <button 
                  onClick={toggleRecording}
                  disabled={isProcessing}
                  title="Speech to Text"
                  style={{ 
                    width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    borderRadius: '50%', border: 'none', background: isRecording ? '#e74c3c' : 'rgba(255,255,255,0.1)',
                    color: '#fff', cursor: isProcessing ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                    boxShadow: isRecording ? '0 0 15px rgba(231,76,60,0.5)' : 'none'
                  }}
                  onMouseOver={(e) => { if(!isRecording && !isProcessing) e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
                  onMouseOut={(e) => { if(!isRecording && !isProcessing) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                >
                  {isRecording ? <Square fill="currentColor" size={28} /> : <Mic size={28} />}
                </button>
                
                <button 
                  onClick={handleSubmit}
                  disabled={isProcessing || !inputText.trim()}
                  style={{ flex: 1, background: 'linear-gradient(135deg, #11998e, #38ef7d)', color: '#fff', border: 'none', borderRadius: '30px', fontSize: '1.2rem', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: (isProcessing || !inputText.trim()) ? 'not-allowed' : 'pointer', opacity: (isProcessing || !inputText.trim()) ? 0.7 : 1, transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(56, 239, 125, 0.3)' }}
                >
                  {isProcessing ? <><Loader2 className="animate-spin" size={24} /> Processing...</> : <><Send size={24} /> Submit</>}
                </button>
              </div>
            </div>
          )}

          {result && (
            <div style={{ animation: 'fadeIn 0.5s ease', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
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
                  style={{ background: 'rgba(56, 239, 125, 0.2)', color: '#38ef7d', border: '1px solid rgba(56, 239, 125, 0.5)', borderRadius: '8px', padding: '8px 15px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 'bold' }}
                  title="Replay AI Voice"
                  onMouseOver={(e) => e.currentTarget.style.background='rgba(56, 239, 125, 0.3)'}
                  onMouseOut={(e) => e.currentTarget.style.background='rgba(56, 239, 125, 0.2)'}
                >
                  <Volume2 size={20} /> Replay Audio
                </button>
                <button 
                  onClick={stopAudio}
                  style={{ background: 'rgba(231, 76, 60, 0.2)', color: '#e74c3c', border: '1px solid rgba(231, 76, 60, 0.5)', borderRadius: '8px', padding: '8px 15px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 'bold' }}
                  title="Stop AI Voice"
                  onMouseOver={(e) => e.currentTarget.style.background='rgba(231, 76, 60, 0.3)'}
                  onMouseOut={(e) => e.currentTarget.style.background='rgba(231, 76, 60, 0.2)'}
                >
                  <VolumeX size={20} /> Stop Audio
                </button>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px' }}>
                <h4 style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 8px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>You Said:</h4>
                <p style={{ margin: 0, fontStyle: 'italic', fontSize: '1.1rem', color: '#fff' }}>"{result.userInput}"</p>
              </div>

              {result.correctedSentence && (
                <div style={{ background: 'rgba(46, 204, 113, 0.1)', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #2ecc71' }}>
                  <h4 style={{ color: '#2ecc71', margin: '0 0 8px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Improved Version:</h4>
                  <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '500', color: '#fff' }}>{result.correctedSentence}</p>
                </div>
              )}

              {(result.explanationEnglish || result.explanationTamil || result.explanationHindi) && (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(243, 156, 18, 0.1)', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #f39c12' }}>
                   {result.explanationEnglish && (
                     <div>
                       <h4 style={{ color: '#f39c12', margin: '0 0 5px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Grammar Feedback:</h4>
                       <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: '1.5', color: '#fff' }}>{result.explanationEnglish}</p>
                     </div>
                   )}
                   {result.explanationTamil && (
                     <div>
                       <h4 style={{ color: '#e67e22', margin: '10px 0 5px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Tamil Explanation:</h4>
                       <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: '1.5', color: '#fff' }}>{result.explanationTamil}</p>
                     </div>
                   )}
                   {result.explanationHindi && (
                     <div>
                       <h4 style={{ color: '#3498db', margin: '10px 0 5px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Hindi Explanation:</h4>
                       <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: '1.5', color: '#fff' }}>{result.explanationHindi}</p>
                     </div>
                   )}
                 </div>
              )}

              <div style={{ background: 'rgba(52, 152, 219, 0.1)', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #3498db' }}>
                <h4 style={{ color: '#3498db', margin: '0 0 8px 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Tutor Says:</h4>
                <p style={{ margin: '0 0 10px 0', fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>{result.encouragement}</p>
                <p style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>{result.nextQuestion}</p>
              </div>

              <button 
                onClick={handleReset}
                style={{ marginTop: '10px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '28px', padding: '15px', fontSize: '1.1rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseOver={(e) => e.target.style.background='rgba(255,255,255,0.2)'} 
                onMouseOut={(e) => e.target.style.background='rgba(255,255,255,0.1)'}
              >
                Continue Speaking
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
