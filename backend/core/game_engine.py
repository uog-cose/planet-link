"""Reusable server-side scoring rules for benchmark-style games."""
from __future__ import annotations

import math
import random
import re
from typing import Any

GAME_TYPES = {
    "reaction": {"label": "Reaction", "unit": "ms"},
    "sequence": {"label": "Sequence Memory", "unit": "level"},
    "number_memory": {"label": "Number Memory", "unit": "digits"},
    "visual_memory": {"label": "Visual Memory", "unit": "squares"},
    "typing": {"label": "Typing", "unit": "WPM"},
}

DEFAULT_RANGES = [
    {"min": 80, "max": 100, "xp": 100},
    {"min": 60, "max": 79, "xp": 75},
    {"min": 40, "max": 59, "xp": 50},
    {"min": 20, "max": 39, "xp": 25},
    {"min": 0, "max": 19, "xp": 10},
]

TYPING_TEXT = (
    "Small steps can build strong habits. Keep learning, stay curious, "
    "and choose actions that move you towards the future you want."
)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def normalise_reaction(milliseconds: float) -> float:
    # Reaction scoring is deliberately stricter and easier to understand:
    # 250 ms represents a top-tier result and 550 ms the lower scoring floor.
    # Faster client values are capped so timing tricks cannot exceed 100%.
    return clamp((550.0 - milliseconds) / 300.0 * 100.0, 0.0, 100.0)


