from transformers import pipeline

_stress_pipeline = None


def get_stress_pipeline():
    global _stress_pipeline
    if _stress_pipeline is None:
        print("[NAFSIA] Loading stress detector...")
        _stress_pipeline = pipeline(
            "text-classification",
            model="andreagasparini/ModernBERT-base-stress"
        )
    return _stress_pipeline


def detect_stress(text: str) -> dict:
    result = get_stress_pipeline()(text)[0]
    raw_label = result["label"]
    score = round(result["score"], 4)
    label_key = raw_label.strip().lower()
    if label_key in {"label_1", "stress", "stressed", "1"}:
        label = "stressed"
    elif label_key in {"label_0", "not_stress", "not stressed", "unstressed", "0"}:
        label = "not_stressed"
    elif "stress" in label_key and "not" not in label_key and "non" not in label_key:
        label = "stressed"
    else:
        label = "not_stressed"
    risk_contribution = min(1.0, score) if label == "stressed" else round(score * 0.05, 4)
    return {
        "label": label,
        "intensity": score,
        "risk_contribution": round(risk_contribution, 4)
    }


if __name__ == "__main__":
    tests = [
        "Everything is fine, I had a good day",
        "I cannot handle this anymore, the pressure is crushing me",
        "I am so overwhelmed I cannot think straight",
        "Just a normal Tuesday, nothing special",
    ]
    for t in tests:
        print(f"TEXT: {t}")
        print(f"  => {detect_stress(t)}")
        print()
