def compute_risk_score(emotion_risk: float, stress_risk: float, psycho_risk: float) -> float:
    raw = (emotion_risk * 0.40) + (stress_risk * 0.35) + (psycho_risk * 0.25)
    return round(min(10.0, max(0.0, raw * 10)), 2)


def get_risk_tier(score: float) -> dict:
    if score < 4.0:
        return {"tier": "safe", "label": "Safe", "color": "#00FFB2", "action": "Monitor passively", "bg": "#FFFFFF"}
    if score < 6.0:
        return {"tier": "watch", "label": "Watch", "color": "#FFDD00", "action": "Watch closely", "bg": "#FFFDE7"}
    if score < 7.5:
        return {"tier": "concern", "label": "Concern", "color": "#FF6B35", "action": "Send Tier 2 alert", "bg": "#FFF3E0"}
    return {"tier": "crisis", "label": "Crisis", "color": "#FF4444", "action": "Send Tier 3 alarm", "bg": "#FFEBEE"}


def compute_full_risk(emotion_result: dict, stress_result: dict, psycho_result: dict) -> dict:
    e = emotion_result.get("risk_contribution", 0.0)
    s = stress_result.get("risk_contribution", 0.0)
    p = psycho_result.get("risk_contribution", 0.0)
    score = compute_risk_score(e, s, p)
    return {
        "risk_score": score,
        "risk_tier": get_risk_tier(score),
        "breakdown": {
            "emotion": round(e * 0.4, 4),
            "stress": round(s * 0.35, 4),
            "psycho": round(p * 0.25, 4)
        }
    }


if __name__ == "__main__":
    print(compute_risk_score(0.9, 0.85, 0.7))   # expect ~8.3
    print(get_risk_tier(7.8))                    # expect crisis
    print(compute_risk_score(0.1, 0.05, 0.0))   # expect ~1.2