def normalise_linear(value: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return clamp((value - low) / (high - low) * 100.0, 0.0, 100.0)


def ranges_are_valid(ranges: Any) -> bool:
    if not isinstance(ranges, list) or not ranges:
        return False
    try:
        clean = sorted(
            [{"min": int(x["min"]), "max": int(x["max"]), "xp": int(x["xp"])} for x in ranges],
            key=lambda x: x["min"], reverse=True,
        )
    except (KeyError, TypeError, ValueError):
        return False
    if clean[0]["max"] != 100 or clean[-1]["min"] != 0:
        return False
    return all(
        0 <= x["min"] <= x["max"] <= 100 and x["xp"] >= 0
        and (i == len(clean) - 1 or x["min"] == clean[i + 1]["max"] + 1)
        for i, x in enumerate(clean)
    )


def xp_for_performance(performance: float, ranges: Any, default_xp: int) -> int:
    value = int(round(clamp(performance, 0, 100)))
    clean = ranges if ranges_are_valid(ranges) else DEFAULT_RANGES
    for row in sorted(clean, key=lambda x: int(x["min"]), reverse=True):
        if int(row["min"]) <= value <= int(row["max"]):
            return max(0, min(5000, int(row["xp"])))
    return max(0, min(5000, int(default_xp)))



def default_game_scoring(game_type: str, game_config: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    cfg = game_config if isinstance(game_config, dict) else {}
    difficulty = max(1, int(cfg.get("difficulty", 6) or 6))
    digits = int(cfg.get("digits", 7) or 7)
    if game_type == "reaction":
        return [{"maxMs": 250, "xp": 100}, {"maxMs": 300, "xp": 80}, {"maxMs": 350, "xp": 60}, {"maxMs": 400, "xp": 45}, {"maxMs": 450, "xp": 30}, {"maxMs": 5000, "xp": 15}]
    if game_type == "sequence":
        return [{"min": difficulty, "xp": 100}, {"min": max(6, difficulty - 2), "xp": 80}, {"min": max(6, difficulty - 4), "xp": 60}, {"min": 6, "xp": 30}]
    if game_type == "number_memory":
        return [{"min": digits, "xp": 100}, {"min": max(4, digits - 1), "xp": 80}, {"min": max(4, digits - 2), "xp": 55}, {"min": 4, "xp": 25}]
    if game_type == "visual_memory":
        size = int(cfg.get("gridSize", 4) or 4)
        count = int(cfg.get("targetCount", max(3, size)) or max(3, size))
        return [{"min": count, "xp": 100}, {"min": max(2, count - 1), "xp": 70}, {"min": 2, "xp": 35}]
    if game_type == "typing":
        return [{"minWpm": 80, "xp": 100}, {"minWpm": 65, "xp": 80}, {"minWpm": 50, "xp": 60}, {"minWpm": 35, "xp": 40}, {"minWpm": 20, "xp": 20}]
    return DEFAULT_RANGES.copy()

def game_specific_xp(game_type: str, raw_score: float, game_config: dict[str, Any] | None, fallback_ranges: Any, default_xp: int) -> int:
    cfg = game_config if isinstance(game_config, dict) else {}
    scoring = cfg.get("scoring")
    rows = scoring if isinstance(scoring, list) and scoring else default_game_scoring(game_type, cfg)
    try:
        clean = [dict(r) for r in rows if isinstance(r, dict) and int(r.get("xp", -1)) >= 0]
    except (TypeError, ValueError):
        clean = []
    if not clean:
        return xp_for_performance(0, fallback_ranges, default_xp)
    if game_type == "reaction":
        for row in sorted(clean, key=lambda x: float(x.get("maxMs", 999999))):
            if raw_score <= float(row.get("maxMs", 999999)):
                return max(0, min(5000, int(row.get("xp", 0))))
    elif game_type in {"sequence", "number_memory", "visual_memory"}:
        for row in sorted(clean, key=lambda x: int(x.get("min", 0)), reverse=True):
            if raw_score >= int(row.get("min", 0)):
                return max(0, min(5000, int(row.get("xp", 0))))
    elif game_type == "typing":
        for row in sorted(clean, key=lambda x: float(x.get("minWpm", 0)), reverse=True):
            if raw_score >= float(row.get("minWpm", 0)):
                return max(0, min(5000, int(row.get("xp", 0))))
    return 0

def make_challenge(game_type: str, config: dict[str, Any] | None = None) -> dict[str, Any]:
    config = config if isinstance(config, dict) else {}
    if game_type == "reaction":
        return {"gameType": game_type, "minDelayMs": 900, "maxDelayMs": 2200}
    if game_type == "sequence":
        level = max(1, min(16, int(config.get("difficulty", 6) or 6)))
        rng = random.SystemRandom()
        # Sequence memory uses a 4x4 board. Every displayed position is unique
        # within a round so the player never sees the same tile flash twice.
        sequence = rng.sample(range(16), level)
        return {"gameType": game_type, "sequence": sequence, "gridSize": 4, "visibleCount": 0}
    if game_type == "number_memory":
        digits = int(clamp(int(config.get("digits", 7)), 4, 12))
        number = "".join(str(random.SystemRandom().randrange(10)) for _ in range(digits))
        return {"gameType": game_type, "number": number}
    if game_type == "visual_memory":
        size = int(clamp(int(config.get("gridSize", 4)), 3, 6))
        count = int(clamp(int(config.get("targetCount", max(3, size))), 2, size * size - 1))
        cells = list(range(size * size))
        random.SystemRandom().shuffle(cells)
        return {"gameType": game_type, "gridSize": size, "targets": sorted(cells[:count])}
    if game_type == "typing":
        return {"gameType": game_type, "text": str(config.get("text") or TYPING_TEXT)[:500]}
    raise ValueError("Unsupported game type")


def score_attempt(game_type: str, challenge: dict[str, Any], result: dict[str, Any]) -> tuple[float, str, float]:
    """Return raw score, unit, and 0..100 performance. Raises ValueError on invalid results."""
    if game_type == "reaction":
        ms = float(result.get("milliseconds"))
        if not 80 <= ms <= 5000:
            raise ValueError("Reaction time is outside the valid range")
        return ms, "ms", normalise_reaction(ms)

    if game_type == "sequence":
        expected = challenge.get("sequence")
        answer = result.get("sequence")
        if not isinstance(expected, list) or not isinstance(answer, list):
            raise ValueError("Invalid sequence result")
        grid_size = int(challenge.get("gridSize", 4) or 4)
        cell_count = max(1, grid_size * grid_size)
        if len(answer) > len(expected) or len(set(int(a) for a in answer)) != len(answer) or any(int(a) not in range(cell_count) for a in answer):
            raise ValueError("Invalid sequence result")
        correct = 0
        for a, b in zip(answer, expected):
            if int(a) != int(b):
                break
            correct += 1
        if correct != len(expected):
            # Sequence games award the last fully completed level, not partial credit.
            return float(correct), "level", normalise_linear(correct, 0, max(1, len(expected)))
        return float(len(expected)), "level", 100.0

    if game_type == "number_memory":
        expected = str(challenge.get("number", ""))
        answer = re.sub(r"\D", "", str(result.get("number", "")))
        if not expected or len(answer) > 20:
            raise ValueError("Invalid number result")
        correct_prefix = 0
        for a, b in zip(answer, expected):
            if a != b:
                break
            correct_prefix += 1
        if answer == expected:
            return float(len(expected)), "digits", normalise_linear(len(expected), 4, 12)
        return float(correct_prefix), "digits", normalise_linear(correct_prefix, 4, 12)

    if game_type == "visual_memory":
        targets = {int(x) for x in challenge.get("targets", [])}
        selected_raw = result.get("selected")
        if not isinstance(selected_raw, list):
            raise ValueError("Invalid visual memory result")
        try:
            selected = {int(x) for x in selected_raw}
        except (TypeError, ValueError):
            raise ValueError("Invalid visual memory result")
        size = int(challenge.get("gridSize", 4))
        if any(x < 0 or x >= size * size for x in selected):
            raise ValueError("Invalid visual memory result")
        correct = len(selected & targets)
        mistakes = len(selected - targets)
        if correct + mistakes > size * size:
            raise ValueError("Invalid visual memory result")
        performance = clamp((correct - mistakes * 0.75) / max(1, len(targets)) * 100, 0, 100)
        return float(correct), "squares", performance

    if game_type == "typing":
        text = str(challenge.get("text", ""))
        typed = str(result.get("text", ""))[: max(0, len(text) + 50)]
        duration_ms = float(result.get("durationMs"))
        if not 1500 <= duration_ms <= 300000:
            raise ValueError("Typing duration is outside the valid range")
        chars = min(len(typed), len(text))
        correct = sum(1 for i in range(chars) if typed[i] == text[i])
        accuracy = correct / max(1, len(text))
        wpm = (correct / 5.0) / (duration_ms / 60000.0)
        wpm = clamp(wpm, 0, 200)
        performance = clamp(normalise_linear(wpm, 20, 80) * (0.65 + 0.35 * accuracy), 0, 100)
        return round(wpm, 2), "WPM", performance

    raise ValueError("Unsupported game type")
