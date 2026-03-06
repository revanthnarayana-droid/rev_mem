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
    <div style={{ fontFamily: "Georgia, serif" }}>
      {screen === "login" && <LoginScreen onLogin={handleLogin} />}
      {screen === "moodcheckin" && <MoodCheckIn sessionId={sessionId} onMoodSelected={handleMoodSelected} />}
      {screen === "chat" && <PatientChat sessionId={sessionId} patientMood={patientMood} />}
      {screen === "counselor" && <CounselorDashboard counselorSessionId={sessionId} />}
    </div>
  );
}
