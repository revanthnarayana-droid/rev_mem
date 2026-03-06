from transformers import pipeline

_suicide_pipeline = None
CRISIS_TERMS = [
    "suicidal",
    "want to die",
    "planning to die",
    "plan to die",
    "end my life",
    "kill myself",
    "take my life",
    "better off dead",
    "no reason to live",
    "no reason to keep going",
    "i am planning to die",
]


def get_suicide_pipeline():
    global _suicide_pipeline
    if _suicide_pipeline is None:
        print("[NAFSIA] Loading suicide risk detector...")
        _suicide_pipeline = pipeline(
            "text-classification",
            model="gohjiayi/suicidal-bert",
        )
    return _suicide_pipeline


def detect_suicide_risk_heuristic(text: str) -> dict:
    text_lower = text.lower()
    matched = any(term in text_lower for term in CRISIS_TERMS)
    strong = any(
        term in text_lower
        for term in [
            "planning to die",
            "plan to die",
            "kill myself",
            "end my life",
            "take my life",
        ]
    )
    score = 0.98 if strong else (0.9 if matched else 0.04)
    return {
        "label": "suicidal" if matched else "non_suicidal",
        "score": score,
        "risk_contribution": score if matched else 0.002,
    }


def detect_suicide_risk(text: str) -> dict:
    heuristic = detect_suicide_risk_heuristic(text)
    if heuristic["label"] == "suicidal":
        return heuristic
    try:
        result = get_suicide_pipeline()(text)[0]
        raw_label = str(result["label"]).strip().lower()
        score = round(float(result["score"]), 4)
        suicidal = raw_label in {"1", "label_1", "suicidal", "suicide"}
        return {
            "label": "suicidal" if suicidal else "non_suicidal",
            "score": score,
            "risk_contribution": score if suicidal else round(score * 0.05, 4),
        }
    except Exception as exc:
        print(f"[NAFSIA] Suicide detector fallback: {exc}")
        return heuristic


if __name__ == "__main__":
    tests = [
        "I had a normal day and I feel okay",
        "I feel hopeless and I want to die",
        "I am planning to end my life",
    ]
    for text in tests:
        print(f"TEXT: {text}")
        print(f"  => {detect_suicide_risk(text)}")
        print()
