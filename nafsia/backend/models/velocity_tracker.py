from typing import List


class VelocityTracker:

    def compute_velocity(self, history: List[float]) -> float:
        if len(history) < 2:
            return 0.0
        return round(max(-1.0, min(1.0, history[-1] - history[-2])), 4)

    def compute_acceleration(self, history: List[float]) -> float:
        if len(history) < 3:
            return 0.0
        v1 = history[-2] - history[-3]
        v2 = history[-1] - history[-2]
        return round(max(-1.0, min(1.0, v2 - v1)), 4)

    def compute_trend(self, history: List[float]) -> str:
        if len(history) < 3:
            return "insufficient_data"
        avg = (history[-1] - history[-3]) / 2
        if avg > 0.15:
            return "deteriorating"
        if avg < -0.15:
            return "improving"
        return "stable"

    def should_alert(self, history: List[float], current: float) -> dict:
        v = self.compute_velocity(history)
        a = self.compute_acceleration(history)
        trend = self.compute_trend(history)
        if current >= 7.5:
            return {"alert": True, "reason": "Crisis threshold reached", "severity": "critical"}
        if current >= 6.0 and v >= 0.3:
            return {"alert": True, "reason": "Rapid deterioration detected", "severity": "high"}
        if a >= 0.4:
            return {"alert": True, "reason": "Accelerating emotional collapse", "severity": "high"}
        if trend == "deteriorating" and current >= 4.0:
            return {"alert": True, "reason": "Sustained downward trend", "severity": "medium"}
        return {"alert": False, "reason": "Within safe parameters", "severity": "none"}

    def get_arrow(self, velocity: float) -> str:
        if velocity > 0.2:
            return "FALLING"
        if velocity > 0.05:
            return "DECLINING"
        if velocity < -0.2:
            return "IMPROVING"
        if velocity < -0.05:
            return "RECOVERING"
        return "STABLE"

    def full_analysis(self, history: List[float]) -> dict:
        if not history:
            return {
                "velocity": 0.0, "acceleration": 0.0, "trend": "insufficient_data",
                "arrow": "STABLE", "alert": False, "alert_reason": "", "alert_severity": "none",
                "score_history": [], "messages_analyzed": 0
            }
        current = history[-1]
        v = self.compute_velocity(history)
        a = self.compute_acceleration(history)
        alert = self.should_alert(history, current)
        return {
            "velocity": v, "acceleration": a,
            "trend": self.compute_trend(history),
            "arrow": self.get_arrow(v),
            "alert": alert["alert"],
            "alert_reason": alert["reason"],
            "alert_severity": alert["severity"],
            "score_history": history,
            "messages_analyzed": len(history)
        }


if __name__ == "__main__":
    t = VelocityTracker()
    print("DETERIORATING:", t.full_analysis([2.0, 3.1, 4.8, 6.2, 7.1]))
    print("STABLE:",        t.full_analysis([4.0, 3.8, 4.2, 3.9, 4.1]))
    print("IMPROVING:",     t.full_analysis([7.0, 6.2, 5.1, 4.0, 3.2]))
    print("SPIRAL:",        t.full_analysis([3.0, 3.2, 3.6, 4.2, 5.1]))
