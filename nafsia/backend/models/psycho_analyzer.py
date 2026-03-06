import spacy
from typing import List

nlp = spacy.load("en_core_web_sm")

ABSOLUTIST_WORDS = {
    "always", "never", "everyone", "no one", "nothing", "everything",
    "completely", "totally", "impossible", "forever", "nobody", "worthless"
}

DISTORTION_PATTERNS = {
    "catastrophizing": [
        "always", "never", "everything", "nothing", "worst", "disaster",
        "ruined", "hopeless", "forever", "completely ruined"
    ],
    "self_blame": [
        "my fault", "i ruin", "i failed", "i am useless", "i am worthless",
        "because of me", "i always mess", "i ruined"
    ],
    "mind_reading": [
        "they think", "everyone thinks", "nobody cares", "they hate",
        "they judge", "people think"
    ],
    "hopelessness": [
        "no point", "give up", "cannot go on", "no reason",
        "what is the point", "does not matter anymore",
        "nothing will change", "pointless", "why bother"
    ],
    "black_white_thinking": [
        "either", "or nothing", "perfect or", "all or nothing",
        "complete failure", "never right", "always wrong"
    ],
}


class PsychoAnalyzer:

    def analyze(self, text: str) -> dict:
        doc = nlp(text.lower())
        tokens = [t for t in doc if not t.is_space]
        sentences = list(doc.sents)
        word_count = max(len(tokens), 1)
        text_lower = text.lower()

        pronoun_density = self._pronoun_density(tokens, word_count)
        fragment_rate = self._fragment_rate(sentences)
        temporal_focus = self._temporal_focus(doc)
        lexical_density = self._lexical_density(tokens, word_count)
        distortions = self._cognitive_distortions(text_lower)
        absolutist_score = self._absolutist_score(tokens, word_count)

        risk = (
            pronoun_density * 0.20 +
            fragment_rate * 0.15 +
            len(distortions) * 0.15 +
            absolutist_score * 0.30 +
            (0.20 if temporal_focus == "past" else 0.0)
        )

        return {
            "pronoun_density": round(pronoun_density, 4),
            "fragment_rate": round(fragment_rate, 4),
            "temporal_focus": temporal_focus,
            "lexical_density": round(lexical_density, 4),
            "cognitive_distortions": distortions,
            "absolutist_score": round(absolutist_score, 4),
            "risk_contribution": round(min(1.0, risk), 4)
        }

    def _pronoun_density(self, tokens, wc):
        first_p = {"i", "me", "my", "myself", "mine"}
        return sum(1 for t in tokens if t.text in first_p) / wc

    def _fragment_rate(self, sents):
        if not sents:
            return 0.0
        frags = sum(1 for s in sents if len([t for t in s if not t.is_space]) < 4)
        return frags / len(sents)

    def _temporal_focus(self, doc):
        past = sum(1 for t in doc if t.tag_ in ("VBD", "VBN"))
        future = sum(1 for t in doc if t.lemma_ in {"will", "going", "tomorrow", "soon", "future", "next"})
        present = sum(1 for t in doc if t.lemma_ in {"now", "today", "currently"})
        if past >= future and past >= present:
            return "past"
        if future > present:
            return "future"
        return "present"

    def _lexical_density(self, tokens, wc):
        return len(set(t.lemma_ for t in tokens if t.is_alpha)) / wc

    def _cognitive_distortions(self, text_lower: str) -> List[str]:
        return [
            d for d, patterns in DISTORTION_PATTERNS.items()
            if any(p in text_lower for p in patterns)
        ]

    def _absolutist_score(self, tokens, wc):
        return min(1.0, sum(1 for t in tokens if t.text in ABSOLUTIST_WORDS) / wc * 10)


if __name__ == "__main__":
    a = PsychoAnalyzer()
    samples = [
        "I am fine",
        "I always fail. Everything I do is wrong. I never get anything right. It is my fault.",
        "I do not know. I just. I cannot explain it. Nothing feels real.",
        "Nobody cares. What is the point. Nothing will change.",
    ]
    for s in samples:
        r = a.analyze(s)
        print(f"TEXT: {s}")
        print(f"  Distortions: {r['cognitive_distortions']}")
        print(f"  Risk contribution: {r['risk_contribution']}")
        print()
