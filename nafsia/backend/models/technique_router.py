class TechniqueRouter:

    SYSTEM_PROMPTS = {
        "CBT": "You are using Cognitive Behavioral Therapy. Gently identify and challenge cognitive distortions. Use Socratic questioning. Acknowledge feelings first, then examine the thought underneath. Ask: What evidence do you have for that thought? Is there another way to see this situation?",
        "DBT": "You are using Dialectical Behavior Therapy. Validate the emotion fully before anything else. Then introduce exactly ONE grounding technique: 5-4-3-2-1 sensory or box breathing. One technique only. Say: That feeling makes complete sense. Let us try something together.",
        "MI": "You are using Motivational Interviewing. Ask open-ended questions. Reflect ambivalence. Help the user articulate their own reasons for growth. Do not give advice. Ask: What would things look like if they were going well? What matters most to you right now?",
        "ROGERIAN": "You are using person-centered Rogerian listening. Make this person feel completely heard. Reflect feelings accurately and warmly. Unconditional positive regard. No solutions unless asked. Say: It sounds like you are carrying a lot right now. I hear you.",
    }

    COLORS = {
        "CBT": "#4A9EFF",
        "DBT": "#FF6B35",
        "MI": "#00FFB2",
        "ROGERIAN": "#A855F7"
    }

    def select_technique(self, emotion, emotion_score, stress_label, psycho, risk_score) -> dict:
        distortions = psycho.get("cognitive_distortions", [])
        fragment_rate = psycho.get("fragment_rate", 0.0)
        pronoun_density = psycho.get("pronoun_density", 0.0)

        if any(d in distortions for d in ["catastrophizing", "black_white_thinking", "self_blame"]):
            t = "CBT"
            reason = f"Distortions detected: {distortions}"
        elif emotion in ["fear", "anger"] and fragment_rate > 0.3:
            t = "DBT"
            reason = "Emotional dysregulation with fragmented speech"
        elif emotion in ["neutral", "joy"] and pronoun_density > 0.15 and risk_score > 3.0:
            t = "MI"
            reason = "High self-focus beneath neutral surface"
        else:
            t = "ROGERIAN"
            reason = "Raw distress — unconditional positive regard first"

        return {
            "technique": t,
            "reason": reason,
            "color": self.COLORS[t],
            "system_prompt_addition": self.SYSTEM_PROMPTS[t]
        }

    def get_system_prompt_addition(self, technique: str) -> str:
        return self.SYSTEM_PROMPTS.get(technique, self.SYSTEM_PROMPTS["ROGERIAN"])


if __name__ == "__main__":
    r = TechniqueRouter()
    print("CBT:", r.select_technique("sadness", 0.9, "stressed", {"cognitive_distortions": ["catastrophizing"], "fragment_rate": 0.2, "pronoun_density": 0.1}, 6.5)["technique"])
    print("DBT:", r.select_technique("fear", 0.85, "stressed", {"cognitive_distortions": [], "fragment_rate": 0.5, "pronoun_density": 0.1}, 5.5)["technique"])
    print("MI:", r.select_technique("neutral", 0.7, "not_stressed", {"cognitive_distortions": [], "fragment_rate": 0.1, "pronoun_density": 0.25}, 4.0)["technique"])
    print("ROGERIAN:", r.select_technique("sadness", 0.92, "stressed", {"cognitive_distortions": [], "fragment_rate": 0.1, "pronoun_density": 0.08}, 7.0)["technique"])
