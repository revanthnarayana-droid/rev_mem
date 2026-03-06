import { useState } from "react";
import LoginScreen from "./screens/LoginScreen";
import MoodCheckIn from "./screens/MoodCheckIn";
import PatientChat from "./screens/PatientChat";
import CounselorDashboard from "./screens/CounselorDashboard";
import { startSession } from "./api/nafsia";

function generateSessionId() {
  return "sess-" + Math.random().toString(36).substr(2, 9);
}

export default function App() {
  const [screen, setScreen] = useState("login");
  const [role, setRole] = useState(null);
  const [sessionId] = useState(generateSessionId);
  const [patientMood, setPatientMood] = useState(null);

  async function handleLogin(selectedRole) {
    setRole(selectedRole);
    if (selectedRole === "patient") setScreen("moodcheckin");
    else setScreen("counselor");
  }

  async function handleMoodSelected(mood, baselineScore) {
    setPatientMood(mood);
    await startSession(sessionId, mood, baselineScore).catch(console.error);
    setScreen("chat");
  }

  return (
    <div style={{ fontFamily: "'Georgia', serif" }}>
      <style>{`
        :root {
          --nafsia-ink: #ecf3ff;
          --nafsia-muted: #8ea0bf;
          --nafsia-panel: rgba(13, 19, 35, 0.78);
          --nafsia-line: rgba(153, 173, 214, 0.14);
          --nafsia-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
        }
        * { box-sizing: border-box; }
        html, body, #root { margin: 0; min-height: 100%; }
        body {
          background:
            radial-gradient(circle at top left, rgba(74, 144, 226, 0.16), transparent 28%),
            radial-gradient(circle at top right, rgba(197, 163, 255, 0.14), transparent 24%),
            linear-gradient(180deg, #07101d 0%, #0a1222 52%, #050913 100%);
          color: var(--nafsia-ink);
        }
        button, input, textarea { font: inherit; }
      `}</style>
      {screen === "login" && <LoginScreen onLogin={handleLogin} />}
      {screen === "moodcheckin" && (
        <MoodCheckIn sessionId={sessionId} onMoodSelected={handleMoodSelected} />
      )}
      {screen === "chat" && (
        <PatientChat sessionId={sessionId} patientMood={patientMood} />
      )}
      {screen === "counselor" && (
        <CounselorDashboard counselorSessionId={sessionId} />
      )}
    </div>
  );
}
