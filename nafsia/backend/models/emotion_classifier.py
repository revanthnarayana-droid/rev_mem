from transformers import pipeline

_classifier = None


def get_classifier():
    global _classifier
    if _classifier is None:
        print("[NAFSIA] Loading GoEmotions classifier...")
        _classifier = pipeline(
            "text-classification",
            model="j-hartmann/emotion-english-distilroberta-base",
            return_all_scores=True,
        )
    return _classifier


def classify_emotion(text: str) -> dict:
    raw = get_classifier()(text)
    results = normalize_results(raw)
    scores = {r["label"]: round(r["score"], 4) for r in results}
    top = max(results, key=lambda x: x["score"])
    return {
        "top_emotion": top["label"],
        "top_score": round(top["score"], 4),
        "all_scores": scores,
        "risk_contribution": round(
            map_emotion_to_risk(top["label"], top["score"]), 4
        ),
    }


def normalize_results(raw) -> list[dict]:
    if isinstance(raw, list):
        if raw and isinstance(raw[0], dict):
            return raw
        if raw and isinstance(raw[0], list):
            return raw[0]
    raise TypeError(f"Unexpected classifier output shape: {type(raw).__name__}: {raw!r}")


def map_emotion_to_risk(emotion: str, score: float) -> float:
    weights = {
        "sadness": 0.9,
        "fear": 0.8,
        "anger": 0.7,
        "disgust": 0.5,
        "surprise": 0.2,
        "neutral": 0.1,
        "joy": 0.0,
    }
    return min(1.0, score * weights.get(emotion, 0.1))


if __name__ == "__main__":
    tests = [
        "I am feeling great today",
        "I always fail at everything",
        "I am worthless and nobody cares",
        "I feel completely hopeless and nobody cares about me",
    ]
    for t in tests:
        r = classify_emotion(t)
        print(f"TEXT: {t}")
        print(f"  => {r['top_emotion']} ({r['top_score']}) risk: {r['risk_contribution']}")
        print()
